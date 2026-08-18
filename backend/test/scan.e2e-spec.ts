import { randomUUID } from 'crypto';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { EventStatus } from '@prisma/client';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { AuthService } from '../src/auth/auth.service';
import { EventsService } from '../src/events/events.service';
import { TicketTypesService } from '../src/ticket-types/ticket-types.service';
import { PrismaService } from '../src/prisma/prisma.service';

describe('Scan — contrôle d\'accès (e2e)', () => {
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
    for (const email of createdUserEmails) {
      const user = await prisma.user.findFirst({ where: { email } });
      if (!user) continue;
      const organizations = await prisma.organization.findMany({ where: { ownerUserId: user.id } });
      const eventIds = (
        await prisma.event.findMany({ where: { organizationId: { in: organizations.map((o) => o.id) } } })
      ).map((e) => e.id);
      // scans.ticket_id has no cascade — must go before orders (which
      // cascade order_items -> tickets) or that cascade hits a wall.
      await prisma.scan.deleteMany({ where: { ticket: { orderItem: { order: { eventId: { in: eventIds } } } } } });
      await prisma.order.deleteMany({ where: { eventId: { in: eventIds } } });
      await prisma.payout.deleteMany({ where: { eventId: { in: eventIds } } });
      await prisma.organization.deleteMany({ where: { ownerUserId: user.id } });
      await prisma.user.delete({ where: { id: user.id } });
    }
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
      organizationName: 'Amadou Events',
      organizationSlug: `amadou-events-${unique}`,
    });
    const organization = await prisma.organization.findFirstOrThrow({ where: { ownerUserId: user.id } });
    return { organizationId: organization.id, userId: user.id, accessToken };
  }

  async function createEvent(
    organizationId: string,
    userId: string,
    opts: { status: EventStatus; endAt: string },
  ) {
    const unique = randomUUID();
    const event = await eventsService.create(organizationId, userId, {
      name: 'Festival de Test',
      slug: `festival-de-test-${unique}`,
      startAt: '2020-01-01T18:00:00.000Z',
      endAt: opts.endAt,
    });
    if (opts.status !== EventStatus.DRAFT) {
      await eventsService.update(organizationId, event.id, { status: EventStatus.PUBLISHED });
    }
    if (opts.status === EventStatus.CANCELLED) {
      await eventsService.update(organizationId, event.id, { status: EventStatus.CANCELLED });
    }
    return prisma.event.findUniqueOrThrow({ where: { id: event.id } });
  }

  async function createTicketType(organizationId: string, eventId: string) {
    const now = new Date();
    return ticketTypesService.create(organizationId, eventId, {
      name: 'Standard',
      price: 1000,
      quantityTotal: 10,
      saleStart: new Date(now.getTime() - 60_000).toISOString(),
      saleEnd: new Date(now.getTime() + 60 * 60_000).toISOString(),
    });
  }

  async function createValidTicket(ticketTypeId: string) {
    const ticketType = await prisma.ticketType.findUniqueOrThrow({ where: { id: ticketTypeId } });
    const order = await prisma.order.create({
      data: {
        eventId: ticketType.eventId,
        buyerEmail: 'buyer@example.com',
        status: 'PAID',
        subtotalAmount: 1000,
        serviceFeeAmount: 50,
        totalAmount: 1050,
        expiresAt: new Date(Date.now() - 60_000),
      },
    });
    const orderItem = await prisma.orderItem.create({
      data: { orderId: order.id, ticketTypeId, quantity: 1, unitPrice: 1000, subtotal: 1000 },
    });
    return prisma.ticket.create({
      data: { orderItemId: orderItem.id, ticketTypeId, qrToken: randomUUID(), status: 'VALID' },
    });
  }

  it('scans a valid ticket successfully and marks it USED', async () => {
    const { organizationId, userId, accessToken } = await registerOrganizer();
    const event = await createEvent(organizationId, userId, {
      status: EventStatus.PUBLISHED,
      endAt: '2027-01-01T23:00:00.000Z',
    });
    const ticketType = await createTicketType(organizationId, event.id);
    const ticket = await createValidTicket(ticketType.id);

    const res = await request(app.getHttpServer())
      .post(`/organizations/${organizationId}/events/${event.id}/scan`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ qrToken: ticket.qrToken, gateOrZone: 'Porte A' })
      .expect(200);

    expect(res.body.result).toBe('SUCCESS');
    expect(res.body.ticket.ticketTypeName).toBe('Standard');

    const refreshed = await prisma.ticket.findUniqueOrThrow({ where: { id: ticket.id } });
    expect(refreshed.status).toBe('USED');
    expect(refreshed.usedAt).not.toBeNull();

    const scan = await prisma.scan.findFirstOrThrow({ where: { ticketId: ticket.id } });
    expect(scan.result).toBe('SUCCESS');
    expect(scan.gateOrZone).toBe('Porte A');
  });

  it('rejects a second scan of the same ticket as ALREADY_USED', async () => {
    const { organizationId, userId, accessToken } = await registerOrganizer();
    const event = await createEvent(organizationId, userId, {
      status: EventStatus.PUBLISHED,
      endAt: '2027-01-01T23:00:00.000Z',
    });
    const ticketType = await createTicketType(organizationId, event.id);
    const ticket = await createValidTicket(ticketType.id);

    await request(app.getHttpServer())
      .post(`/organizations/${organizationId}/events/${event.id}/scan`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ qrToken: ticket.qrToken })
      .expect(200);

    const secondScan = await request(app.getHttpServer())
      .post(`/organizations/${organizationId}/events/${event.id}/scan`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ qrToken: ticket.qrToken })
      .expect(200);

    expect(secondScan.body.result).toBe('ALREADY_USED');

    const scans = await prisma.scan.findMany({ where: { ticketId: ticket.id } });
    expect(scans).toHaveLength(2);
    expect(scans.map((s) => s.result).sort()).toEqual(['ALREADY_USED', 'SUCCESS']);
  });

  it('lets only one of two simultaneous scans of the same ticket succeed', async () => {
    const { organizationId, userId, accessToken } = await registerOrganizer();
    const event = await createEvent(organizationId, userId, {
      status: EventStatus.PUBLISHED,
      endAt: '2027-01-01T23:00:00.000Z',
    });
    const ticketType = await createTicketType(organizationId, event.id);
    const ticket = await createValidTicket(ticketType.id);

    const fire = () =>
      request(app.getHttpServer())
        .post(`/organizations/${organizationId}/events/${event.id}/scan`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ qrToken: ticket.qrToken });

    const [first, second] = await Promise.all([fire(), fire()]);
    const results = [first.body.result, second.body.result].sort();

    expect(results).toEqual(['ALREADY_USED', 'SUCCESS']);

    const refreshed = await prisma.ticket.findUniqueOrThrow({ where: { id: ticket.id } });
    expect(refreshed.status).toBe('USED');
    const scans = await prisma.scan.findMany({ where: { ticketId: ticket.id } });
    expect(scans).toHaveLength(2);
  });

  it('returns INVALID for an unknown qrToken and persists no scan row', async () => {
    const { organizationId, userId, accessToken } = await registerOrganizer();
    const event = await createEvent(organizationId, userId, {
      status: EventStatus.PUBLISHED,
      endAt: '2027-01-01T23:00:00.000Z',
    });

    const scanCountBefore = await prisma.scan.count();

    const res = await request(app.getHttpServer())
      .post(`/organizations/${organizationId}/events/${event.id}/scan`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ qrToken: 'this-token-does-not-exist' })
      .expect(200);

    expect(res.body.result).toBe('INVALID');
    expect(res.body.ticket).toBeUndefined();
    const scanCountAfter = await prisma.scan.count();
    expect(scanCountAfter).toBe(scanCountBefore);
  });

  it('rejects a valid ticket from a different event as INVALID, with an audit row', async () => {
    const { organizationId, userId, accessToken } = await registerOrganizer();
    const eventA = await createEvent(organizationId, userId, {
      status: EventStatus.PUBLISHED,
      endAt: '2027-01-01T23:00:00.000Z',
    });
    const eventB = await createEvent(organizationId, userId, {
      status: EventStatus.PUBLISHED,
      endAt: '2027-01-01T23:00:00.000Z',
    });
    const ticketTypeA = await createTicketType(organizationId, eventA.id);
    const ticket = await createValidTicket(ticketTypeA.id);

    const res = await request(app.getHttpServer())
      .post(`/organizations/${organizationId}/events/${eventB.id}/scan`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ qrToken: ticket.qrToken })
      .expect(200);

    expect(res.body.result).toBe('INVALID');
    const refreshed = await prisma.ticket.findUniqueOrThrow({ where: { id: ticket.id } });
    expect(refreshed.status).toBe('VALID'); // not consumed
    const scan = await prisma.scan.findFirstOrThrow({ where: { ticketId: ticket.id } });
    expect(scan.result).toBe('INVALID');
  });

  it('returns EXPIRED_EVENT once the event has ended, without consuming the ticket', async () => {
    const { organizationId, userId, accessToken } = await registerOrganizer();
    const event = await createEvent(organizationId, userId, {
      status: EventStatus.PUBLISHED,
      endAt: '2020-01-02T00:00:00.000Z',
    });
    const ticketType = await createTicketType(organizationId, event.id);
    const ticket = await createValidTicket(ticketType.id);

    const res = await request(app.getHttpServer())
      .post(`/organizations/${organizationId}/events/${event.id}/scan`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ qrToken: ticket.qrToken })
      .expect(200);

    expect(res.body.result).toBe('EXPIRED_EVENT');
    const refreshed = await prisma.ticket.findUniqueOrThrow({ where: { id: ticket.id } });
    expect(refreshed.status).toBe('VALID');
  });

  it('returns INVALID when the event has been cancelled', async () => {
    const { organizationId, userId, accessToken } = await registerOrganizer();
    const event = await createEvent(organizationId, userId, {
      status: EventStatus.CANCELLED,
      endAt: '2027-01-01T23:00:00.000Z',
    });
    const ticketType = await createTicketType(organizationId, event.id);
    const ticket = await createValidTicket(ticketType.id);

    const res = await request(app.getHttpServer())
      .post(`/organizations/${organizationId}/events/${event.id}/scan`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ qrToken: ticket.qrToken })
      .expect(200);

    expect(res.body.result).toBe('INVALID');
  });

  it('rejects a scan attempt from a role that is not authorized to scan', async () => {
    const { organizationId, userId, accessToken } = await registerOrganizer();
    const event = await createEvent(organizationId, userId, {
      status: EventStatus.PUBLISHED,
      endAt: '2027-01-01T23:00:00.000Z',
    });
    const ticketType = await createTicketType(organizationId, event.id);
    const ticket = await createValidTicket(ticketType.id);

    const seller = await registerOrganizer();
    await prisma.organizationMember.create({
      data: { organizationId, userId: seller.userId, role: 'SELLER', status: 'ACTIVE' },
    });

    await request(app.getHttpServer())
      .post(`/organizations/${organizationId}/events/${event.id}/scan`)
      .set('Authorization', `Bearer ${seller.accessToken}`)
      .send({ qrToken: ticket.qrToken })
      .expect(403);

    void accessToken; // owner token unused in this test, kept for setup symmetry
  });

  it('lists scans scoped to the event', async () => {
    const { organizationId, userId, accessToken } = await registerOrganizer();
    const event = await createEvent(organizationId, userId, {
      status: EventStatus.PUBLISHED,
      endAt: '2027-01-01T23:00:00.000Z',
    });
    const ticketType = await createTicketType(organizationId, event.id);
    const ticket = await createValidTicket(ticketType.id);

    await request(app.getHttpServer())
      .post(`/organizations/${organizationId}/events/${event.id}/scan`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ qrToken: ticket.qrToken })
      .expect(200);

    const res = await request(app.getHttpServer())
      .get(`/organizations/${organizationId}/events/${event.id}/scans`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);

    expect(res.body).toHaveLength(1);
    expect(res.body[0].result).toBe('SUCCESS');
  });
});
