import { randomUUID } from 'crypto';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { EventStatus, TicketAccessMode, TicketCategory } from '@prisma/client';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { AuthService } from '../src/auth/auth.service';
import { EventsService } from '../src/events/events.service';
import { TicketTypesService } from '../src/ticket-types/ticket-types.service';
import { OrdersExpirationJob } from '../src/orders/orders-expiration.job';
import { PaydunyaProvider } from '../src/payments/providers/paydunya.provider';
import { PrismaService } from '../src/prisma/prisma.service';

describe('Orders — checkout & expiration (e2e)', () => {
  let app: INestApplication;
  let authService: AuthService;
  let eventsService: EventsService;
  let ticketTypesService: TicketTypesService;
  let ordersExpirationJob: OrdersExpirationJob;
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
    ordersExpirationJob = moduleFixture.get(OrdersExpirationJob);
    paydunyaProvider = moduleFixture.get(PaydunyaProvider);
    prisma = moduleFixture.get(PrismaService);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  afterAll(async () => {
    for (const email of createdUserEmails) {
      const user = await prisma.user.findFirst({ where: { email } });
      if (!user) continue;
      const organizations = await prisma.organization.findMany({ where: { ownerUserId: user.id } });
      const eventIds = (
        await prisma.event.findMany({ where: { organizationId: { in: organizations.map((o) => o.id) } } })
      ).map((e) => e.id);
      // orders/payouts reference events without cascade — must go first, or
      // deleting the organization (which cascades to events) would 23503.
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

    const { user } = await authService.register({
      email,
      password: 'super-secret-password',
      fullName: 'Amadou Ba',
      organizationName: 'Amadou Events',
      organizationSlug: `amadou-events-${unique}`,
    });

    const organization = await prisma.organization.findFirstOrThrow({ where: { ownerUserId: user.id } });
    return { organizationId: organization.id, userId: user.id };
  }

  async function createPublishedEvent(organizationId: string, userId: string) {
    const unique = randomUUID();
    const event = await eventsService.create(organizationId, userId, {
      name: 'Festival de Test',
      slug: `festival-de-test-${unique}`,
      startAt: '2027-01-01T18:00:00.000Z',
      endAt: '2027-01-01T23:00:00.000Z',
    });
    return eventsService.update(organizationId, event.id, { status: EventStatus.PUBLISHED });
  }

  async function createOnSaleTicketType(organizationId: string, eventId: string, quantityTotal: number) {
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

  it('returns a price breakdown with no side effects on preview', async () => {
    const { organizationId, userId } = await registerOrganizer();
    const event = await createPublishedEvent(organizationId, userId);
    const ticketType = await createOnSaleTicketType(organizationId, event.id, 10);

    const res = await request(app.getHttpServer())
      .post('/orders/preview')
      .send({
        eventId: event.id,
        paymentChannel: 'MOBILE_MONEY',
        items: [{ ticketTypeId: ticketType.id, quantity: 2 }],
      })
      .expect(201);

    expect(res.body.subtotalAmount).toBe(2000);
    expect(res.body.totalAmount).toBeGreaterThan(res.body.subtotalAmount);
    expect(res.body.serviceFeeAmount).toBe(res.body.totalAmount - res.body.subtotalAmount);

    const refreshed = await prisma.ticketType.findUniqueOrThrow({ where: { id: ticketType.id } });
    expect(refreshed.quantitySold).toBe(0);
  });

  it('checks out successfully: creates the order, reserves tickets, and calls PayDunya', async () => {
    const { organizationId, userId } = await registerOrganizer();
    const event = await createPublishedEvent(organizationId, userId);
    const ticketType = await createOnSaleTicketType(organizationId, event.id, 10);
    const createInvoiceSpy = mockCreateInvoice();

    const res = await request(app.getHttpServer())
      .post('/orders')
      .send({
        eventId: event.id,
        buyerEmail: 'buyer@example.com',
        paymentChannel: 'MOBILE_MONEY',
        items: [{ ticketTypeId: ticketType.id, quantity: 2 }],
      })
      .expect(201);

    expect(res.body.orderId).toBeDefined();
    expect(res.body.paymentUrl).toBe('https://paydunya.test/checkout/fake');
    expect(createInvoiceSpy).toHaveBeenCalledTimes(1);

    const order = await prisma.order.findUniqueOrThrow({ where: { id: res.body.orderId } });
    expect(order.status).toBe('PENDING');
    expect(Number(order.subtotalAmount) + Number(order.serviceFeeAmount)).toBe(Number(order.totalAmount));

    const tickets = await prisma.ticket.findMany({ where: { ticketTypeId: ticketType.id } });
    expect(tickets).toHaveLength(2);
    expect(tickets.every((t) => t.status === 'PENDING_PAYMENT')).toBe(true);

    const payment = await prisma.payment.findFirstOrThrow({ where: { orderId: order.id } });
    expect(payment.provider).toBe('PAYDUNYA');
    expect(payment.status).toBe('PENDING');

    const refreshedType = await prisma.ticketType.findUniqueOrThrow({ where: { id: ticketType.id } });
    expect(refreshedType.quantitySold).toBe(2);
  });

  it('rolls back the whole cart with 409 when quota runs out mid-checkout', async () => {
    const { organizationId, userId } = await registerOrganizer();
    const event = await createPublishedEvent(organizationId, userId);
    const ticketType = await createOnSaleTicketType(organizationId, event.id, 1);
    mockCreateInvoice();

    await request(app.getHttpServer())
      .post('/orders')
      .send({
        eventId: event.id,
        buyerEmail: 'buyer@example.com',
        paymentChannel: 'MOBILE_MONEY',
        items: [{ ticketTypeId: ticketType.id, quantity: 2 }],
      })
      .expect(409);

    const orders = await prisma.order.findMany({ where: { eventId: event.id } });
    expect(orders).toHaveLength(0);
    const tickets = await prisma.ticket.findMany({ where: { ticketTypeId: ticketType.id } });
    expect(tickets).toHaveLength(0);
    const refreshedType = await prisma.ticketType.findUniqueOrThrow({ where: { id: ticketType.id } });
    expect(refreshedType.quantitySold).toBe(0);
  });

  it('cancels the order and releases quota when PayDunya invoice creation fails', async () => {
    const { organizationId, userId } = await registerOrganizer();
    const event = await createPublishedEvent(organizationId, userId);
    const ticketType = await createOnSaleTicketType(organizationId, event.id, 5);
    jest.spyOn(paydunyaProvider, 'createInvoice').mockRejectedValue(new Error('network down'));

    await request(app.getHttpServer())
      .post('/orders')
      .send({
        eventId: event.id,
        buyerEmail: 'buyer@example.com',
        paymentChannel: 'MOBILE_MONEY',
        items: [{ ticketTypeId: ticketType.id, quantity: 1 }],
      })
      .expect(503);

    const order = await prisma.order.findFirstOrThrow({ where: { eventId: event.id } });
    expect(order.status).toBe('CANCELLED');
    const tickets = await prisma.ticket.findMany({ where: { ticketTypeId: ticketType.id } });
    expect(tickets.every((t) => t.status === 'CANCELLED')).toBe(true);
    const refreshedType = await prisma.ticketType.findUniqueOrThrow({ where: { id: ticketType.id } });
    expect(refreshedType.quantitySold).toBe(0);
  });

  it('rejects checkout against a presale-whitelist ticket type for a non-whitelisted email', async () => {
    const { organizationId, userId } = await registerOrganizer();
    const event = await createPublishedEvent(organizationId, userId);
    const now = new Date();
    const ticketType = await ticketTypesService.create(organizationId, event.id, {
      name: 'Prévente VIP',
      category: TicketCategory.PRESALE,
      accessMode: TicketAccessMode.PRESALE_WHITELIST,
      price: 1000,
      quantityTotal: 5,
      saleStart: new Date(now.getTime() - 60_000).toISOString(),
      saleEnd: new Date(now.getTime() + 60 * 60_000).toISOString(),
    });
    mockCreateInvoice();

    await request(app.getHttpServer())
      .post('/orders')
      .send({
        eventId: event.id,
        buyerEmail: 'not-invited@example.com',
        paymentChannel: 'MOBILE_MONEY',
        items: [{ ticketTypeId: ticketType.id, quantity: 1 }],
      })
      .expect(403);
  });

  it('expires unpaid orders past their expiresAt and releases quota', async () => {
    const { organizationId, userId } = await registerOrganizer();
    const event = await createPublishedEvent(organizationId, userId);
    const ticketType = await createOnSaleTicketType(organizationId, event.id, 3);

    const order = await prisma.order.create({
      data: {
        eventId: event.id,
        buyerEmail: 'buyer@example.com',
        subtotalAmount: 1000,
        serviceFeeAmount: 50,
        totalAmount: 1050,
        expiresAt: new Date(Date.now() - 60_000),
      },
    });
    const orderItem = await prisma.orderItem.create({
      data: { orderId: order.id, ticketTypeId: ticketType.id, quantity: 1, unitPrice: 1000, subtotal: 1000 },
    });
    await prisma.ticket.create({
      data: { orderItemId: orderItem.id, ticketTypeId: ticketType.id, qrToken: randomUUID() },
    });

    await ordersExpirationJob.cancelExpiredOrders();

    const refreshedOrder = await prisma.order.findUniqueOrThrow({ where: { id: order.id } });
    expect(refreshedOrder.status).toBe('EXPIRED');
    const tickets = await prisma.ticket.findMany({ where: { orderItemId: orderItem.id } });
    expect(tickets.every((t) => t.status === 'CANCELLED')).toBe(true);
    const refreshedType = await prisma.ticketType.findUniqueOrThrow({ where: { id: ticketType.id } });
    expect(refreshedType.quantitySold).toBe(0);
  });
});
