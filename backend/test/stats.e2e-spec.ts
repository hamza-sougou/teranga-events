import { randomUUID } from 'crypto';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { EventStatus, OrderStatus, TicketStatus } from '@prisma/client';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { AuthService } from '../src/auth/auth.service';
import { EventsService } from '../src/events/events.service';
import { TicketTypesService } from '../src/ticket-types/ticket-types.service';
import { PrismaService } from '../src/prisma/prisma.service';

describe('Stats (e2e)', () => {
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
      await prisma.notification.deleteMany({ where: { order: { eventId: { in: eventIds } } } });
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

  async function createEvent(organizationId: string, userId: string, status: EventStatus) {
    const unique = randomUUID();
    const event = await eventsService.create(organizationId, userId, {
      name: 'Festival de Test',
      slug: `festival-de-test-${unique}`,
      startAt: '2027-01-01T18:00:00.000Z',
      endAt: '2027-01-01T23:00:00.000Z',
    });
    if (status !== EventStatus.DRAFT) {
      await eventsService.update(organizationId, event.id, { status: EventStatus.PUBLISHED });
    }
    if (status === EventStatus.CANCELLED) {
      await eventsService.update(organizationId, event.id, { status: EventStatus.CANCELLED });
    }
    return prisma.event.findUniqueOrThrow({ where: { id: event.id } });
  }

  async function createTicketType(organizationId: string, eventId: string, quantityTotal = 10) {
    const now = new Date();
    return ticketTypesService.create(organizationId, eventId, {
      name: 'Standard',
      price: 1000,
      quantityTotal,
      saleStart: new Date(now.getTime() - 60_000).toISOString(),
      saleEnd: new Date(now.getTime() + 60 * 60_000).toISOString(),
    });
  }

  async function createOrder(eventId: string, status: OrderStatus, subtotalAmount = 1000) {
    const serviceFeeAmount = Math.round(subtotalAmount * 0.05);
    return prisma.order.create({
      data: {
        eventId,
        buyerEmail: `buyer-${randomUUID()}@example.com`,
        status,
        subtotalAmount,
        serviceFeeAmount,
        totalAmount: subtotalAmount + serviceFeeAmount,
        expiresAt: new Date(Date.now() - 60_000),
      },
    });
  }

  async function addTickets(orderId: string, ticketTypeId: string, statuses: TicketStatus[]) {
    if (statuses.length === 0) return;
    const orderItem = await prisma.orderItem.create({
      data: { orderId, ticketTypeId, quantity: statuses.length, unitPrice: 1000, subtotal: 1000 * statuses.length },
    });
    for (const status of statuses) {
      await prisma.ticket.create({ data: { orderItemId: orderItem.id, ticketTypeId, qrToken: randomUUID(), status } });
    }
  }

  it('computes capacity, ticket breakdown, and revenue counting only PAID orders', async () => {
    const { organizationId, userId, accessToken } = await registerOrganizer();
    const event = await createEvent(organizationId, userId, EventStatus.PUBLISHED);
    const ticketType = await createTicketType(organizationId, event.id, 10);

    const paidOrder1 = await createOrder(event.id, OrderStatus.PAID, 1000);
    await addTickets(paidOrder1.id, ticketType.id, [TicketStatus.VALID, TicketStatus.USED]);
    const paidOrder2 = await createOrder(event.id, OrderStatus.PAID, 2000);
    await addTickets(paidOrder2.id, ticketType.id, [TicketStatus.VALID]);

    await createOrder(event.id, OrderStatus.PENDING, 500);
    await createOrder(event.id, OrderStatus.CANCELLED, 500);

    const res = await request(app.getHttpServer())
      .get(`/organizations/${organizationId}/events/${event.id}/stats`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);

    expect(res.body.capacity).toEqual({ total: 10, reserved: 3, available: 7 });
    expect(res.body.fillRate).toBeCloseTo(0.3);
    expect(res.body.ticketsByStatus.VALID).toBe(2);
    expect(res.body.ticketsByStatus.USED).toBe(1);
    expect(res.body.ticketsByStatus.PENDING_PAYMENT).toBe(0);
    expect(res.body.revenue.paidOrdersCount).toBe(2);
    expect(res.body.revenue.organizerRevenue).toBe(3000);
    expect(res.body.revenue.grossRevenue).toBe(3150);
    expect(res.body.salesByTicketType).toHaveLength(1);
    expect(res.body.salesByTicketType[0].quantitySold).toBe(3);
    expect(res.body.payout).toBeNull();
  });

  it('returns zeroed-out stats for an event with no orders', async () => {
    const { organizationId, userId, accessToken } = await registerOrganizer();
    const event = await createEvent(organizationId, userId, EventStatus.PUBLISHED);
    await createTicketType(organizationId, event.id, 5);

    const res = await request(app.getHttpServer())
      .get(`/organizations/${organizationId}/events/${event.id}/stats`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);

    expect(res.body.capacity).toEqual({ total: 5, reserved: 0, available: 5 });
    expect(res.body.fillRate).toBe(0);
    expect(res.body.revenue.paidOrdersCount).toBe(0);
    expect(res.body.revenue.grossRevenue).toBe(0);
  });

  it('aggregates stats across every event of the organization', async () => {
    const { organizationId, userId, accessToken } = await registerOrganizer();
    const publishedEvent = await createEvent(organizationId, userId, EventStatus.PUBLISHED);
    await createEvent(organizationId, userId, EventStatus.DRAFT);
    const ticketType = await createTicketType(organizationId, publishedEvent.id, 10);
    const paidOrder = await createOrder(publishedEvent.id, OrderStatus.PAID, 4000);
    await addTickets(paidOrder.id, ticketType.id, [TicketStatus.VALID]);

    const res = await request(app.getHttpServer())
      .get(`/organizations/${organizationId}/stats`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);

    expect(res.body.totalEvents).toBe(2);
    expect(res.body.eventsByStatus.PUBLISHED).toBe(1);
    expect(res.body.eventsByStatus.DRAFT).toBe(1);
    expect(res.body.revenue.organizerRevenue).toBe(4000);
    expect(res.body.revenue.paidOrdersCount).toBe(1);
  });

  it('exports orders as CSV with the right headers and content type', async () => {
    const { organizationId, userId, accessToken } = await registerOrganizer();
    const event = await createEvent(organizationId, userId, EventStatus.PUBLISHED);
    const order = await createOrder(event.id, OrderStatus.PAID, 1000);

    const res = await request(app.getHttpServer())
      .get(`/organizations/${organizationId}/events/${event.id}/orders/export`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);

    expect(res.headers['content-type']).toContain('text/csv');
    const lines = res.text.trim().split('\n');
    expect(lines[0]).toBe('id,status,buyerEmail,subtotalAmount,serviceFeeAmount,totalAmount,currency,createdAt');
    expect(lines).toHaveLength(2);
    expect(lines[1]).toContain(order.id);
    expect(lines[1]).toContain(order.buyerEmail);
  });

  it('returns 404 when the event does not belong to the organization in the URL', async () => {
    const owner1 = await registerOrganizer();
    const event = await createEvent(owner1.organizationId, owner1.userId, EventStatus.PUBLISHED);
    const owner2 = await registerOrganizer();

    await request(app.getHttpServer())
      .get(`/organizations/${owner2.organizationId}/events/${event.id}/stats`)
      .set('Authorization', `Bearer ${owner2.accessToken}`)
      .expect(404);
  });

  it('rejects a caller with no membership in the organization', async () => {
    const owner = await registerOrganizer();
    const event = await createEvent(owner.organizationId, owner.userId, EventStatus.PUBLISHED);
    const stranger = await registerOrganizer();

    await request(app.getHttpServer())
      .get(`/organizations/${owner.organizationId}/events/${event.id}/stats`)
      .set('Authorization', `Bearer ${stranger.accessToken}`)
      .expect(403);
  });
});
