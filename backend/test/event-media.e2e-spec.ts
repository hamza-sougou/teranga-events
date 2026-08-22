import { randomUUID } from 'crypto';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { EventStatus } from '@prisma/client';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { AuthService } from '../src/auth/auth.service';
import { EventsService } from '../src/events/events.service';
import { R2Provider } from '../src/storage/providers/r2.provider';
import { PrismaService } from '../src/prisma/prisma.service';

describe('Event media (e2e)', () => {
  let app: INestApplication;
  let authService: AuthService;
  let eventsService: EventsService;
  let r2Provider: R2Provider;
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
    r2Provider = moduleFixture.get(R2Provider);
    prisma = moduleFixture.get(PrismaService);
  });

  afterEach(() => {
    // headObject/deleteObject are spied per-test below so we never hit real
    // R2 (no credentials exist yet this session) — presign() itself needs no
    // spy, getSignedUrl() is a pure local computation.
    jest.restoreAllMocks();
  });

  afterAll(async () => {
    // event_media cascades from events (ON DELETE CASCADE), so no separate
    // cleanup step is needed for it here.
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

    const organization = await prisma.organization.findFirstOrThrow({ where: { ownerUserId: user.id } });
    return { accessToken, organizationId: organization.id, userId: user.id };
  }

  async function createEvent(organizationId: string, userId: string) {
    const unique = randomUUID();
    return eventsService.create(organizationId, userId, {
      name: 'Festival de Test',
      slug: `festival-de-test-${unique}`,
      startAt: '2027-01-01T18:00:00.000Z',
      endAt: '2027-01-01T23:00:00.000Z',
    });
  }

  function seedMedia(eventId: string, overrides: Partial<{ type: 'IMAGE' | 'VIDEO'; storageKey: string }> = {}) {
    const key = overrides.storageKey ?? `events/${eventId}/${randomUUID()}.jpg`;
    return prisma.eventMedia.create({
      data: {
        eventId,
        type: overrides.type ?? 'IMAGE',
        storageKey: key,
        url: `https://example.com/${key}`,
        mimeType: 'image/jpeg',
        sizeBytes: 1024,
      },
    });
  }

  function presignPayload(overrides: Partial<{ type: string; filename: string; mimeType: string; sizeBytes: number }> = {}) {
    return {
      type: 'IMAGE',
      filename: 'photo.jpg',
      mimeType: 'image/jpeg',
      sizeBytes: 1024,
      ...overrides,
    };
  }

  describe('POST .../media/presign', () => {
    it('returns a presigned upload URL for a valid image request', async () => {
      const { accessToken, organizationId, userId } = await registerOrganizer();
      const event = await createEvent(organizationId, userId);
      // Mocked like paydunyaProvider.createInvoice in orders.e2e-spec.ts's
      // mockCreateInvoice() — real R2 credentials don't exist yet this
      // session (an empty R2_BUCKET_NAME breaks getSignedUrl's local request
      // building, not just network access), and this codebase's convention
      // is to never depend on real provider config even for the happy path
      // in the automated suite.
      jest.spyOn(r2Provider, 'getPresignedUploadUrl').mockResolvedValue('https://r2.example.com/fake-upload-url');

      const res = await request(app.getHttpServer())
        .post(`/organizations/${organizationId}/events/${event.id}/media/presign`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send(presignPayload())
        .expect(201);

      expect(res.body.uploadUrl).toBe('https://r2.example.com/fake-upload-url');
      expect(res.body.storageKey).toMatch(new RegExp(`^events/${event.id}/.+\\.jpg$`));
      expect(res.body.publicUrl).toContain(res.body.storageKey);
    });

    it('rejects an unsupported mime type with 400', async () => {
      const { accessToken, organizationId, userId } = await registerOrganizer();
      const event = await createEvent(organizationId, userId);

      await request(app.getHttpServer())
        .post(`/organizations/${organizationId}/events/${event.id}/media/presign`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send(presignPayload({ mimeType: 'image/heic' }))
        .expect(400);
    });

    it('rejects a file over the per-type size limit with 400', async () => {
      const { accessToken, organizationId, userId } = await registerOrganizer();
      const event = await createEvent(organizationId, userId);

      await request(app.getHttpServer())
        .post(`/organizations/${organizationId}/events/${event.id}/media/presign`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send(presignPayload({ sizeBytes: 6 * 1024 * 1024 }))
        .expect(400);
    });

    it('rejects once the per-type count limit is already reached', async () => {
      const { accessToken, organizationId, userId } = await registerOrganizer();
      const event = await createEvent(organizationId, userId);
      for (let i = 0; i < 8; i++) {
        await seedMedia(event.id, { storageKey: `events/${event.id}/${i}.jpg` });
      }

      await request(app.getHttpServer())
        .post(`/organizations/${organizationId}/events/${event.id}/media/presign`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send(presignPayload())
        .expect(400);
    });

    it('rejects when the event is cancelled', async () => {
      const { accessToken, organizationId, userId } = await registerOrganizer();
      const event = await createEvent(organizationId, userId);
      await eventsService.update(organizationId, event.id, { status: EventStatus.CANCELLED });

      await request(app.getHttpServer())
        .post(`/organizations/${organizationId}/events/${event.id}/media/presign`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send(presignPayload())
        .expect(400);
    });

    it('rejects a caller with no membership in the organization', async () => {
      const { organizationId, userId } = await registerOrganizer();
      const event = await createEvent(organizationId, userId);
      const outsider = await registerOrganizer();

      await request(app.getHttpServer())
        .post(`/organizations/${organizationId}/events/${event.id}/media/presign`)
        .set('Authorization', `Bearer ${outsider.accessToken}`)
        .send(presignPayload())
        .expect(403);
    });

    it('returns 404 when the event does not belong to the organization in the URL', async () => {
      const owner1 = await registerOrganizer();
      const event = await createEvent(owner1.organizationId, owner1.userId);
      const owner2 = await registerOrganizer();

      await request(app.getHttpServer())
        .post(`/organizations/${owner2.organizationId}/events/${event.id}/media/presign`)
        .set('Authorization', `Bearer ${owner2.accessToken}`)
        .send(presignPayload())
        .expect(404);
    });
  });

  describe('GET .../media', () => {
    it('lists media for the event ordered by creation time', async () => {
      const { accessToken, organizationId, userId } = await registerOrganizer();
      const event = await createEvent(organizationId, userId);
      const first = await seedMedia(event.id);
      const second = await seedMedia(event.id, { type: 'VIDEO' });

      const res = await request(app.getHttpServer())
        .get(`/organizations/${organizationId}/events/${event.id}/media`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      expect(res.body.map((m: { id: string }) => m.id)).toEqual([first.id, second.id]);
    });
  });

  describe('POST .../media/confirm', () => {
    it('creates the media row when the R2 object matches the declared metadata', async () => {
      const { accessToken, organizationId, userId } = await registerOrganizer();
      const event = await createEvent(organizationId, userId);
      jest.spyOn(r2Provider, 'headObject').mockResolvedValue({ sizeBytes: 1024, contentType: 'image/jpeg' });

      const res = await request(app.getHttpServer())
        .post(`/organizations/${organizationId}/events/${event.id}/media/confirm`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ type: 'IMAGE', storageKey: `events/${event.id}/x.jpg`, mimeType: 'image/jpeg', sizeBytes: 1024 })
        .expect(201);

      expect(res.body.type).toBe('IMAGE');
      const stored = await prisma.eventMedia.findUnique({ where: { id: res.body.id } });
      expect(stored).not.toBeNull();
    });

    it('rejects when the R2 object is missing (HEAD returns null)', async () => {
      const { accessToken, organizationId, userId } = await registerOrganizer();
      const event = await createEvent(organizationId, userId);
      jest.spyOn(r2Provider, 'headObject').mockResolvedValue(null);

      await request(app.getHttpServer())
        .post(`/organizations/${organizationId}/events/${event.id}/media/confirm`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ type: 'IMAGE', storageKey: `events/${event.id}/x.jpg`, mimeType: 'image/jpeg', sizeBytes: 1024 })
        .expect(400);
    });

    it('rejects when the actual R2 object size does not match the declared size', async () => {
      const { accessToken, organizationId, userId } = await registerOrganizer();
      const event = await createEvent(organizationId, userId);
      jest.spyOn(r2Provider, 'headObject').mockResolvedValue({ sizeBytes: 999, contentType: 'image/jpeg' });

      await request(app.getHttpServer())
        .post(`/organizations/${organizationId}/events/${event.id}/media/confirm`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ type: 'IMAGE', storageKey: `events/${event.id}/x.jpg`, mimeType: 'image/jpeg', sizeBytes: 1024 })
        .expect(400);
    });
  });

  describe('DELETE .../media/:mediaId', () => {
    it('deletes the R2 object then the DB row', async () => {
      const { accessToken, organizationId, userId } = await registerOrganizer();
      const event = await createEvent(organizationId, userId);
      const media = await seedMedia(event.id, { storageKey: 'a.jpg' });
      const deleteSpy = jest.spyOn(r2Provider, 'deleteObject').mockResolvedValue(undefined);

      await request(app.getHttpServer())
        .delete(`/organizations/${organizationId}/events/${event.id}/media/${media.id}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      expect(deleteSpy).toHaveBeenCalledWith('a.jpg');
      const stored = await prisma.eventMedia.findUnique({ where: { id: media.id } });
      expect(stored).toBeNull();
    });

    it('leaves the DB row intact when the R2 delete fails', async () => {
      const { accessToken, organizationId, userId } = await registerOrganizer();
      const event = await createEvent(organizationId, userId);
      const media = await seedMedia(event.id, { storageKey: 'a.jpg' });
      jest.spyOn(r2Provider, 'deleteObject').mockRejectedValue(new Error('network down'));

      await request(app.getHttpServer())
        .delete(`/organizations/${organizationId}/events/${event.id}/media/${media.id}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(500);

      const stored = await prisma.eventMedia.findUnique({ where: { id: media.id } });
      expect(stored).not.toBeNull();
    });

    it('rejects deleting media on a cancelled event with 400', async () => {
      const { accessToken, organizationId, userId } = await registerOrganizer();
      const event = await createEvent(organizationId, userId);
      const media = await seedMedia(event.id, { storageKey: 'a.jpg' });
      await eventsService.update(organizationId, event.id, { status: EventStatus.CANCELLED });

      await request(app.getHttpServer())
        .delete(`/organizations/${organizationId}/events/${event.id}/media/${media.id}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(400);
    });

    it('returns 404 for a media id that does not belong to the event', async () => {
      const { accessToken, organizationId, userId } = await registerOrganizer();
      const event = await createEvent(organizationId, userId);

      await request(app.getHttpServer())
        .delete(`/organizations/${organizationId}/events/${event.id}/media/${randomUUID()}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(404);
    });
  });
});
