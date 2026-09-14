import { randomUUID } from 'crypto';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { AuthService } from '../src/auth/auth.service';
import { EmailChannel } from '../src/notifications/channels/email.channel';
import { PrismaService } from '../src/prisma/prisma.service';

describe('Organizer public profile (e2e)', () => {
  let app: INestApplication;
  let authService: AuthService;
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
    emailChannel = moduleFixture.get(EmailChannel);
    prisma = moduleFixture.get(PrismaService);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  afterAll(async () => {
    // Dependents before parents (CLAUDE.md FK cascade note): organizer
    // subscriptions and their notifications cascade with the organization,
    // but events don't cascade away notifications referencing them
    // (event_id is ON DELETE NO ACTION) — deleted explicitly first.
    for (const email of createdUserEmails) {
      const user = await prisma.user.findFirst({ where: { email } });
      if (!user) continue;
      const organizations = await prisma.organization.findMany({ where: { ownerUserId: user.id } });
      const eventIds = (
        await prisma.event.findMany({ where: { organizationId: { in: organizations.map((o) => o.id) } } })
      ).map((e) => e.id);
      await prisma.notification.deleteMany({ where: { eventId: { in: eventIds } } });
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

    const { accessToken, user } = await authService.register({
      email,
      password: 'super-secret-password',
      fullName: 'Amadou Ba',
      passwordConfirmation: 'super-secret-password',
      marketingOptIn: false,
      termsAccepted: true,
    });

    const organization = await prisma.organization.findFirstOrThrow({ where: { ownerUserId: user.id } });
    return { accessToken, organizationId: organization.id, slug: organization.slug };
  }

  async function realCategoryId() {
    const category = await prisma.eventCategory.findFirstOrThrow({ where: { isActive: true } });
    return category.id;
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
        saleEnd: '2030-12-31T23:59:59.000Z',
      },
    });
  }

  // Creates a fully-qualified event (category/address/image/ticket type —
  // the mandatory-fields gate, see events.e2e-spec.ts) and publishes it via
  // the real HTTP transition, so EventsService.update's isPublishing hook
  // runs exactly as it would in production.
  async function createPublishedEvent(
    accessToken: string,
    organizationId: string,
    startAt: string,
    endAt: string,
  ) {
    const unique = randomUUID();
    const categoryId = await realCategoryId();
    const created = await request(app.getHttpServer())
      .post(`/organizations/${organizationId}/events`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        name: 'Festival de Test',
        slug: `festival-de-test-${unique}`,
        address: 'Route de la Corniche, Dakar',
        categoryId,
        startAt,
        endAt,
      })
      .expect(201);

    await seedImage(created.body.id);
    await seedTicketType(created.body.id);

    await request(app.getHttpServer())
      .patch(`/organizations/${organizationId}/events/${created.body.id}`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ status: 'PUBLISHED' })
      .expect(200);

    return created.body.id as string;
  }

  describe('GET /organizers/:slug', () => {
    it('returns the public profile with a published-event count', async () => {
      const { accessToken, organizationId, slug } = await registerOrganizer();
      await createPublishedEvent(accessToken, organizationId, '2027-01-01T18:00:00.000Z', '2027-01-01T23:00:00.000Z');
      await createPublishedEvent(accessToken, organizationId, '2027-02-01T18:00:00.000Z', '2027-02-01T23:00:00.000Z');

      const res = await request(app.getHttpServer()).get(`/organizers/${slug}`).expect(200);

      expect(res.body).toMatchObject({ slug, isVerified: false, publishedEventCount: 2 });
      expect(res.body).not.toHaveProperty('subscriberCount');
      expect(res.body.avatarUrl).toBeNull();
      expect(res.body.coverUrl).toBeNull();
      expect(res.body.bio).toBeNull();
    });

    it('exposes avatarUrl, coverUrl and bio once set on the organization', async () => {
      const { organizationId, slug } = await registerOrganizer();
      await prisma.organization.update({
        where: { id: organizationId },
        data: {
          avatarImageUrl: 'https://cdn.example.com/avatar.jpg',
          coverImageUrl: 'https://cdn.example.com/cover.jpg',
          bio: 'Organisateur de festivals depuis 2015.',
        },
      });

      const res = await request(app.getHttpServer()).get(`/organizers/${slug}`).expect(200);

      expect(res.body.avatarUrl).toBe('https://cdn.example.com/avatar.jpg');
      expect(res.body.coverUrl).toBe('https://cdn.example.com/cover.jpg');
      expect(res.body.bio).toBe('Organisateur de festivals depuis 2015.');
    });

    it('returns 404 for an unknown slug', async () => {
      await request(app.getHttpServer()).get('/organizers/does-not-exist-xyz').expect(404);
    });

    it('returns 404 for a suspended organization', async () => {
      const { organizationId, slug } = await registerOrganizer();
      await prisma.organization.update({ where: { id: organizationId }, data: { suspendedAt: new Date() } });

      await request(app.getHttpServer()).get(`/organizers/${slug}`).expect(404);
    });
  });

  describe('GET /organizers/:slug/events', () => {
    it('splits events between upcoming and past, excluding drafts', async () => {
      const { accessToken, organizationId, slug } = await registerOrganizer();
      await createPublishedEvent(accessToken, organizationId, '2027-06-01T18:00:00.000Z', '2027-06-01T23:00:00.000Z');
      await createPublishedEvent(accessToken, organizationId, '2019-06-01T18:00:00.000Z', '2019-06-01T23:00:00.000Z');
      // A bare draft (no image/ticket type/publish) must never surface here.
      await request(app.getHttpServer())
        .post(`/organizations/${organizationId}/events`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          name: 'Brouillon',
          slug: `brouillon-${randomUUID()}`,
          startAt: '2028-01-01T18:00:00.000Z',
          endAt: '2028-01-01T23:00:00.000Z',
        })
        .expect(201);

      const upcoming = await request(app.getHttpServer())
        .get(`/organizers/${slug}/events`)
        .query({ when: 'upcoming' })
        .expect(200);
      expect(upcoming.body.total).toBe(1);
      expect(upcoming.body.items[0].name).toBe('Festival de Test');

      const past = await request(app.getHttpServer())
        .get(`/organizers/${slug}/events`)
        .query({ when: 'past' })
        .expect(200);
      expect(past.body.total).toBe(1);
    });
  });

  describe('subscribe / unsubscribe', () => {
    it('subscribes, and a second subscription with the same email is silent (no duplicate row)', async () => {
      const { slug, organizationId } = await registerOrganizer();
      const email = `fan-${randomUUID()}@example.com`;

      await request(app.getHttpServer()).post(`/organizers/${slug}/subscribe`).send({ email }).expect(201);
      await request(app.getHttpServer()).post(`/organizers/${slug}/subscribe`).send({ email }).expect(201);

      const rows = await prisma.organizerSubscription.findMany({ where: { organizationId, email } });
      expect(rows).toHaveLength(1);
    });

    it('unsubscribing by email always returns a generic success, subscribed or not', async () => {
      const { slug, organizationId } = await registerOrganizer();
      const subscribedEmail = `fan-${randomUUID()}@example.com`;
      const neverSubscribedEmail = `ghost-${randomUUID()}@example.com`;
      await request(app.getHttpServer()).post(`/organizers/${slug}/subscribe`).send({ email: subscribedEmail }).expect(201);

      const res1 = await request(app.getHttpServer())
        .post(`/organizers/${slug}/unsubscribe`)
        .send({ email: subscribedEmail })
        .expect(201);
      const res2 = await request(app.getHttpServer())
        .post(`/organizers/${slug}/unsubscribe`)
        .send({ email: neverSubscribedEmail })
        .expect(201);

      expect(res1.body).toEqual({ success: true });
      expect(res2.body).toEqual({ success: true });
      const remaining = await prisma.organizerSubscription.findMany({ where: { organizationId, email: subscribedEmail } });
      expect(remaining).toHaveLength(0);
    });

    it('unsubscribing by token deletes the row; a garbage token still succeeds generically', async () => {
      const { slug, organizationId } = await registerOrganizer();
      const email = `fan-${randomUUID()}@example.com`;
      await request(app.getHttpServer()).post(`/organizers/${slug}/subscribe`).send({ email }).expect(201);
      const subscription = await prisma.organizerSubscription.findFirstOrThrow({ where: { organizationId, email } });

      const res = await request(app.getHttpServer()).get('/unsubscribe').query({ token: subscription.id }).expect(200);
      expect(res.body).toEqual({ success: true });
      await expect(prisma.organizerSubscription.findUnique({ where: { id: subscription.id } })).resolves.toBeNull();

      const garbage = await request(app.getHttpServer()).get('/unsubscribe').query({ token: 'not-a-uuid' }).expect(200);
      expect(garbage.body).toEqual({ success: true });
    });
  });

  describe('POST /organizers/:slug/contact', () => {
    it('sends an email to the organization contact address', async () => {
      const { organizationId, slug } = await registerOrganizer();
      const contactEmail = `contact-${randomUUID()}@example.com`;
      await prisma.organization.update({ where: { id: organizationId }, data: { contactEmail } });
      const sendSpy = jest.spyOn(emailChannel, 'send').mockResolvedValue();

      await request(app.getHttpServer())
        .post(`/organizers/${slug}/contact`)
        .send({ name: 'Fatou Diop', email: 'fatou@example.com', subject: 'Question', message: 'Bonjour !' })
        .expect(201);

      expect(sendSpy).toHaveBeenCalledWith(
        expect.objectContaining({ to: contactEmail, subject: expect.stringContaining('Question') }),
      );
    });

    it('returns 404 when the organization has no contact email configured', async () => {
      const { slug } = await registerOrganizer();

      await request(app.getHttpServer())
        .post(`/organizers/${slug}/contact`)
        .send({ name: 'Fatou Diop', email: 'fatou@example.com', subject: 'Question', message: 'Bonjour !' })
        .expect(404);
    });

    it('returns 404 for a suspended organization', async () => {
      const { organizationId, slug } = await registerOrganizer();
      await prisma.organization.update({
        where: { id: organizationId },
        data: { contactEmail: 'contact@example.com', suspendedAt: new Date() },
      });

      await request(app.getHttpServer())
        .post(`/organizers/${slug}/contact`)
        .send({ name: 'Fatou Diop', email: 'fatou@example.com', subject: 'Question', message: 'Bonjour !' })
        .expect(404);
    });
  });
});
