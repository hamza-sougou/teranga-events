import { randomUUID } from 'crypto';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { EventStatus } from '@prisma/client';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { AuthService } from '../src/auth/auth.service';
import { EventsService } from '../src/events/events.service';
import { PayoutsService } from '../src/payouts/payouts.service';
import { PaydunyaProvider } from '../src/payments/providers/paydunya.provider';
import { PrismaService } from '../src/prisma/prisma.service';

describe('Payouts — organizer reversement (e2e)', () => {
  let app: INestApplication;
  let authService: AuthService;
  let eventsService: EventsService;
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
    payoutsService = moduleFixture.get(PayoutsService);
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

  async function createEndedEvent(organizationId: string, userId: string, status: 'PUBLISHED' | 'CANCELLED') {
    const unique = randomUUID();
    const event = await eventsService.create(organizationId, userId, {
      name: 'Festival Terminé',
      slug: `festival-termine-${unique}`,
      startAt: '2020-01-01T18:00:00.000Z',
      endAt: '2020-01-01T23:00:00.000Z',
    });
    await eventsService.update(organizationId, event.id, { status: EventStatus.PUBLISHED });
    if (status === 'CANCELLED') {
      await eventsService.update(organizationId, event.id, { status: EventStatus.CANCELLED });
    }
    return event;
  }

  async function createPaidOrder(eventId: string, subtotalAmount: number) {
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

  it('pays out the sum of subtotalAmount for an eligible finished event', async () => {
    const { organizationId, userId } = await registerOrganizer();
    await prisma.organization.update({ where: { id: organizationId }, data: { payoutPhoneNumber: '221771234567' } });
    const event = await createEndedEvent(organizationId, userId, 'PUBLISHED');
    await createPaidOrder(event.id, 1000);
    await createPaidOrder(event.id, 2000);

    const disburseSpy = jest
      .spyOn(paydunyaProvider, 'disburse')
      .mockResolvedValue({ transactionId: 'txn-123', responseText: 'ok' });

    const result = await payoutsService.runPayoutForEvent(event.id);

    expect(result).toMatchObject({ eventId: event.id, paid: 3000 });
    expect(disburseSpy).toHaveBeenCalledWith('221771234567', expect.any(Number));

    const payout = await prisma.payout.findUniqueOrThrow({ where: { eventId: event.id } });
    expect(payout.status).toBe('PAID');
    expect(Number(payout.amountDue)).toBe(3000);
    expect(Number(payout.amountPaid)).toBe(3000);
    expect(payout.providerTransactionId).toBe('txn-123');
  });

  it('does not duplicate the payout on a second trigger for the same event', async () => {
    const { organizationId, userId } = await registerOrganizer();
    await prisma.organization.update({ where: { id: organizationId }, data: { payoutPhoneNumber: '221771234567' } });
    const event = await createEndedEvent(organizationId, userId, 'PUBLISHED');
    await createPaidOrder(event.id, 1000);
    jest.spyOn(paydunyaProvider, 'disburse').mockResolvedValue({ transactionId: 'txn-1', responseText: 'ok' });

    await payoutsService.runPayoutForEvent(event.id);
    const second = await payoutsService.runPayoutForEvent(event.id);

    expect(second).toMatchObject({ eventId: event.id, skipped: expect.stringContaining('already') });
    const payouts = await prisma.payout.findMany({ where: { eventId: event.id } });
    expect(payouts).toHaveLength(1);
  });

  it('excludes a cancelled event from the automatic payout even with paid orders', async () => {
    const { organizationId, userId } = await registerOrganizer();
    await prisma.organization.update({ where: { id: organizationId }, data: { payoutPhoneNumber: '221771234567' } });
    const event = await createEndedEvent(organizationId, userId, 'CANCELLED');
    await createPaidOrder(event.id, 1000);
    const disburseSpy = jest.spyOn(paydunyaProvider, 'disburse');

    const result = await payoutsService.runPayoutForEvent(event.id);

    expect(result).toMatchObject({ eventId: event.id, skipped: 'event cancelled' });
    expect(disburseSpy).not.toHaveBeenCalled();
    const payout = await prisma.payout.findUnique({ where: { eventId: event.id } });
    expect(payout).toBeNull();
  });

  it('marks the payout FAILED when the organization has no payout phone number', async () => {
    const { organizationId, userId } = await registerOrganizer();
    const event = await createEndedEvent(organizationId, userId, 'PUBLISHED');
    await createPaidOrder(event.id, 1000);

    const result = await payoutsService.runPayoutForEvent(event.id);

    expect(result).toMatchObject({ eventId: event.id, failed: 'missing payout_phone_number' });
    const payout = await prisma.payout.findUniqueOrThrow({ where: { eventId: event.id } });
    expect(payout.status).toBe('FAILED');
  });

  it('lets a FAILED disbursement be retried on the same payout row', async () => {
    const { organizationId, userId } = await registerOrganizer();
    await prisma.organization.update({ where: { id: organizationId }, data: { payoutPhoneNumber: '221771234567' } });
    const event = await createEndedEvent(organizationId, userId, 'PUBLISHED');
    await createPaidOrder(event.id, 1000);

    jest.spyOn(paydunyaProvider, 'disburse').mockRejectedValueOnce(new Error('insufficient balance'));
    const first = await payoutsService.runPayoutForEvent(event.id);
    expect(first).toMatchObject({ eventId: event.id, failed: 'insufficient balance' });

    jest.spyOn(paydunyaProvider, 'disburse').mockResolvedValueOnce({ transactionId: 'txn-retry', responseText: 'ok' });
    const second = await payoutsService.runPayoutForEvent(event.id);
    expect(second).toMatchObject({ eventId: event.id, paid: 1000 });

    const payouts = await prisma.payout.findMany({ where: { eventId: event.id } });
    expect(payouts).toHaveLength(1);
    expect(payouts[0].status).toBe('PAID');
  });

  it('rejects the admin manual trigger for a non-super-admin caller', async () => {
    const { accessToken, organizationId, userId } = await registerOrganizer();
    const event = await createEndedEvent(organizationId, userId, 'PUBLISHED');

    await request(app.getHttpServer())
      .post(`/admin/events/${event.id}/payout`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(403);
  });

  it('allows the admin manual trigger for a super admin and lists payouts to the organizer', async () => {
    const { accessToken, organizationId, userId } = await registerOrganizer();
    await prisma.organization.update({ where: { id: organizationId }, data: { payoutPhoneNumber: '221771234567' } });
    await prisma.user.update({ where: { id: userId }, data: { isSuperAdmin: true } });
    const event = await createEndedEvent(organizationId, userId, 'PUBLISHED');
    await createPaidOrder(event.id, 1000);
    jest.spyOn(paydunyaProvider, 'disburse').mockResolvedValue({ transactionId: 'txn-admin', responseText: 'ok' });

    await request(app.getHttpServer())
      .post(`/admin/events/${event.id}/payout`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(201);

    const res = await request(app.getHttpServer())
      .get(`/organizations/${organizationId}/payouts`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);

    expect(res.body).toHaveLength(1);
    expect(res.body[0].status).toBe('PAID');
  });
});
