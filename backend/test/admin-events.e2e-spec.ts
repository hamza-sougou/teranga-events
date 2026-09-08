import { randomUUID } from 'crypto';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { EventStatus } from '@prisma/client';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { AuthService } from '../src/auth/auth.service';
import { EventsService } from '../src/events/events.service';
import { PrismaService } from '../src/prisma/prisma.service';

describe('Admin Events — modération plateforme (e2e)', () => {
  let app: INestApplication;
  let authService: AuthService;
  let eventsService: EventsService;
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
    prisma = moduleFixture.get(PrismaService);
  });

  afterAll(async () => {
    // Two passes: audit_logs.actor_user_id can point at the admin account
    // even for a log row scoped to a *different* test organization (the
    // target being moderated) — every log tied to any created user/org must
    // be gone before any of those users/orgs are deleted, regardless of
    // push order in createdUserEmails.
    const users = (
      await Promise.all(createdUserEmails.map((email) => prisma.user.findFirst({ where: { email } })))
    ).filter((u): u is NonNullable<typeof u> => u !== null);
    const userIds = users.map((u) => u.id);
    const organizations = await prisma.organization.findMany({ where: { ownerUserId: { in: userIds } } });
    const organizationIds = organizations.map((o) => o.id);
    const eventIds = (await prisma.event.findMany({ where: { organizationId: { in: organizationIds } } })).map(
      (e) => e.id,
    );

    await prisma.order.deleteMany({ where: { eventId: { in: eventIds } } });
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

  async function createEvent(organizationId: string, userId: string, name: string, startAt: string) {
    const unique = randomUUID();
    const category = await prisma.eventCategory.findFirstOrThrow({ where: { isActive: true } });
    return eventsService.create(organizationId, userId, {
      name,
      slug: `${name.toLowerCase().replace(/\s+/g, '-')}-${unique}`,
      address: 'Route de la Corniche, Dakar',
      categoryId: category.id,
      startAt,
      endAt: new Date(new Date(startAt).getTime() + 5 * 60 * 60 * 1000).toISOString(),
    });
  }

  async function createPublishedEvent(organizationId: string, userId: string, name: string, startAt: string) {
    const event = await createEvent(organizationId, userId, name, startAt);
    await seedImage(event.id);
    await seedTicketType(event.id);
    return eventsService.update(organizationId, event.id, { status: EventStatus.PUBLISHED });
  }

  function createPaidOrder(eventId: string) {
    return prisma.order.create({
      data: {
        eventId,
        buyerEmail: `buyer-${randomUUID()}@example.com`,
        status: 'PAID',
        subtotalAmount: 1000,
        serviceFeeAmount: 50,
        totalAmount: 1050,
        expiresAt: new Date('2020-01-01T00:00:00.000Z'),
      },
    });
  }

  it('rejects the list endpoint for an unauthenticated caller', async () => {
    await request(app.getHttpServer()).get('/admin/events').expect(401);
  });

  it('rejects the list and cancel endpoints for a non-super-admin organizer', async () => {
    const { accessToken, organizationId, userId } = await registerOrganizer();
    const event = await createPublishedEvent(organizationId, userId, 'Festival Repousse', '2030-06-01T18:00:00.000Z');

    await request(app.getHttpServer())
      .get('/admin/events')
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(403);

    await request(app.getHttpServer())
      .patch(`/admin/events/${event.id}/cancel`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(403);
  });

  it('lists events across organizations and applies status/organizationId/date/search filters', async () => {
    const admin = await registerOrganizer();
    await promoteToSuperAdmin(admin.userId);
    const orgA = await registerOrganizer();
    const orgB = await registerOrganizer();

    const eventA = await createPublishedEvent(orgA.organizationId, orgA.userId, 'Concert Unique Alpha', '2030-03-01T18:00:00.000Z');
    const eventB = await createEvent(orgB.organizationId, orgB.userId, 'Soiree Beta Draft', '2030-04-01T18:00:00.000Z');

    const all = await request(app.getHttpServer())
      .get('/admin/events')
      .set('Authorization', `Bearer ${admin.accessToken}`)
      .expect(200);
    const allIds = all.body.map((e: { id: string }) => e.id);
    expect(allIds).toEqual(expect.arrayContaining([eventA.id, eventB.id]));

    const byOrg = await request(app.getHttpServer())
      .get(`/admin/events?organizationId=${orgA.organizationId}`)
      .set('Authorization', `Bearer ${admin.accessToken}`)
      .expect(200);
    expect(byOrg.body.map((e: { id: string }) => e.id)).toEqual([eventA.id]);

    const byStatus = await request(app.getHttpServer())
      .get('/admin/events?status=DRAFT')
      .set('Authorization', `Bearer ${admin.accessToken}`)
      .expect(200);
    expect(byStatus.body.map((e: { id: string }) => e.id)).toEqual(expect.arrayContaining([eventB.id]));
    expect(byStatus.body.map((e: { id: string }) => e.id)).not.toEqual(expect.arrayContaining([eventA.id]));

    const bySearch = await request(app.getHttpServer())
      .get('/admin/events?q=Alpha')
      .set('Authorization', `Bearer ${admin.accessToken}`)
      .expect(200);
    expect(bySearch.body.map((e: { id: string }) => e.id)).toEqual([eventA.id]);

    const byDate = await request(app.getHttpServer())
      .get('/admin/events?from=2030-03-15T00:00:00.000Z')
      .set('Authorization', `Bearer ${admin.accessToken}`)
      .expect(200);
    expect(byDate.body.map((e: { id: string }) => e.id)).toEqual(expect.arrayContaining([eventB.id]));
    expect(byDate.body.map((e: { id: string }) => e.id)).not.toEqual(expect.arrayContaining([eventA.id]));
  });

  it('cancels a published event, notifies paid buyers, and logs an audit entry', async () => {
    const admin = await registerOrganizer();
    await promoteToSuperAdmin(admin.userId);
    const org = await registerOrganizer();
    const event = await createPublishedEvent(org.organizationId, org.userId, 'Festival A Annuler', '2030-05-01T18:00:00.000Z');
    const order = await createPaidOrder(event.id);

    const res = await request(app.getHttpServer())
      .patch(`/admin/events/${event.id}/cancel`)
      .set('Authorization', `Bearer ${admin.accessToken}`)
      .send({ reason: 'Signalement fraude confirmé' })
      .expect(200);

    expect(res.body.status).toBe('CANCELLED');

    const refreshed = await prisma.event.findUniqueOrThrow({ where: { id: event.id } });
    expect(refreshed.status).toBe('CANCELLED');

    const notification = await prisma.notification.findFirst({ where: { orderId: order.id, type: 'cancellation' } });
    expect(notification).toBeTruthy();

    const auditLog = await prisma.auditLog.findFirst({
      where: { entityType: 'event', entityId: event.id, action: 'event.admin_cancelled' },
    });
    expect(auditLog).toBeTruthy();
    expect(auditLog?.actorUserId).toBe(admin.userId);
    expect((auditLog?.metadata as { reason?: string } | null)?.reason).toBe('Signalement fraude confirmé');

    await prisma.notification.deleteMany({ where: { orderId: order.id } });
  });

  it('treats re-cancelling an already-cancelled event as a harmless no-op, same as the organizer-facing endpoint', async () => {
    const admin = await registerOrganizer();
    await promoteToSuperAdmin(admin.userId);
    const org = await registerOrganizer();
    const event = await createPublishedEvent(org.organizationId, org.userId, 'Festival Deja Annule', '2030-05-02T18:00:00.000Z');
    await eventsService.update(org.organizationId, event.id, { status: EventStatus.CANCELLED });

    const res = await request(app.getHttpServer())
      .patch(`/admin/events/${event.id}/cancel`)
      .set('Authorization', `Bearer ${admin.accessToken}`)
      .expect(200);
    expect(res.body.status).toBe('CANCELLED');
  });

  it('rejects cancelling a COMPLETED event — a terminal state with no outgoing transitions', async () => {
    const admin = await registerOrganizer();
    await promoteToSuperAdmin(admin.userId);
    const org = await registerOrganizer();
    const event = await createPublishedEvent(org.organizationId, org.userId, 'Festival Termine', '2030-05-03T18:00:00.000Z');
    await eventsService.update(org.organizationId, event.id, { status: EventStatus.COMPLETED });

    await request(app.getHttpServer())
      .patch(`/admin/events/${event.id}/cancel`)
      .set('Authorization', `Bearer ${admin.accessToken}`)
      .expect(400);
  });
});
