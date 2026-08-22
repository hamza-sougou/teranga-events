import { randomUUID } from 'crypto';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { EventStatus, MemberRole } from '@prisma/client';
import { AppModule } from '../src/app.module';
import { AuthService } from '../src/auth/auth.service';
import { EventsService } from '../src/events/events.service';
import { TicketTypesService } from '../src/ticket-types/ticket-types.service';
import { TeamsService } from '../src/teams/teams.service';
import { NotificationsService } from '../src/notifications/notifications.service';
import { EventReminderJob } from '../src/notifications/event-reminder.job';
import { EmailChannel } from '../src/notifications/channels/email.channel';
import { PrismaService } from '../src/prisma/prisma.service';

describe('Notifications (e2e)', () => {
  let app: INestApplication;
  let authService: AuthService;
  let eventsService: EventsService;
  let ticketTypesService: TicketTypesService;
  let teamsService: TeamsService;
  let notificationsService: NotificationsService;
  let eventReminderJob: EventReminderJob;
  let emailChannel: EmailChannel;
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
    teamsService = moduleFixture.get(TeamsService);
    notificationsService = moduleFixture.get(NotificationsService);
    eventReminderJob = moduleFixture.get(EventReminderJob);
    emailChannel = moduleFixture.get(EmailChannel);
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
      await prisma.notification.deleteMany({ where: { OR: [{ userId: user.id }, { order: { eventId: { in: eventIds } } }] } });
      await prisma.order.deleteMany({ where: { eventId: { in: eventIds } } });
      await prisma.payout.deleteMany({ where: { eventId: { in: eventIds } } });
      await prisma.organization.deleteMany({ where: { ownerUserId: user.id } });
      await prisma.organizationMember.deleteMany({ where: { userId: user.id } });
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

  async function createPublishedEvent(organizationId: string, userId: string, startAt: string, endAt: string) {
    const unique = randomUUID();
    const event = await eventsService.create(organizationId, userId, {
      name: 'Festival de Test',
      slug: `festival-de-test-${unique}`,
      startAt,
      endAt,
    });
    await seedImage(event.id);
    await eventsService.update(organizationId, event.id, { status: EventStatus.PUBLISHED });
    return prisma.event.findUniqueOrThrow({ where: { id: event.id } });
  }

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

  async function createPaidOrder(eventId: string, ticketTypeId: string) {
    return prisma.order.create({
      data: {
        eventId,
        buyerEmail: `buyer-${randomUUID()}@example.com`,
        status: 'PAID',
        subtotalAmount: 1000,
        serviceFeeAmount: 50,
        totalAmount: 1050,
        expiresAt: new Date(Date.now() - 60_000),
        items: {
          create: [{ ticketTypeId, quantity: 1, unitPrice: 1000, subtotal: 1000 }],
        },
      },
    });
  }

  it('creates a PENDING order_confirmation notification', async () => {
    const { organizationId, userId } = await registerOrganizer();
    const event = await createPublishedEvent(
      organizationId,
      userId,
      '2027-01-01T18:00:00.000Z',
      '2027-01-01T23:00:00.000Z',
    );
    const ticketType = await createTicketType(organizationId, event.id);
    const order = await createPaidOrder(event.id, ticketType.id);

    await notificationsService.notifyOrderConfirmation(order.id);

    const notification = await prisma.notification.findFirstOrThrow({
      where: { orderId: order.id, type: 'order_confirmation' },
    });
    expect(notification.status).toBe('PENDING');
    expect(notification.channel).toBe('EMAIL');
  });

  it('sends a pending notification via the dispatch sweep and marks it SENT', async () => {
    const { organizationId, userId } = await registerOrganizer();
    const event = await createPublishedEvent(
      organizationId,
      userId,
      '2027-01-01T18:00:00.000Z',
      '2027-01-01T23:00:00.000Z',
    );
    const ticketType = await createTicketType(organizationId, event.id);
    const order = await createPaidOrder(event.id, ticketType.id);
    await notificationsService.notifyOrderConfirmation(order.id);

    const sendSpy = jest.spyOn(emailChannel, 'send').mockResolvedValue();

    await notificationsService.sendPendingNotifications();

    expect(sendSpy).toHaveBeenCalledWith(
      expect.objectContaining({ to: order.buyerEmail, subject: expect.stringContaining(event.name) }),
    );
    const notification = await prisma.notification.findFirstOrThrow({
      where: { orderId: order.id, type: 'order_confirmation' },
    });
    expect(notification.status).toBe('SENT');
    expect(notification.sentAt).not.toBeNull();
  });

  it('marks a failed send FAILED without blocking the rest of the batch', async () => {
    const { organizationId, userId } = await registerOrganizer();
    const event = await createPublishedEvent(
      organizationId,
      userId,
      '2027-01-01T18:00:00.000Z',
      '2027-01-01T23:00:00.000Z',
    );
    const ticketType = await createTicketType(organizationId, event.id);
    const orderA = await createPaidOrder(event.id, ticketType.id);
    const orderB = await createPaidOrder(event.id, ticketType.id);
    await notificationsService.notifyOrderConfirmation(orderA.id);
    await notificationsService.notifyOrderConfirmation(orderB.id);

    jest
      .spyOn(emailChannel, 'send')
      .mockImplementationOnce(() => Promise.reject(new Error('SMTP down')))
      .mockImplementationOnce(() => Promise.resolve());

    await notificationsService.sendPendingNotifications();

    const notifA = await prisma.notification.findFirstOrThrow({ where: { orderId: orderA.id } });
    const notifB = await prisma.notification.findFirstOrThrow({ where: { orderId: orderB.id } });
    expect(notifA.status).toBe('FAILED');
    expect(notifB.status).toBe('SENT');
  });

  it('notifies every paid order once an event is cancelled, and skips events with none', async () => {
    const { organizationId, userId } = await registerOrganizer();
    const event = await createPublishedEvent(
      organizationId,
      userId,
      '2027-01-01T18:00:00.000Z',
      '2027-01-01T23:00:00.000Z',
    );
    const ticketType = await createTicketType(organizationId, event.id);
    const order = await createPaidOrder(event.id, ticketType.id);

    await eventsService.update(organizationId, event.id, { status: EventStatus.CANCELLED });

    const notification = await prisma.notification.findFirstOrThrow({
      where: { orderId: order.id, type: 'cancellation' },
    });
    expect(notification.status).toBe('PENDING');

    // Re-applying the already-cancelled status must not duplicate it.
    await eventsService.update(organizationId, event.id, { status: EventStatus.CANCELLED });
    const cancellationNotifs = await prisma.notification.findMany({
      where: { orderId: order.id, type: 'cancellation' },
    });
    expect(cancellationNotifs).toHaveLength(1);

    const emptyEvent = await createPublishedEvent(
      organizationId,
      userId,
      '2027-02-01T18:00:00.000Z',
      '2027-02-01T23:00:00.000Z',
    );
    await eventsService.update(organizationId, emptyEvent.id, { status: EventStatus.CANCELLED });
    const noOrdersNotifs = await prisma.notification.count({
      where: { order: { eventId: emptyEvent.id } },
    });
    expect(noOrdersNotifs).toBe(0);
  });

  it('creates one event_reminder per due order and never duplicates it', async () => {
    const { organizationId, userId } = await registerOrganizer();
    const dueEvent = await createPublishedEvent(
      organizationId,
      userId,
      new Date(Date.now() + 6 * 60 * 60 * 1000).toISOString(),
      new Date(Date.now() + 10 * 60 * 60 * 1000).toISOString(),
    );
    const farEvent = await createPublishedEvent(
      organizationId,
      userId,
      '2027-06-01T18:00:00.000Z',
      '2027-06-01T23:00:00.000Z',
    );
    const dueTicketType = await createTicketType(organizationId, dueEvent.id);
    const farTicketType = await createTicketType(organizationId, farEvent.id);
    const dueOrder = await createPaidOrder(dueEvent.id, dueTicketType.id);
    await createPaidOrder(farEvent.id, farTicketType.id);

    await eventReminderJob.createDueReminders();
    await eventReminderJob.createDueReminders();

    const dueReminders = await prisma.notification.findMany({
      where: { orderId: dueOrder.id, type: 'event_reminder' },
    });
    expect(dueReminders).toHaveLength(1);

    const farReminders = await prisma.notification.count({
      where: { order: { eventId: farEvent.id }, type: 'event_reminder' },
    });
    expect(farReminders).toBe(0);
  });

  it('creates a team_invitation notification for the invited email', async () => {
    const owner = await registerOrganizer();
    const invitee = await registerOrganizer();
    const inviteeUser = await prisma.user.findUniqueOrThrow({ where: { id: invitee.userId } });

    await teamsService.invite(owner.organizationId, owner.userId, {
      email: inviteeUser.email,
      role: MemberRole.CO_ORGANIZER,
    });

    const notification = await prisma.notification.findFirstOrThrow({
      where: { userId: invitee.userId, type: 'team_invitation' },
    });
    expect(notification.status).toBe('PENDING');
  });
});
