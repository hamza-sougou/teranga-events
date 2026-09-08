import { randomUUID } from 'crypto';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { AuthService } from '../src/auth/auth.service';
import { EventsService } from '../src/events/events.service';
import { PrismaService } from '../src/prisma/prisma.service';

describe('TicketTypes (e2e)', () => {
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
    for (const email of createdUserEmails) {
      const user = await prisma.user.findFirst({ where: { email } });
      if (!user) continue;
      await prisma.organization.deleteMany({ where: { ownerUserId: user.id } });
      await prisma.user.delete({ where: { id: user.id } });
    }
    await app.close();
  });

  async function registerOrganizer() {
    const unique = randomUUID();
    const email = `organizer-${unique}@example.com`;
    createdUserEmails.push(email);

    const { accessToken, user } = await authService.register({
      email,
      password: 'super-secret-password',
      fullName: 'Amadou Ba',
      passwordConfirmation: 'super-secret-password',
      marketingOptIn: false,
      termsAccepted: true,
    });

    const organization = await prisma.organization.findFirstOrThrow({
      where: { ownerUserId: user.id },
    });

    return { accessToken, organizationId: organization.id, userId: user.id };
  }

  async function createEvent(organizationId: string, userId: string) {
    const unique = randomUUID();
    const category = await prisma.eventCategory.findFirstOrThrow({ where: { isActive: true } });
    return eventsService.create(organizationId, userId, {
      name: 'Festival de Test',
      slug: `festival-de-test-${unique}`,
      address: 'Route de la Corniche, Dakar',
      categoryId: category.id,
      startAt: '2027-01-01T18:00:00.000Z',
      endAt: '2027-01-01T23:00:00.000Z',
    });
  }

  // Publishing now requires at least one image (events.e2e-spec.ts covers the
  // rule itself) — seed one directly, this file isn't testing that rule.
  async function seedImage(eventId: string) {
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

  function ticketTypePayload() {
    return {
      name: 'Standard',
      price: 5000,
      quantityTotal: 100,
      saleStart: '2026-12-01T00:00:00.000Z',
      saleEnd: '2026-12-31T23:59:59.000Z',
    };
  }

  it('creates a ticket type as OWNER', async () => {
    const { accessToken, organizationId, userId } = await registerOrganizer();
    const event = await createEvent(organizationId, userId);

    const res = await request(app.getHttpServer())
      .post(`/organizations/${organizationId}/events/${event.id}/ticket-types`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send(ticketTypePayload())
      .expect(201);

    expect(res.body.name).toBe('Standard');
    expect(res.body.category).toBe('STANDARD');
    expect(res.body.quantitySold).toBe(0);
  });

  it('rejects saleEnd before saleStart with 400', async () => {
    const { accessToken, organizationId, userId } = await registerOrganizer();
    const event = await createEvent(organizationId, userId);
    const payload = { ...ticketTypePayload(), saleStart: '2026-12-31T00:00:00.000Z', saleEnd: '2026-12-01T00:00:00.000Z' };

    await request(app.getHttpServer())
      .post(`/organizations/${organizationId}/events/${event.id}/ticket-types`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send(payload)
      .expect(400);
  });

  it('rejects creation without a token', async () => {
    const { organizationId, userId } = await registerOrganizer();
    const event = await createEvent(organizationId, userId);

    await request(app.getHttpServer())
      .post(`/organizations/${organizationId}/events/${event.id}/ticket-types`)
      .send(ticketTypePayload())
      .expect(401);
  });

  it('rejects a user with no membership in the target organization', async () => {
    const { organizationId, userId } = await registerOrganizer();
    const event = await createEvent(organizationId, userId);
    const outsider = await registerOrganizer();

    await request(app.getHttpServer())
      .post(`/organizations/${organizationId}/events/${event.id}/ticket-types`)
      .set('Authorization', `Bearer ${outsider.accessToken}`)
      .send(ticketTypePayload())
      .expect(403);
  });

  it('returns 404 for an eventId that belongs to another organization', async () => {
    const owner = await registerOrganizer();
    const event = await createEvent(owner.organizationId, owner.userId);
    const other = await registerOrganizer();

    await request(app.getHttpServer())
      .post(`/organizations/${other.organizationId}/events/${event.id}/ticket-types`)
      .set('Authorization', `Bearer ${other.accessToken}`)
      .send(ticketTypePayload())
      .expect(404);
  });

  it('rejects lowering quantityTotal below quantitySold with 400', async () => {
    const { accessToken, organizationId, userId } = await registerOrganizer();
    const event = await createEvent(organizationId, userId);

    const created = await request(app.getHttpServer())
      .post(`/organizations/${organizationId}/events/${event.id}/ticket-types`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send(ticketTypePayload())
      .expect(201);

    // No sales API yet — bump quantitySold directly to simulate sold tickets.
    await prisma.ticketType.update({
      where: { id: created.body.id },
      data: { quantitySold: 10 },
    });

    await request(app.getHttpServer())
      .patch(`/organizations/${organizationId}/events/${event.id}/ticket-types/${created.body.id}`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ quantityTotal: 5 })
      .expect(400);
  });

  describe('whitelist', () => {
    it('adds, lists and removes whitelist entries', async () => {
      const { accessToken, organizationId, userId } = await registerOrganizer();
      const event = await createEvent(organizationId, userId);
      const created = await request(app.getHttpServer())
        .post(`/organizations/${organizationId}/events/${event.id}/ticket-types`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ ...ticketTypePayload(), accessMode: 'PRESALE_WHITELIST' })
        .expect(201);
      const ticketTypeId = created.body.id;
      const base = `/organizations/${organizationId}/events/${event.id}/ticket-types/${ticketTypeId}/whitelist`;

      const addRes = await request(app.getHttpServer())
        .post(base)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ emails: ['guest1@example.com', 'guest2@example.com'] })
        .expect(201);
      expect(addRes.body).toHaveLength(2);

      const listRes = await request(app.getHttpServer())
        .get(base)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);
      expect(listRes.body).toHaveLength(2);

      await request(app.getHttpServer())
        .delete(`${base}/${encodeURIComponent('guest1@example.com')}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      const listAfterDelete = await request(app.getHttpServer())
        .get(base)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);
      expect(listAfterDelete.body).toHaveLength(1);
      expect(listAfterDelete.body[0].email).toBe('guest2@example.com');
    });

    it('returns 404 when removing an entry that does not exist', async () => {
      const { accessToken, organizationId, userId } = await registerOrganizer();
      const event = await createEvent(organizationId, userId);
      const created = await request(app.getHttpServer())
        .post(`/organizations/${organizationId}/events/${event.id}/ticket-types`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send(ticketTypePayload())
        .expect(201);

      await request(app.getHttpServer())
        .delete(
          `/organizations/${organizationId}/events/${event.id}/ticket-types/${created.body.id}/whitelist/${encodeURIComponent('nobody@example.com')}`,
        )
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(404);
    });
  });

  describe('public ticket types', () => {
    it('returns 404 while the event is still a draft', async () => {
      const { organizationId, userId } = await registerOrganizer();
      const event = await createEvent(organizationId, userId);

      await request(app.getHttpServer()).get(`/events/${event.slug}/ticket-types`).expect(404);
    });

    it('returns available/isOnSale once the event is published', async () => {
      const { accessToken, organizationId, userId } = await registerOrganizer();
      const event = await createEvent(organizationId, userId);
      await request(app.getHttpServer())
        .post(`/organizations/${organizationId}/events/${event.id}/ticket-types`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ ...ticketTypePayload(), saleStart: '2020-01-01T00:00:00.000Z', saleEnd: '2030-01-01T00:00:00.000Z' })
        .expect(201);
      await seedImage(event.id);

      await request(app.getHttpServer())
        .patch(`/organizations/${organizationId}/events/${event.id}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ status: 'PUBLISHED' })
        .expect(200);

      const res = await request(app.getHttpServer()).get(`/events/${event.slug}/ticket-types`).expect(200);
      expect(res.body).toHaveLength(1);
      expect(res.body[0].available).toBe(100);
      expect(res.body[0].isOnSale).toBe(true);
      expect(res.body[0].quantityTotal).toBeUndefined();
      expect(res.body[0].quantitySold).toBeUndefined();
    });

    it('returns a displayPrice above the raw organizer price (commission included)', async () => {
      const { accessToken, organizationId, userId } = await registerOrganizer();
      const event = await createEvent(organizationId, userId);
      await request(app.getHttpServer())
        .post(`/organizations/${organizationId}/events/${event.id}/ticket-types`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ ...ticketTypePayload(), saleStart: '2020-01-01T00:00:00.000Z', saleEnd: '2030-01-01T00:00:00.000Z' })
        .expect(201);
      await seedImage(event.id);
      await request(app.getHttpServer())
        .patch(`/organizations/${organizationId}/events/${event.id}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ status: 'PUBLISHED' })
        .expect(200);

      const res = await request(app.getHttpServer()).get(`/events/${event.slug}/ticket-types`).expect(200);
      expect(Number(res.body[0].price)).toBe(5000);
      expect(res.body[0].displayPrice).toBeGreaterThan(5000);
    });

    it('excludes presale_whitelist ticket types — no visitor identity to check on this anonymous page', async () => {
      const { accessToken, organizationId, userId } = await registerOrganizer();
      const event = await createEvent(organizationId, userId);
      await request(app.getHttpServer())
        .post(`/organizations/${organizationId}/events/${event.id}/ticket-types`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          ...ticketTypePayload(),
          name: 'Whitelist',
          accessMode: 'PRESALE_WHITELIST',
          saleStart: '2020-01-01T00:00:00.000Z',
          saleEnd: '2030-01-01T00:00:00.000Z',
        })
        .expect(201);
      await request(app.getHttpServer())
        .post(`/organizations/${organizationId}/events/${event.id}/ticket-types`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ ...ticketTypePayload(), name: 'Public', saleStart: '2020-01-01T00:00:00.000Z', saleEnd: '2030-01-01T00:00:00.000Z' })
        .expect(201);
      await seedImage(event.id);
      await request(app.getHttpServer())
        .patch(`/organizations/${organizationId}/events/${event.id}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ status: 'PUBLISHED' })
        .expect(200);

      const res = await request(app.getHttpServer()).get(`/events/${event.slug}/ticket-types`).expect(200);
      expect(res.body).toHaveLength(1);
      expect(res.body[0].name).toBe('Public');
    });
  });
});
