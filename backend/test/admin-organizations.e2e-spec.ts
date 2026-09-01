import { randomUUID } from 'crypto';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { EventStatus } from '@prisma/client';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { AuthService } from '../src/auth/auth.service';
import { EventsService } from '../src/events/events.service';
import { TicketTypesService } from '../src/ticket-types/ticket-types.service';
import { PayoutsService } from '../src/payouts/payouts.service';
import { PaydunyaProvider } from '../src/payments/providers/paydunya.provider';
import { PrismaService } from '../src/prisma/prisma.service';

describe('Admin Organizations — validation des organisateurs (e2e)', () => {
  let app: INestApplication;
  let authService: AuthService;
  let eventsService: EventsService;
  let ticketTypesService: TicketTypesService;
  let payoutsService: PayoutsService;
  let paydunyaProvider: PaydunyaProvider;
  let prisma: PrismaService;
  const createdUserEmails: string[] = [];

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();

    authService = moduleFixture.get(AuthService);
    eventsService = moduleFixture.get(EventsService);
    ticketTypesService = moduleFixture.get(TicketTypesService);
    payoutsService = moduleFixture.get(PayoutsService);
    paydunyaProvider = moduleFixture.get(PaydunyaProvider);
    prisma = moduleFixture.get(PrismaService);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  afterAll(async () => {
    // Same two-pass reasoning as admin-events.e2e-spec.ts: audit_logs.actor_user_id
    // can point at the admin account for a log row scoped to a *different*
    // test organization — clear every log tied to any created user/org
    // before deleting any of those users/orgs.
    const users = (
      await Promise.all(createdUserEmails.map((email) => prisma.user.findFirst({ where: { email } })))
    ).filter((u): u is NonNullable<typeof u> => u !== null);
    const userIds = users.map((u) => u.id);
    const organizations = await prisma.organization.findMany({ where: { ownerUserId: { in: userIds } } });
    const organizationIds = organizations.map((o) => o.id);
    const eventIds = (await prisma.event.findMany({ where: { organizationId: { in: organizationIds } } })).map(
      (e) => e.id,
    );

    // orders reference events without cascade — must go first, same FK
    // cascade gotcha as payouts.e2e-spec.ts.
    await prisma.order.deleteMany({ where: { eventId: { in: eventIds } } });
    await prisma.payout.deleteMany({ where: { eventId: { in: eventIds } } });
    await prisma.auditLog.deleteMany({
      where: { OR: [{ actorUserId: { in: userIds } }, { organizationId: { in: organizationIds } }] },
    });
    await prisma.organization.deleteMany({ where: { id: { in: organizationIds } } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    await app.close();
  });

  async function registerOrganizer() {
    const unique = randomUUID();
    const email = `organizer-${unique}@example.com`;
    createdUserEmails.push(email);

    const { user, accessToken } = await authService.register({
      email,
      password: 'super-secret-password',
      fullName: 'Amadou Ba',
      passwordConfirmation: 'super-secret-password',
      marketingOptIn: false,
      termsAccepted: true,
    });
    const organization = await prisma.organization.findFirstOrThrow({ where: { ownerUserId: user.id } });
    return { organizationId: organization.id, userId: user.id, accessToken };
  }

  async function promoteToSuperAdmin(userId: string) {
    await prisma.user.update({ where: { id: userId }, data: { isSuperAdmin: true } });
  }

  // Publishing requires at least one image (events.e2e-spec.ts covers the
  // rule itself) — seed one directly, this file isn't testing that rule.
  function seedImage(eventId: string) {
    return prisma.eventMedia.create({
      data: {
        eventId,
        type: 'IMAGE',
        storageKey: `test/${eventId}.jpg`,
        url: `https://example.com/test/${eventId}.jpg`,
        mimeType: 'image/jpeg',
        sizeBytes: 1024,
      },
    });
  }

  async function createPublishedEvent(organizationId: string, userId: string) {
    const unique = randomUUID();
    const event = await eventsService.create(organizationId, userId, {
      name: 'Festival Admin Test',
      slug: `festival-admin-test-${unique}`,
      startAt: '2030-01-01T18:00:00.000Z',
      endAt: '2030-01-01T23:00:00.000Z',
    });
    await seedImage(event.id);
    await eventsService.update(organizationId, event.id, { status: EventStatus.PUBLISHED });
    return event;
  }

  function createPaidOrder(eventId: string, subtotalAmount: number) {
    return prisma.order.create({
      data: {
        eventId,
        buyerEmail: `buyer-${randomUUID()}@example.com`,
        status: 'PAID',
        subtotalAmount,
        serviceFeeAmount: Math.round(subtotalAmount * 0.05),
        totalAmount: subtotalAmount + Math.round(subtotalAmount * 0.05),
        expiresAt: new Date('2020-01-01T00:00:00.000Z'),
      },
    });
  }

  function createPendingOrder(eventId: string, subtotalAmount: number) {
    return prisma.order.create({
      data: {
        eventId,
        buyerEmail: `buyer-${randomUUID()}@example.com`,
        status: 'PENDING',
        subtotalAmount,
        serviceFeeAmount: Math.round(subtotalAmount * 0.05),
        totalAmount: subtotalAmount + Math.round(subtotalAmount * 0.05),
        expiresAt: new Date(Date.now() + 15 * 60 * 1000),
      },
    });
  }

  it('rejects the list endpoint for an unauthenticated caller', async () => {
    await request(app.getHttpServer()).get('/admin/organizations').expect(401);
  });

  it('rejects the list endpoint for a non-super-admin organizer', async () => {
    const { accessToken } = await registerOrganizer();

    await request(app.getHttpServer())
      .get('/admin/organizations')
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(403);
  });

  it('rejects the verification action for a non-super-admin organizer', async () => {
    const { accessToken, organizationId } = await registerOrganizer();

    await request(app.getHttpServer())
      .patch(`/admin/organizations/${organizationId}/verification`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ isVerified: true })
      .expect(403);
  });

  it('lists organizations with event count, sales volume (PAID orders only) and default unverified status', async () => {
    const { accessToken, organizationId, userId } = await registerOrganizer();
    await promoteToSuperAdmin(userId);

    const event = await createPublishedEvent(organizationId, userId);
    await createPaidOrder(event.id, 1000);
    await createPaidOrder(event.id, 2000);
    await createPendingOrder(event.id, 5000);

    const res = await request(app.getHttpServer())
      .get('/admin/organizations')
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);

    const row = res.body.find((o: { id: string }) => o.id === organizationId);
    expect(row).toBeTruthy();
    expect(row.isVerified).toBe(false);
    expect(row.eventsCount).toBe(1);
    expect(row.salesVolume).toBe(3000);
    expect(row.owner).toMatchObject({ fullName: 'Amadou Ba' });
  });

  it('toggles isVerified true then false, isolated to the targeted organization', async () => {
    const admin = await registerOrganizer();
    await promoteToSuperAdmin(admin.userId);
    const other = await registerOrganizer();

    const verifyRes = await request(app.getHttpServer())
      .patch(`/admin/organizations/${other.organizationId}/verification`)
      .set('Authorization', `Bearer ${admin.accessToken}`)
      .send({ isVerified: true })
      .expect(200);
    expect(verifyRes.body.isVerified).toBe(true);

    const adminOrg = await prisma.organization.findUniqueOrThrow({ where: { id: admin.organizationId } });
    expect(adminOrg.isVerified).toBe(false);

    const rejectRes = await request(app.getHttpServer())
      .patch(`/admin/organizations/${other.organizationId}/verification`)
      .set('Authorization', `Bearer ${admin.accessToken}`)
      .send({ isVerified: false })
      .expect(200);
    expect(rejectRes.body.isVerified).toBe(false);
  });

  describe('suspension de compte — effet réel, pas juste le champ', () => {
    function createOnSaleTicketType(organizationId: string, eventId: string, quantityTotal = 10) {
      const now = new Date();
      return ticketTypesService.create(organizationId, eventId, {
        name: 'Standard',
        price: 1000,
        quantityTotal,
        saleStart: new Date(now.getTime() - 60_000).toISOString(),
        saleEnd: new Date(now.getTime() + 60 * 60_000).toISOString(),
      });
    }

    function mockCreateInvoice() {
      return jest.spyOn(paydunyaProvider, 'createInvoice').mockResolvedValue({
        token: `token-${randomUUID()}`,
        paymentUrl: 'https://paydunya.test/checkout/fake',
        status: 'pending',
      });
    }

    async function createEndedPublishedEvent(organizationId: string, userId: string) {
      const unique = randomUUID();
      const event = await eventsService.create(organizationId, userId, {
        name: 'Festival Deja Termine',
        slug: `festival-deja-termine-${unique}`,
        startAt: '2020-01-01T18:00:00.000Z',
        endAt: '2020-01-01T23:00:00.000Z',
      });
      await seedImage(event.id);
      return eventsService.update(organizationId, event.id, { status: EventStatus.PUBLISHED });
    }

    it('rejects the suspension action for a non-super-admin organizer', async () => {
      const { accessToken, organizationId } = await registerOrganizer();

      await request(app.getHttpServer())
        .patch(`/admin/organizations/${organizationId}/suspension`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ suspended: true })
        .expect(403);
    });

    it('freezes every org-scoped action for the OWNER, hides the public event page, blocks checkout, and skips payout eligibility — reactivation restores all four', async () => {
      const admin = await registerOrganizer();
      await promoteToSuperAdmin(admin.userId);
      const org = await registerOrganizer();
      const publishedEvent = await createPublishedEvent(org.organizationId, org.userId);
      const endedEvent = await createEndedPublishedEvent(org.organizationId, org.userId);
      const ticketType = await createOnSaleTicketType(org.organizationId, publishedEvent.id);
      await createPaidOrder(endedEvent.id, 1000);
      await prisma.organization.update({
        where: { id: org.organizationId },
        data: { payoutPhoneNumber: '221771234567' },
      });
      const disburseSpy = jest
        .spyOn(paydunyaProvider, 'disburse')
        .mockResolvedValue({ transactionId: 'txn-suspension-test', responseText: 'ok' });

      const suspendRes = await request(app.getHttpServer())
        .patch(`/admin/organizations/${org.organizationId}/suspension`)
        .set('Authorization', `Bearer ${admin.accessToken}`)
        .send({ suspended: true, reason: 'Fraude signalée' })
        .expect(200);
      expect(suspendRes.body.id).toBe(org.organizationId);

      const auditLog = await prisma.auditLog.findFirst({
        where: { entityType: 'organization', entityId: org.organizationId, action: 'organization.suspended' },
      });
      expect(auditLog).toBeTruthy();
      expect(auditLog?.actorUserId).toBe(admin.userId);

      // (1) The OWNER, still ACTIVE, is rejected on an org-scoped route.
      await request(app.getHttpServer())
        .get(`/organizations/${org.organizationId}/events`)
        .set('Authorization', `Bearer ${org.accessToken}`)
        .expect(403);

      // (2) The public event page 404s.
      await request(app.getHttpServer()).get(`/events/${publishedEvent.slug}`).expect(404);

      // (3) Checkout is rejected as if the event didn't exist.
      mockCreateInvoice();
      await request(app.getHttpServer())
        .post('/orders')
        .send({
          eventId: publishedEvent.id,
          buyerEmail: 'buyer@example.com',
          paymentChannel: 'MOBILE_MONEY',
          items: [{ ticketTypeId: ticketType.id, quantity: 1 }],
        })
        .expect(404);

      // (4) Payout eligibility skips the ended event while the organization is suspended.
      const skippedResult = await payoutsService.runPayoutForEvent(endedEvent.id);
      expect(skippedResult).toMatchObject({ eventId: endedEvent.id, skipped: 'organization suspended' });
      expect(disburseSpy).not.toHaveBeenCalled();
      const payout = await prisma.payout.findUnique({ where: { eventId: endedEvent.id } });
      expect(payout).toBeNull();

      // Reactivation restores all four.
      await request(app.getHttpServer())
        .patch(`/admin/organizations/${org.organizationId}/suspension`)
        .set('Authorization', `Bearer ${admin.accessToken}`)
        .send({ suspended: false })
        .expect(200);

      await request(app.getHttpServer())
        .get(`/organizations/${org.organizationId}/events`)
        .set('Authorization', `Bearer ${org.accessToken}`)
        .expect(200);

      await request(app.getHttpServer()).get(`/events/${publishedEvent.slug}`).expect(200);

      const restoredResult = await payoutsService.runPayoutForEvent(endedEvent.id);
      expect(restoredResult).toMatchObject({ eventId: endedEvent.id, paid: 1000 });
      expect(disburseSpy).toHaveBeenCalledWith('221771234567', expect.any(Number));
    });
  });
});
