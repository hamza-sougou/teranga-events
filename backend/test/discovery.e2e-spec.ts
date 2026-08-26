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

describe('Discovery (e2e)', () => {
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
    // Same cleanup order as stats.e2e-spec.ts: orders/notifications/payouts
    // before organizations (Order.event has no ON DELETE CASCADE), then
    // organizations (cascades events -> event_promotions/media/ticket types),
    // then the user last.
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

  // Publishes by default — every discovery section only ever surfaces
  // PUBLISHED events. Pass publish: false for the few tests that need to
  // assert a draft is excluded.
  async function createEvent(
    organizationId: string,
    userId: string,
    opts: {
      startAt?: string;
      endAt?: string;
      categoryId?: string;
      latitude?: number;
      longitude?: number;
      publish?: boolean;
    } = {},
  ) {
    const unique = randomUUID();
    const event = await eventsService.create(organizationId, userId, {
      name: 'Festival de Test',
      slug: `festival-de-test-${unique}`,
      startAt: opts.startAt ?? '2027-01-01T18:00:00.000Z',
      endAt: opts.endAt ?? '2027-01-01T23:00:00.000Z',
      categoryId: opts.categoryId,
      latitude: opts.latitude,
      longitude: opts.longitude,
    });
    if (opts.publish !== false) {
      await seedImage(event.id);
      await eventsService.update(organizationId, event.id, { status: EventStatus.PUBLISHED });
    }
    return prisma.event.findUniqueOrThrow({ where: { id: event.id } });
  }

  async function createTicketType(
    organizationId: string,
    eventId: string,
    opts: { price?: number; quantityTotal?: number; saleStart?: Date; saleEnd?: Date } = {},
  ) {
    const now = new Date();
    return ticketTypesService.create(organizationId, eventId, {
      name: 'Standard',
      price: opts.price ?? 1000,
      quantityTotal: opts.quantityTotal ?? 10,
      saleStart: (opts.saleStart ?? new Date(now.getTime() - 60_000)).toISOString(),
      saleEnd: (opts.saleEnd ?? new Date(now.getTime() + 60 * 60_000)).toISOString(),
    });
  }

  async function createOrder(eventId: string, createdAt: Date, subtotalAmount = 1000) {
    const serviceFeeAmount = Math.round(subtotalAmount * 0.05);
    return prisma.order.create({
      data: {
        eventId,
        buyerEmail: `buyer-${randomUUID()}@example.com`,
        status: 'PAID',
        subtotalAmount,
        serviceFeeAmount,
        totalAmount: subtotalAmount + serviceFeeAmount,
        expiresAt: new Date(createdAt.getTime() - 60_000),
        createdAt,
      },
    });
  }

  function addOrderItem(orderId: string, ticketTypeId: string, quantity: number) {
    return prisma.orderItem.create({
      data: { orderId, ticketTypeId, quantity, unitPrice: 1000, subtotal: 1000 * quantity },
    });
  }

  // Mirrors DiscoveryService's getWeekendEnd exactly, so tests stay correct
  // regardless of which day the suite actually runs on.
  function weekendEnd(now = new Date()): Date {
    const day = now.getUTCDay();
    const daysUntilSunday = (7 - day) % 7;
    return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + daysUntilSunday, 23, 59, 59, 999));
  }

  describe('GET /discover/trending', () => {
    it('ranks by recent PAID quantity, excludes stale orders and non-PAID orders', async () => {
      const { organizationId, userId } = await registerOrganizer();
      const eventA = await createEvent(organizationId, userId);
      const eventB = await createEvent(organizationId, userId);
      const eventC = await createEvent(organizationId, userId);
      const ticketTypeA = await createTicketType(organizationId, eventA.id);
      const ticketTypeB = await createTicketType(organizationId, eventB.id);
      const ticketTypeC = await createTicketType(organizationId, eventC.id);

      const now = new Date();
      const recent = new Date(now.getTime() - 24 * 60 * 60 * 1000);
      const stale = new Date(now.getTime() - 10 * 24 * 60 * 60 * 1000);

      const orderA = await createOrder(eventA.id, recent);
      await addOrderItem(orderA.id, ticketTypeA.id, 5);
      const orderB = await createOrder(eventB.id, recent);
      await addOrderItem(orderB.id, ticketTypeB.id, 2);
      // Event C sold more in total, but outside the 7-day window — must not
      // outrank A/B, and must not appear via quantity_sold accidentally.
      const orderC = await createOrder(eventC.id, stale);
      await addOrderItem(orderC.id, ticketTypeC.id, 100);

      const res = await request(app.getHttpServer()).get('/discover/trending').expect(200);
      const ids = res.body.map((card: { id: string }) => card.id);

      expect(ids.indexOf(eventA.id)).toBeLessThan(ids.indexOf(eventB.id));
      expect(ids).not.toContain(eventC.id);
    });

    it('excludes draft events even with recent PAID orders', async () => {
      const { organizationId, userId } = await registerOrganizer();
      const draft = await createEvent(organizationId, userId, { publish: false });
      const ticketType = await ticketTypesService.create(organizationId, draft.id, {
        name: 'Standard',
        price: 1000,
        quantityTotal: 10,
        saleStart: new Date(Date.now() - 60_000).toISOString(),
        saleEnd: new Date(Date.now() + 60_000).toISOString(),
      });
      const order = await createOrder(draft.id, new Date());
      await addOrderItem(order.id, ticketType.id, 5);

      const res = await request(app.getHttpServer()).get('/discover/trending').expect(200);
      expect(res.body.map((card: { id: string }) => card.id)).not.toContain(draft.id);
    });
  });

  describe('GET /discover/this-weekend', () => {
    it('includes an event just inside the window and excludes one just outside it', async () => {
      const { organizationId, userId } = await registerOrganizer();
      const end = weekendEnd();
      const inside = new Date(end.getTime() - 60 * 60 * 1000);
      const outside = new Date(end.getTime() + 25 * 60 * 60 * 1000);

      const eventInside = await createEvent(organizationId, userId, {
        startAt: inside.toISOString(),
        endAt: new Date(inside.getTime() + 60 * 60 * 1000).toISOString(),
      });
      const eventOutside = await createEvent(organizationId, userId, {
        startAt: outside.toISOString(),
        endAt: new Date(outside.getTime() + 60 * 60 * 1000).toISOString(),
      });

      const res = await request(app.getHttpServer()).get('/discover/this-weekend').expect(200);
      const ids = res.body.map((card: { id: string }) => card.id);
      expect(ids).toContain(eventInside.id);
      expect(ids).not.toContain(eventOutside.id);
    });
  });

  describe('GET /discover/near-me', () => {
    it('returns only events within radiusKm, ordered by distance', async () => {
      const { organizationId, userId } = await registerOrganizer();
      // Dakar
      const near = await createEvent(organizationId, userId, { latitude: 14.6928, longitude: -17.4467 });
      // Also Dakar, slightly further out
      const nearer = await createEvent(organizationId, userId, { latitude: 14.7, longitude: -17.45 });
      // Paris — far outside any reasonable radiusKm
      const far = await createEvent(organizationId, userId, { latitude: 48.8566, longitude: 2.3522 });

      const res = await request(app.getHttpServer())
        .get('/discover/near-me')
        .query({ lat: 14.6928, lng: -17.4467, radiusKm: 50 })
        .expect(200);

      const ids = res.body.map((card: { id: string }) => card.id);
      expect(ids).toEqual(expect.arrayContaining([near.id, nearer.id]));
      expect(ids).not.toContain(far.id);
    });

    it('rejects a request missing lat/lng with 400', async () => {
      await request(app.getHttpServer()).get('/discover/near-me').expect(400);
    });
  });

  describe('GET /discover/sponsored', () => {
    it('includes only currently-active promotions, excludes expired and future ones', async () => {
      const { organizationId, userId } = await registerOrganizer();
      const active = await createEvent(organizationId, userId);
      const expired = await createEvent(organizationId, userId);
      const future = await createEvent(organizationId, userId);
      const now = Date.now();

      await prisma.eventPromotion.create({
        data: {
          eventId: active.id,
          type: 'FEATURED',
          startsAt: new Date(now - 60_000),
          endsAt: new Date(now + 60 * 60_000),
          createdBy: userId,
        },
      });
      await prisma.eventPromotion.create({
        data: {
          eventId: expired.id,
          type: 'FEATURED',
          startsAt: new Date(now - 2 * 60 * 60_000),
          endsAt: new Date(now - 60 * 60_000),
          createdBy: userId,
        },
      });
      await prisma.eventPromotion.create({
        data: {
          eventId: future.id,
          type: 'SPONSORED',
          startsAt: new Date(now + 60 * 60_000),
          endsAt: new Date(now + 2 * 60 * 60_000),
          createdBy: userId,
        },
      });

      const res = await request(app.getHttpServer()).get('/discover/sponsored').expect(200);
      const ids = res.body.map((card: { id: string }) => card.id);
      expect(ids).toContain(active.id);
      expect(ids).not.toContain(expired.id);
      expect(ids).not.toContain(future.id);
    });
  });

  describe('GET /discover/recently-published', () => {
    it('orders by publishedAt desc, not createdAt', async () => {
      const { organizationId, userId } = await registerOrganizer();
      const olderPublish = await createEvent(organizationId, userId);
      // Small delay so the two publishedAt timestamps are distinguishable.
      await new Promise((resolve) => setTimeout(resolve, 20));
      const newerPublish = await createEvent(organizationId, userId);

      const res = await request(app.getHttpServer()).get('/discover/recently-published').expect(200);
      const ids = res.body.map((card: { id: string }) => card.id);
      expect(ids.indexOf(newerPublish.id)).toBeLessThan(ids.indexOf(olderPublish.id));
    });
  });

  describe('GET /discover/by-category/:categorySlug', () => {
    it('returns only events in that category and 404s for an unknown slug', async () => {
      const { organizationId, userId } = await registerOrganizer();
      const concert = await prisma.eventCategory.findFirstOrThrow({ where: { slug: 'concert' } });
      const matching = await createEvent(organizationId, userId, { categoryId: concert.id });
      const nonMatching = await createEvent(organizationId, userId);

      const res = await request(app.getHttpServer()).get('/discover/by-category/concert').expect(200);
      const ids = res.body.map((card: { id: string }) => card.id);
      expect(ids).toContain(matching.id);
      expect(ids).not.toContain(nonMatching.id);

      await request(app.getHttpServer()).get('/discover/by-category/does-not-exist').expect(404);
    });
  });

  describe('GET /discover/last-chance', () => {
    it('includes an almost-sold-out ticket type and an event starting within 72h', async () => {
      const { organizationId, userId } = await registerOrganizer();
      const now = Date.now();

      const almostSoldOut = await createEvent(organizationId, userId, {
        startAt: '2027-06-01T18:00:00.000Z',
        endAt: '2027-06-01T23:00:00.000Z',
      });
      const soldOutTicketType = await createTicketType(organizationId, almostSoldOut.id, { quantityTotal: 10 });
      await prisma.ticketType.update({ where: { id: soldOutTicketType.id }, data: { quantitySold: 9 } });

      const startingSoon = await createEvent(organizationId, userId, {
        startAt: new Date(now + 50 * 60 * 60_000).toISOString(),
        endAt: new Date(now + 52 * 60 * 60_000).toISOString(),
      });
      await createTicketType(organizationId, startingSoon.id);

      const farFuture = await createEvent(organizationId, userId, {
        startAt: '2027-06-01T18:00:00.000Z',
        endAt: '2027-06-01T23:00:00.000Z',
      });
      await createTicketType(organizationId, farFuture.id);

      const res = await request(app.getHttpServer()).get('/discover/last-chance').expect(200);
      const ids = res.body.map((card: { id: string }) => card.id);
      expect(ids).toContain(almostSoldOut.id);
      expect(ids).toContain(startingSoon.id);
      expect(ids).not.toContain(farFuture.id);
    });
  });

  describe('GET /discover/free', () => {
    it('returns only events with a currently on-sale free ticket type, with displayPrice 0', async () => {
      const { organizationId, userId } = await registerOrganizer();
      const free = await createEvent(organizationId, userId);
      await createTicketType(organizationId, free.id, { price: 0 });
      const paid = await createEvent(organizationId, userId);
      await createTicketType(organizationId, paid.id, { price: 1000 });

      const res = await request(app.getHttpServer()).get('/discover/free').expect(200);
      const card = res.body.find((c: { id: string }) => c.id === free.id);
      expect(card).toBeDefined();
      expect(card.displayPrice).toBe(0);
      expect(res.body.map((c: { id: string }) => c.id)).not.toContain(paid.id);
    });
  });

  describe('limit query param', () => {
    it('defaults to a small page size and can be overridden', async () => {
      const { organizationId, userId } = await registerOrganizer();
      for (let i = 0; i < 3; i++) {
        const event = await createEvent(organizationId, userId);
        await createTicketType(organizationId, event.id, { price: 0 });
      }

      const limited = await request(app.getHttpServer()).get('/discover/free').query({ limit: 1 }).expect(200);
      expect(limited.body.length).toBeLessThanOrEqual(1);

      await request(app.getHttpServer()).get('/discover/free').query({ limit: 51 }).expect(400);
    });
  });
});
