import { randomUUID, createHash } from 'crypto';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import { EventStatus } from '@prisma/client';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { AuthService } from '../src/auth/auth.service';
import { EventsService } from '../src/events/events.service';
import { TicketTypesService } from '../src/ticket-types/ticket-types.service';
import { PaydunyaProvider, ConfirmInvoiceResult } from '../src/payments/providers/paydunya.provider';
import { PrismaService } from '../src/prisma/prisma.service';

describe('PayDunya IPN webhook (e2e)', () => {
  let app: INestApplication;
  let authService: AuthService;
  let eventsService: EventsService;
  let ticketTypesService: TicketTypesService;
  let paydunyaProvider: PaydunyaProvider;
  let prisma: PrismaService;
  let validHash: string;
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
    paydunyaProvider = moduleFixture.get(PaydunyaProvider);
    prisma = moduleFixture.get(PrismaService);

    // The IPN hash is sha512(masterKey) — docs/MODULE_PAIEMENT_SPEC.md §3.
    // Read via ConfigService (the same source PaymentsService uses) instead
    // of hardcoding a value, so this test doesn't drift out of sync with
    // whatever backend/.env's PAYDUNYA_MASTER_KEY actually is.
    const configService = moduleFixture.get(ConfigService);
    const masterKey = configService.get<string>('paydunya.masterKey') ?? '';
    validHash = createHash('sha512').update(masterKey).digest('hex');
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
      // orders/payouts reference events without cascade, and notifications
      // reference orders without cascade — all must go before the
      // organization (which cascades to events), or deletion 23503s.
      await prisma.notification.deleteMany({ where: { order: { eventId: { in: eventIds } } } });
      await prisma.order.deleteMany({ where: { eventId: { in: eventIds } } });
      await prisma.payout.deleteMany({ where: { eventId: { in: eventIds } } });
      await prisma.organization.deleteMany({ where: { ownerUserId: user.id } });
      await prisma.user.delete({ where: { id: user.id } });
    }
    await app.close();
  });

  // Publishing now requires at least one image (events.e2e-spec.ts covers the
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

  async function setupPaidOrderCandidate() {
    const unique = randomUUID();
    const email = `organizer-${unique}@example.com`;
    createdUserEmails.push(email);

    const { user } = await authService.register({
      email,
      password: 'super-secret-password',
      fullName: 'Amadou Ba',
      passwordConfirmation: 'super-secret-password',
      marketingOptIn: false,
      termsAccepted: true,
    });
    const organization = await prisma.organization.findFirstOrThrow({ where: { ownerUserId: user.id } });

    const category = await prisma.eventCategory.findFirstOrThrow({ where: { isActive: true } });
    const event = await eventsService.create(organization.id, user.id, {
      name: 'Festival de Test',
      slug: `festival-de-test-${unique}`,
      address: 'Route de la Corniche, Dakar',
      categoryId: category.id,
      startAt: '2027-01-01T18:00:00.000Z',
      endAt: '2027-01-01T23:00:00.000Z',
    });
    await seedImage(event.id);
    // Publishing now also requires at least one ticket type — this helper
    // creates its real one right below, so a throwaway is seeded just to
    // pass the gate and removed immediately after.
    const throwawayTicketType = await prisma.ticketType.create({
      data: {
        eventId: event.id,
        name: 'Throwaway',
        price: 0,
        quantityTotal: 1,
        saleStart: new Date('2019-01-01T00:00:00.000Z'),
        saleEnd: new Date('2019-01-02T00:00:00.000Z'),
      },
    });
    await eventsService.update(organization.id, event.id, { status: EventStatus.PUBLISHED });
    await prisma.ticketType.delete({ where: { id: throwawayTicketType.id } });

    const now = new Date();
    const ticketType = await ticketTypesService.create(organization.id, event.id, {
      name: 'Standard',
      price: 1000,
      quantityTotal: 10,
      saleStart: new Date(now.getTime() - 60_000).toISOString(),
      saleEnd: new Date(now.getTime() + 60 * 60_000).toISOString(),
    });

    const token = `token-${unique}`;
    jest.spyOn(paydunyaProvider, 'createInvoice').mockResolvedValueOnce({
      token,
      paymentUrl: 'https://paydunya.test/checkout/fake',
      status: 'pending',
    });

    const checkoutRes = await request(app.getHttpServer())
      .post('/orders')
      .send({
        eventId: event.id,
        buyerEmail: 'buyer@example.com',
        paymentChannel: 'MOBILE_MONEY',
        items: [{ ticketTypeId: ticketType.id, quantity: 1 }],
      })
      .expect(201);

    const order = await prisma.order.findUniqueOrThrow({ where: { id: checkoutRes.body.orderId } });
    return { order, token };
  }

  function completedConfirmResult(totalAmount: number, orderId: string): ConfirmInvoiceResult {
    return {
      status: 'completed',
      totalAmount,
      customData: { orderId },
      responseText: 'Transaction approuvée',
    };
  }

  function ipnBody(hash: string, token: string) {
    return { data: JSON.stringify({ hash, invoice: { token } }) };
  }

  it('rejects an IPN with an invalid hash and writes nothing', async () => {
    const { order, token } = await setupPaidOrderCandidate();
    const confirmSpy = jest.spyOn(paydunyaProvider, 'confirmInvoice');

    await request(app.getHttpServer())
      .post('/payments/webhooks/paydunya')
      .send(ipnBody('not-the-right-hash', token))
      .expect(400);

    expect(confirmSpy).not.toHaveBeenCalled();
    const refreshedOrder = await prisma.order.findUniqueOrThrow({ where: { id: order.id } });
    expect(refreshedOrder.status).toBe('PENDING');
  });

  it('confirms payment on a valid completed IPN and is idempotent on a duplicate', async () => {
    const { order, token } = await setupPaidOrderCandidate();
    const confirmSpy = jest
      .spyOn(paydunyaProvider, 'confirmInvoice')
      .mockResolvedValue(completedConfirmResult(Number(order.totalAmount), order.id));

    await request(app.getHttpServer())
      .post('/payments/webhooks/paydunya')
      .send(ipnBody(validHash, token))
      .expect(200);

    let refreshedOrder = await prisma.order.findUniqueOrThrow({ where: { id: order.id } });
    expect(refreshedOrder.status).toBe('PAID');
    let tickets = await prisma.ticket.findMany({ where: { orderItem: { orderId: order.id } } });
    expect(tickets.every((t) => t.status === 'VALID')).toBe(true);

    // Duplicate IPN for the same already-successful payment: no-op, no
    // second confirm() call, no double side effects.
    await request(app.getHttpServer())
      .post('/payments/webhooks/paydunya')
      .send(ipnBody(validHash, token))
      .expect(200);

    expect(confirmSpy).toHaveBeenCalledTimes(1);
    refreshedOrder = await prisma.order.findUniqueOrThrow({ where: { id: order.id } });
    expect(refreshedOrder.status).toBe('PAID');
    tickets = await prisma.ticket.findMany({ where: { orderItem: { orderId: order.id } } });
    expect(tickets).toHaveLength(1);
  });

  it('marks the payment FAILED and leaves the order PENDING when the confirmed amount mismatches', async () => {
    const { order, token } = await setupPaidOrderCandidate();
    jest.spyOn(paydunyaProvider, 'confirmInvoice').mockResolvedValue(
      completedConfirmResult(Number(order.totalAmount) + 500, order.id),
    );

    await request(app.getHttpServer())
      .post('/payments/webhooks/paydunya')
      .send(ipnBody(validHash, token))
      .expect(200);

    const refreshedOrder = await prisma.order.findUniqueOrThrow({ where: { id: order.id } });
    expect(refreshedOrder.status).toBe('PENDING');
    const payment = await prisma.payment.findFirstOrThrow({ where: { orderId: order.id } });
    expect(payment.status).toBe('FAILED');
    const tickets = await prisma.ticket.findMany({ where: { orderItem: { orderId: order.id } } });
    expect(tickets.every((t) => t.status === 'PENDING_PAYMENT')).toBe(true);
  });

  it('records a manual-review audit log when a completed IPN arrives after the cart already expired', async () => {
    const { order, token } = await setupPaidOrderCandidate();

    // Simulate the expiration job having already run for this order.
    await prisma.order.update({ where: { id: order.id }, data: { status: 'EXPIRED' } });
    await prisma.ticket.updateMany({
      where: { orderItem: { orderId: order.id } },
      data: { status: 'CANCELLED' },
    });

    jest
      .spyOn(paydunyaProvider, 'confirmInvoice')
      .mockResolvedValue(completedConfirmResult(Number(order.totalAmount), order.id));

    await request(app.getHttpServer())
      .post('/payments/webhooks/paydunya')
      .send(ipnBody(validHash, token))
      .expect(200);

    const refreshedOrder = await prisma.order.findUniqueOrThrow({ where: { id: order.id } });
    expect(refreshedOrder.status).toBe('EXPIRED');
    const tickets = await prisma.ticket.findMany({ where: { orderItem: { orderId: order.id } } });
    expect(tickets.every((t) => t.status === 'CANCELLED')).toBe(true);

    const auditLog = await prisma.auditLog.findFirstOrThrow({
      where: { action: 'payment.received_after_expiry', entityId: order.id },
    });
    expect(auditLog.entityType).toBe('order');
  });

  it('lets only one of two near-simultaneous completed IPNs actually confirm the order', async () => {
    const { order, token } = await setupPaidOrderCandidate();
    jest
      .spyOn(paydunyaProvider, 'confirmInvoice')
      .mockResolvedValue(completedConfirmResult(Number(order.totalAmount), order.id));

    const fire = () =>
      request(app.getHttpServer()).post('/payments/webhooks/paydunya').send(ipnBody(validHash, token));

    const results = await Promise.all([fire(), fire()]);
    expect(results.every((res) => res.status === 200)).toBe(true);

    const refreshedOrder = await prisma.order.findUniqueOrThrow({ where: { id: order.id } });
    expect(refreshedOrder.status).toBe('PAID');
    const payments = await prisma.payment.findMany({ where: { orderId: order.id } });
    expect(payments).toHaveLength(1);
    expect(payments[0].status).toBe('SUCCESS');
    const tickets = await prisma.ticket.findMany({ where: { orderItem: { orderId: order.id } } });
    expect(tickets.every((t) => t.status === 'VALID')).toBe(true);
  });
});
