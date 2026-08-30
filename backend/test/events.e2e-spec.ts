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
      passwordConfirmation: 'super-secret-password',
      marketingOptIn: false,
      termsAccepted: true,
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

  describe('geolocation', () => {
    it('round-trips country/city/latitude/longitude through create and the detail read', async () => {
      const { accessToken, organizationId } = await registerOrganizer();
      const payload = { ...eventPayload(), country: 'Sénégal', city: 'Dakar', latitude: 14.6928, longitude: -17.4467 };

      const created = await request(app.getHttpServer())
        .post(`/organizations/${organizationId}/events`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send(payload)
        .expect(201);

      expect(created.body.country).toBe('Sénégal');
      expect(created.body.city).toBe('Dakar');
      expect(Number(created.body.latitude)).toBeCloseTo(14.6928);
      expect(Number(created.body.longitude)).toBeCloseTo(-17.4467);

      const detail = await request(app.getHttpServer())
        .get(`/organizations/${organizationId}/events/${created.body.id}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      expect(Number(detail.body.latitude)).toBeCloseTo(14.6928);
      expect(Number(detail.body.longitude)).toBeCloseTo(-17.4467);
    });

    it('defaults country to Sénégal when omitted on create', async () => {
      const { accessToken, organizationId } = await registerOrganizer();

      const created = await request(app.getHttpServer())
        .post(`/organizations/${organizationId}/events`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send(eventPayload())
        .expect(201);

      expect(created.body.country).toBe('Sénégal');
      expect(created.body.city).toBeNull();
      expect(created.body.latitude).toBeNull();
      expect(created.body.longitude).toBeNull();
    });

    it('rejects create with only latitude and no longitude with 400', async () => {
      const { accessToken, organizationId } = await registerOrganizer();
      const payload = { ...eventPayload(), latitude: 14.6928 };

      await request(app.getHttpServer())
        .post(`/organizations/${organizationId}/events`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send(payload)
        .expect(400);
    });

    it('rejects update with only longitude and no latitude with 400', async () => {
      const { accessToken, organizationId } = await registerOrganizer();
      const created = await request(app.getHttpServer())
        .post(`/organizations/${organizationId}/events`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send(eventPayload())
        .expect(201);

      await request(app.getHttpServer())
        .patch(`/organizations/${organizationId}/events/${created.body.id}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ longitude: -17.4467 })
        .expect(400);
    });

    it('leaves geolocation fields null after an unrelated update on a legacy event', async () => {
      const { accessToken, organizationId } = await registerOrganizer();
      const created = await request(app.getHttpServer())
        .post(`/organizations/${organizationId}/events`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send(eventPayload())
        .expect(201);

      const updated = await request(app.getHttpServer())
        .patch(`/organizations/${organizationId}/events/${created.body.id}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ name: 'Nom mis à jour' })
        .expect(200);

      expect(updated.body.name).toBe('Nom mis à jour');
      expect(updated.body.city).toBeNull();
      expect(updated.body.latitude).toBeNull();
      expect(updated.body.longitude).toBeNull();
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
      // "Organisé par" on the participant page needs the organizer's name —
      // nothing else about the organization (id, verification, etc.) leaks.
      expect(res.body.organization).toEqual({ name: 'Organisation de Amadou' });
    });
  });

  describe('optional settings (min age & dress code)', () => {
    it('treats an absent minAge as "everyone" (null)', async () => {
      const { accessToken, organizationId } = await registerOrganizer();

      const res = await request(app.getHttpServer())
        .post(`/organizations/${organizationId}/events`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send(eventPayload())
        .expect(201);

      expect(res.body.minAge).toBeNull();
      expect(res.body.dressCodes).toEqual([]);
    });

    it('rejects a 4th dress code entry for the same applies_to with 400', async () => {
      const { accessToken, organizationId } = await registerOrganizer();
      const payload = {
        ...eventPayload(),
        dressCodes: [
          { label: 'Costume', appliesTo: 'MEN' },
          { label: 'Chemise', appliesTo: 'MEN' },
          { label: 'Blazer', appliesTo: 'MEN' },
          { label: 'Veston', appliesTo: 'MEN' },
        ],
      };

      await request(app.getHttpServer())
        .post(`/organizations/${organizationId}/events`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send(payload)
        .expect(400);
    });

    it('accepts up to 3 entries per bucket independently (9 total)', async () => {
      const { accessToken, organizationId } = await registerOrganizer();
      const payload = {
        ...eventPayload(),
        minAge: 18,
        dressCodes: [
          { label: 'Tenue chic', appliesTo: 'EVERYONE' },
          { label: 'Pas de tongs', appliesTo: 'EVERYONE' },
          { label: 'Pas de shorts', appliesTo: 'EVERYONE' },
          { label: 'Costume', appliesTo: 'MEN' },
          { label: 'Chemise', appliesTo: 'MEN' },
          { label: 'Blazer', appliesTo: 'MEN' },
          { label: 'Robe', appliesTo: 'WOMEN' },
          { label: 'Talons', appliesTo: 'WOMEN' },
          { label: 'Tailleur', appliesTo: 'WOMEN' },
        ],
      };

      const res = await request(app.getHttpServer())
        .post(`/organizations/${organizationId}/events`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send(payload)
        .expect(201);

      expect(res.body.minAge).toBe(18);
      expect(res.body.dressCodes).toHaveLength(9);
      expect(res.body.dressCodes.filter((d: { appliesTo: string }) => d.appliesTo === 'MEN')).toHaveLength(3);
      expect(res.body.dressCodes.filter((d: { appliesTo: string }) => d.appliesTo === 'WOMEN')).toHaveLength(3);
      expect(res.body.dressCodes.filter((d: { appliesTo: string }) => d.appliesTo === 'EVERYONE')).toHaveLength(3);
    });

    it('rejects a dress code label over 25 characters with 400', async () => {
      const { accessToken, organizationId } = await registerOrganizer();
      const payload = {
        ...eventPayload(),
        dressCodes: [{ label: 'Un libellé bien trop long pour tenir', appliesTo: 'EVERYONE' }],
      };

      await request(app.getHttpServer())
        .post(`/organizations/${organizationId}/events`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send(payload)
        .expect(400);
    });

    it('fully replaces the dress code list on update, never merges', async () => {
      const { accessToken, organizationId } = await registerOrganizer();
      const created = await request(app.getHttpServer())
        .post(`/organizations/${organizationId}/events`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          ...eventPayload(),
          dressCodes: [
            { label: 'Ancien 1', appliesTo: 'EVERYONE' },
            { label: 'Ancien 2', appliesTo: 'EVERYONE' },
          ],
        })
        .expect(201);

      const updated = await request(app.getHttpServer())
        .patch(`/organizations/${organizationId}/events/${created.body.id}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ dressCodes: [{ label: 'Nouveau', appliesTo: 'WOMEN' }] })
        .expect(200);

      expect(updated.body.dressCodes).toHaveLength(1);
      expect(updated.body.dressCodes[0]).toMatchObject({ label: 'Nouveau', appliesTo: 'WOMEN' });
    });

    it('clears minAge when the update explicitly sends null', async () => {
      const { accessToken, organizationId } = await registerOrganizer();
      const created = await request(app.getHttpServer())
        .post(`/organizations/${organizationId}/events`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ ...eventPayload(), minAge: 21 })
        .expect(201);
      expect(created.body.minAge).toBe(21);

      const updated = await request(app.getHttpServer())
        .patch(`/organizations/${organizationId}/events/${created.body.id}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ minAge: null })
        .expect(200);

      expect(updated.body.minAge).toBeNull();
    });
  });
});
