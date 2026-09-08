import { randomUUID } from 'crypto';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { EventStatus, PayoutStatus } from '@prisma/client';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { AuthService } from '../src/auth/auth.service';
import { EventsService } from '../src/events/events.service';
import { TicketTypesService } from '../src/ticket-types/ticket-types.service';
import { PrismaService } from '../src/prisma/prisma.service';

// The overview endpoint aggregates across every organization on the platform
// (no organizationId filter, by design — docs/SPEC.md §10.4). Because the
// e2e suite runs test files in parallel Jest workers against one shared
// PostgreSQL database (no --runInBand, see backend/package.json), asserting
// an *absolute* total here would be flaky — another file's fixtures could be
// live at the same time. Every correctness assertion below instead takes a
// snapshot before creating known fixtures and asserts the delta, the same
// way a bank statement is checked by "balance after minus balance before"
// rather than by asserting the whole balance.
describe('Admin Finance — finances plateforme (e2e)', () => {
  let app: INestApplication;
  let authService: AuthService;
  let eventsService: EventsService;
  let ticketTypesService: TicketTypesService;
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
    prisma = moduleFixture.get(PrismaService);
  });

  afterAll(async () => {
    const users = (
      await Promise.all(createdUserEmails.map((email) => prisma.user.findFirst({ where: { email } })))
    ).filter((u): u is NonNullable<typeof u> => u !== null);
    const userIds = users.map((u) => u.id);
    const organizations = await prisma.organization.findMany({ where: { ownerUserId: { in: userIds } } });
    const organizationIds = organizations.map((o) => o.id);
    const events = await prisma.event.findMany({ where: { organizationId: { in: organizationIds } } });
    const eventIds = events.map((e) => e.id);
    const orders = await prisma.order.findMany({ where: { eventId: { in: eventIds } } });
    const orderIds = orders.map((o) => o.id);
    const orderItems = await prisma.orderItem.findMany({ where: { orderId: { in: orderIds } } });
    const orderItemIds = orderItems.map((oi) => oi.id);

    // Dependents before parents (CLAUDE.md FK cascade gotcha): tickets ->
    // order_items -> orders/payouts -> ticket_types/events -> organizations/users.
    await prisma.ticket.deleteMany({ where: { orderItemId: { in: orderItemIds } } });
    await prisma.orderItem.deleteMany({ where: { orderId: { in: orderIds } } });
    await prisma.order.deleteMany({ where: { eventId: { in: eventIds } } });
    await prisma.payout.deleteMany({ where: { eventId: { in: eventIds } } });
    await prisma.ticketType.deleteMany({ where: { eventId: { in: eventIds } } });
    await prisma.event.deleteMany({ where: { id: { in: eventIds } } });
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
      fullName: 'Fatou Diop',
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

  async function createPublishedEvent(organizationId: string, userId: string, startAt = '2030-01-01T18:00:00.000Z') {
    const unique = randomUUID();
    const category = await prisma.eventCategory.findFirstOrThrow({ where: { isActive: true } });
    const event = await eventsService.create(organizationId, userId, {
      name: 'Festival Finance Test',
      slug: `festival-finance-test-${unique}`,
      address: 'Route de la Corniche, Dakar',
      categoryId: category.id,
      startAt,
      endAt: '2030-01-01T23:00:00.000Z',
    });
    await seedImage(event.id);
    await seedTicketType(event.id);
    return eventsService.update(organizationId, event.id, { status: EventStatus.PUBLISHED });
  }

  // Publishing now also requires at least one ticket type (events.e2e-spec.ts
  // covers the rule itself) — this file only cares about finance totals.
  function seedTicketType(eventId: string) {
    return prisma.ticketType.create({
      data: {
        eventId,
        name: 'Standard',
        price: 5000,
        quantityTotal: 100,
        saleStart: '2019-01-01T00:00:00.000Z',
        saleEnd: '2019-12-31T23:59:59.000Z',
      },
    });
  }

  function createPaidOrder(eventId: string, subtotalAmount: number) {
    const serviceFeeAmount = Math.round(subtotalAmount * 0.05);
    return prisma.order.create({
      data: {
        eventId,
        buyerEmail: `buyer-${randomUUID()}@example.com`,
        status: 'PAID',
        subtotalAmount,
        serviceFeeAmount,
        totalAmount: subtotalAmount + serviceFeeAmount,
        expiresAt: new Date('2020-01-01T00:00:00.000Z'),
      },
    });
  }

  function createPendingOrder(eventId: string, subtotalAmount: number) {
    const serviceFeeAmount = Math.round(subtotalAmount * 0.05);
    return prisma.order.create({
      data: {
        eventId,
        buyerEmail: `buyer-${randomUUID()}@example.com`,
        status: 'PENDING',
        subtotalAmount,
        serviceFeeAmount,
        totalAmount: subtotalAmount + serviceFeeAmount,
        expiresAt: new Date(Date.now() + 15 * 60 * 1000),
      },
    });
  }

  async function fetchOverview(accessToken: string) {
    const res = await request(app.getHttpServer())
      .get('/admin/finance/overview')
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);
    return res.body;
  }

  it('rejects the overview endpoint for an unauthenticated caller', async () => {
    await request(app.getHttpServer()).get('/admin/finance/overview').expect(401);
  });

  it('rejects the overview endpoint for a non-super-admin organizer', async () => {
    const { accessToken } = await registerOrganizer();

    await request(app.getHttpServer())
      .get('/admin/finance/overview')
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(403);
  });

  it('adds only PAID orders into gmv/organizerRevenue/platformCommission, ignores PENDING', async () => {
    const admin = await registerOrganizer();
    await promoteToSuperAdmin(admin.userId);
    const org = await registerOrganizer();
    const event = await createPublishedEvent(org.organizationId, org.userId);

    const before = await fetchOverview(admin.accessToken);

    await createPaidOrder(event.id, 1000); // fee 50, total 1050
    await createPaidOrder(event.id, 2000); // fee 100, total 2100
    await createPendingOrder(event.id, 5000); // excluded

    const after = await fetchOverview(admin.accessToken);

    expect(after.organizerRevenue - before.organizerRevenue).toBe(3000);
    expect(after.platformCommission - before.platformCommission).toBe(150);
    expect(after.gmv - before.gmv).toBe(3150);
    expect(after.paidOrdersCount - before.paidOrdersCount).toBe(2);
  });

  it('mixed payout statuses: PAID sums into totalPaidOut, PENDING/PROCESSING into totalPending, FAILED listed with its reason and never summed', async () => {
    const admin = await registerOrganizer();
    await promoteToSuperAdmin(admin.userId);
    const org = await registerOrganizer();
    const paidEvent = await createPublishedEvent(org.organizationId, org.userId);
    const pendingEvent = await createPublishedEvent(org.organizationId, org.userId);
    const failedEvent = await createPublishedEvent(org.organizationId, org.userId);

    const before = await fetchOverview(admin.accessToken);

    await prisma.payout.create({
      data: { organizationId: org.organizationId, eventId: paidEvent.id, amountDue: 4000, amountPaid: 4000, status: PayoutStatus.PAID },
    });
    await prisma.payout.create({
      data: { organizationId: org.organizationId, eventId: pendingEvent.id, amountDue: 1500, status: PayoutStatus.PROCESSING },
    });
    await prisma.payout.create({
      data: {
        organizationId: org.organizationId,
        eventId: failedEvent.id,
        amountDue: 900,
        status: PayoutStatus.FAILED,
        rawResponse: { error: 'missing payout_phone_number' },
      },
    });

    const after = await fetchOverview(admin.accessToken);

    expect(after.payouts.totalPaidOut - before.payouts.totalPaidOut).toBe(4000);
    expect(after.payouts.totalPending - before.payouts.totalPending).toBe(1500);

    const failedRow = after.payouts.failedPayouts.find((p: { eventId: string }) => p.eventId === failedEvent.id);
    expect(failedRow).toMatchObject({
      eventId: failedEvent.id,
      eventName: failedEvent.name,
      organizationId: org.organizationId,
      organizationName: expect.any(String),
      amountDue: 900,
      errorMessage: 'missing payout_phone_number',
    });
    // FAILED never contributes to either sum.
    expect(after.payouts.totalPaidOut - before.payouts.totalPaidOut).not.toBe(4900);
    expect(after.payouts.totalPending - before.payouts.totalPending).not.toBe(2400);
  });

  it('counts an ended event with a PAID order but no payouts row yet ("live due") into totalPending', async () => {
    const admin = await registerOrganizer();
    await promoteToSuperAdmin(admin.userId);
    const org = await registerOrganizer();
    const endedEventCategory = await prisma.eventCategory.findFirstOrThrow({ where: { isActive: true } });
    const endedEvent = await eventsService.create(org.organizationId, org.userId, {
      name: 'Festival Deja Termine',
      slug: `festival-deja-termine-${randomUUID()}`,
      address: 'Route de la Corniche, Dakar',
      categoryId: endedEventCategory.id,
      startAt: '2020-01-01T18:00:00.000Z',
      endAt: '2020-01-01T23:00:00.000Z',
    });
    await seedImage(endedEvent.id);
    await seedTicketType(endedEvent.id);
    await eventsService.update(org.organizationId, endedEvent.id, { status: EventStatus.PUBLISHED });

    const before = await fetchOverview(admin.accessToken);
    await createPaidOrder(endedEvent.id, 2500);
    const after = await fetchOverview(admin.accessToken);

    expect(after.payouts.totalPending - before.payouts.totalPending).toBe(2500);
  });

  it('buckets a newly created organization and event into the current month of the 6-month growth trend', async () => {
    const admin = await registerOrganizer();
    await promoteToSuperAdmin(admin.userId);

    const before = await fetchOverview(admin.accessToken);
    const currentMonth = new Date().toISOString().slice(0, 7);
    const beforeBucket = before.growth.find((g: { month: string }) => g.month === currentMonth);

    const org = await registerOrganizer();
    await createPublishedEvent(org.organizationId, org.userId);

    const after = await fetchOverview(admin.accessToken);
    const afterBucket = after.growth.find((g: { month: string }) => g.month === currentMonth);

    expect(after.growth).toHaveLength(6);
    expect(afterBucket.newOrganizations - beforeBucket.newOrganizations).toBe(1);
    expect(afterBucket.newEvents - beforeBucket.newEvents).toBe(1);
  });

  it('buckets a backdated organization into its own month, not the current one', async () => {
    const admin = await registerOrganizer();
    await promoteToSuperAdmin(admin.userId);
    const org = await registerOrganizer();

    const twoMonthsAgo = new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth() - 2, 15));
    await prisma.organization.update({ where: { id: org.organizationId }, data: { createdAt: twoMonthsAgo } });
    const targetMonth = twoMonthsAgo.toISOString().slice(0, 7);
    const currentMonth = new Date().toISOString().slice(0, 7);

    const overview = await fetchOverview(admin.accessToken);
    const targetBucket = overview.growth.find((g: { month: string }) => g.month === targetMonth);
    const currentBucket = overview.growth.find((g: { month: string }) => g.month === currentMonth);

    expect(targetBucket.newOrganizations).toBeGreaterThanOrEqual(1);
    // The org itself must not double-count in the current month's bucket —
    // can't assert currentBucket.newOrganizations === 0 (parallel workers
    // may create other orgs this month), only that backdating moved it out.
    expect(targetBucket).not.toBe(currentBucket);
  });

  it('counts a ticket tied to a PAID order into ticketsSold for the current month', async () => {
    const admin = await registerOrganizer();
    await promoteToSuperAdmin(admin.userId);
    const org = await registerOrganizer();
    const event = await createPublishedEvent(org.organizationId, org.userId);
    const now = new Date();
    const ticketType = await ticketTypesService.create(org.organizationId, event.id, {
      name: 'Standard',
      price: 1000,
      quantityTotal: 10,
      saleStart: new Date(now.getTime() - 60_000).toISOString(),
      saleEnd: new Date(now.getTime() + 60 * 60_000).toISOString(),
    });

    const currentMonth = now.toISOString().slice(0, 7);
    const before = await fetchOverview(admin.accessToken);
    const beforeBucket = before.growth.find((g: { month: string }) => g.month === currentMonth);

    const order = await createPaidOrder(event.id, 1000);
    const orderItem = await prisma.orderItem.create({
      data: { orderId: order.id, ticketTypeId: ticketType.id, quantity: 1, unitPrice: 1000, subtotal: 1000 },
    });
    await prisma.ticket.create({
      data: { orderItemId: orderItem.id, ticketTypeId: ticketType.id, qrToken: randomUUID(), status: 'VALID' },
    });

    const after = await fetchOverview(admin.accessToken);
    const afterBucket = after.growth.find((g: { month: string }) => g.month === currentMonth);

    expect(afterBucket.ticketsSold - beforeBucket.ticketsSold).toBe(1);
  });
});
