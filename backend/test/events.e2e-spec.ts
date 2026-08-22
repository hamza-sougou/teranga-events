import { randomUUID } from 'crypto';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { AuthService } from '../src/auth/auth.service';
import { PrismaService } from '../src/prisma/prisma.service';

describe('Events (e2e)', () => {
  let app: INestApplication;
  let authService: AuthService;
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
    prisma = moduleFixture.get(PrismaService);
  });

  afterAll(async () => {
    // Deleting the user cascades to organization_members; the owned
    // organization (and its events, cascading) has no ON DELETE on users,
    // so it's removed explicitly first.
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
      organizationName: 'Amadou Events',
      organizationSlug: `amadou-events-${unique}`,
    });

    const organization = await prisma.organization.findFirstOrThrow({
      where: { ownerUserId: user.id },
    });

    return { accessToken, organizationId: organization.id };
  }

  function eventPayload() {
    const unique = randomUUID();
    return {
      name: 'Festival de Test',
      slug: `festival-de-test-${unique}`,
      venueName: 'Stade Test',
      startAt: '2027-01-01T18:00:00.000Z',
      endAt: '2027-01-01T23:00:00.000Z',
    };
  }

  // Seeded directly via Prisma, not through the real upload flow — this
  // suite tests the publish-gate business rule, not R2 itself (see
  // event-media.e2e-spec.ts for the upload endpoints).
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

  function seedVideo(eventId: string) {
    return prisma.eventMedia.create({
      data: {
        eventId,
        type: 'VIDEO',
        storageKey: `test/${eventId}.mp4`,
        url: `https://example.com/test/${eventId}.mp4`,
        mimeType: 'video/mp4',
        sizeBytes: 4096,
      },
    });
  }

  it('creates an event as OWNER', async () => {
    const { accessToken, organizationId } = await registerOrganizer();
    const payload = eventPayload();

    const res = await request(app.getHttpServer())
      .post(`/organizations/${organizationId}/events`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send(payload)
      .expect(201);

    expect(res.body.slug).toBe(payload.slug);
    expect(res.body.status).toBe('DRAFT');
  });

  it('rejects a duplicate event slug with 409', async () => {
    const { accessToken, organizationId } = await registerOrganizer();
    const payload = eventPayload();

    await request(app.getHttpServer())
      .post(`/organizations/${organizationId}/events`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send(payload)
      .expect(201);

    await request(app.getHttpServer())
      .post(`/organizations/${organizationId}/events`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send(payload)
      .expect(409);
  });

  it('rejects endAt before startAt with 400', async () => {
    const { accessToken, organizationId } = await registerOrganizer();
    const payload = { ...eventPayload(), startAt: '2027-01-01T23:00:00.000Z', endAt: '2027-01-01T18:00:00.000Z' };

    await request(app.getHttpServer())
      .post(`/organizations/${organizationId}/events`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send(payload)
      .expect(400);
  });

  it('rejects event creation without a token', async () => {
    const { organizationId } = await registerOrganizer();

    await request(app.getHttpServer())
      .post(`/organizations/${organizationId}/events`)
      .send(eventPayload())
      .expect(401);
  });

  it('rejects a user with no membership in the target organization', async () => {
    const { organizationId } = await registerOrganizer();
    const outsider = await registerOrganizer();

    await request(app.getHttpServer())
      .post(`/organizations/${organizationId}/events`)
      .set('Authorization', `Bearer ${outsider.accessToken}`)
      .send(eventPayload())
      .expect(403);

    await request(app.getHttpServer())
      .get(`/organizations/${organizationId}/events`)
      .set('Authorization', `Bearer ${outsider.accessToken}`)
      .expect(403);
  });

  it('lists events scoped to the organization', async () => {
    const { accessToken, organizationId } = await registerOrganizer();
    const payload = eventPayload();

    await request(app.getHttpServer())
      .post(`/organizations/${organizationId}/events`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send(payload)
      .expect(201);

    const res = await request(app.getHttpServer())
      .get(`/organizations/${organizationId}/events`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);

    expect(res.body).toHaveLength(1);
    expect(res.body[0].slug).toBe(payload.slug);
  });

  describe('categoryId', () => {
    it('rejects a categoryId that matches no category with 400', async () => {
      const { accessToken, organizationId } = await registerOrganizer();
      const payload = { ...eventPayload(), categoryId: randomUUID() };

      await request(app.getHttpServer())
        .post(`/organizations/${organizationId}/events`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send(payload)
        .expect(400);
    });

    it('accepts a real categoryId and returns the joined category', async () => {
      const { accessToken, organizationId } = await registerOrganizer();
      const concert = await prisma.eventCategory.findFirstOrThrow({ where: { slug: 'concert' } });
      const payload = { ...eventPayload(), categoryId: concert.id };

      const res = await request(app.getHttpServer())
        .post(`/organizations/${organizationId}/events`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send(payload)
        .expect(201);

      expect(res.body.categoryId).toBe(concert.id);
      expect(res.body.category).toMatchObject({ id: concert.id, slug: 'concert', label: 'Concert' });
    });
  });

  it('rejects an illegal status transition with 400', async () => {
    const { accessToken, organizationId } = await registerOrganizer();
    const created = await request(app.getHttpServer())
      .post(`/organizations/${organizationId}/events`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send(eventPayload())
      .expect(201);

    await request(app.getHttpServer())
      .patch(`/organizations/${organizationId}/events/${created.body.id}`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ status: 'COMPLETED' })
      .expect(400);
  });

  describe('publish requires at least one image', () => {
    it('rejects publishing a draft with zero media with 400', async () => {
      const { accessToken, organizationId } = await registerOrganizer();
      const created = await request(app.getHttpServer())
        .post(`/organizations/${organizationId}/events`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send(eventPayload())
        .expect(201);

      await request(app.getHttpServer())
        .patch(`/organizations/${organizationId}/events/${created.body.id}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ status: 'PUBLISHED' })
        .expect(400);
    });

    it('does not allow a video alone to satisfy the image requirement', async () => {
      const { accessToken, organizationId } = await registerOrganizer();
      const created = await request(app.getHttpServer())
        .post(`/organizations/${organizationId}/events`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send(eventPayload())
        .expect(201);
      await seedVideo(created.body.id);

      await request(app.getHttpServer())
        .patch(`/organizations/${organizationId}/events/${created.body.id}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ status: 'PUBLISHED' })
        .expect(400);
    });

    it('does not block saving a draft with zero media (only publish is gated)', async () => {
      const { accessToken, organizationId } = await registerOrganizer();
      const created = await request(app.getHttpServer())
        .post(`/organizations/${organizationId}/events`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send(eventPayload())
        .expect(201);

      await request(app.getHttpServer())
        .patch(`/organizations/${organizationId}/events/${created.body.id}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ venueName: 'Nouveau lieu' })
        .expect(200);
    });

    it('allows publishing once at least one image exists', async () => {
      const { accessToken, organizationId } = await registerOrganizer();
      const created = await request(app.getHttpServer())
        .post(`/organizations/${organizationId}/events`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send(eventPayload())
        .expect(201);
      await seedImage(created.body.id);

      const res = await request(app.getHttpServer())
        .patch(`/organizations/${organizationId}/events/${created.body.id}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ status: 'PUBLISHED' })
        .expect(200);

      expect(res.body.status).toBe('PUBLISHED');
    });
  });

  describe('public event page', () => {
    it('returns 404 while the event is still a draft', async () => {
      const payload = eventPayload();
      const { accessToken, organizationId } = await registerOrganizer();
      await request(app.getHttpServer())
        .post(`/organizations/${organizationId}/events`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send(payload)
        .expect(201);

      await request(app.getHttpServer()).get(`/events/${payload.slug}`).expect(404);
    });

    it('returns the public fields once published, without leaking internal fields', async () => {
      const payload = eventPayload();
      const { accessToken, organizationId } = await registerOrganizer();
      const created = await request(app.getHttpServer())
        .post(`/organizations/${organizationId}/events`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send(payload)
        .expect(201);
      await seedImage(created.body.id);

      await request(app.getHttpServer())
        .patch(`/organizations/${organizationId}/events/${created.body.id}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ status: 'PUBLISHED' })
        .expect(200);

      const res = await request(app.getHttpServer()).get(`/events/${payload.slug}`).expect(200);

      expect(res.body.slug).toBe(payload.slug);
      expect(res.body.organizationId).toBeUndefined();
      expect(res.body.createdBy).toBeUndefined();
    });
  });
});
