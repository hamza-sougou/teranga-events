import { randomUUID } from 'crypto';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { AuthService } from '../src/auth/auth.service';
import { R2Provider } from '../src/storage/providers/r2.provider';
import { PrismaService } from '../src/prisma/prisma.service';

describe('Organization media (e2e)', () => {
  let app: INestApplication;
  let authService: AuthService;
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

    const organization = await prisma.organization.findFirstOrThrow({ where: { ownerUserId: user.id } });
    return { accessToken, organizationId: organization.id, userId: user.id };
  }

  function presignPayload(overrides: Partial<{ type: string; mimeType: string; sizeBytes: number }> = {}) {
    return {
      type: 'avatar',
      mimeType: 'image/jpeg',
      sizeBytes: 1024,
      ...overrides,
    };
  }

  describe('POST .../media/presign', () => {
    it('returns a presigned upload URL for a valid avatar request', async () => {
      const { accessToken, organizationId } = await registerOrganizer();
      // Mocked like event-media.e2e-spec.ts — no real R2 credentials exist
      // yet this session.
      jest.spyOn(r2Provider, 'getPresignedUploadUrl').mockResolvedValue('https://r2.example.com/fake-upload-url');

      const res = await request(app.getHttpServer())
        .post(`/organizations/${organizationId}/media/presign`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send(presignPayload())
        .expect(201);

      expect(res.body.uploadUrl).toBe('https://r2.example.com/fake-upload-url');
      expect(res.body.storageKey).toMatch(new RegExp(`^organizations/${organizationId}/avatar-.+\\.jpg$`));
      expect(res.body.publicUrl).toContain(res.body.storageKey);
    });

    it('rejects an unsupported mime type with 400', async () => {
      const { accessToken, organizationId } = await registerOrganizer();

      await request(app.getHttpServer())
        .post(`/organizations/${organizationId}/media/presign`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send(presignPayload({ mimeType: 'image/heic' }))
        .expect(400);
    });

    it('rejects a file over the 5MB image limit with 400', async () => {
      const { accessToken, organizationId } = await registerOrganizer();

      await request(app.getHttpServer())
        .post(`/organizations/${organizationId}/media/presign`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send(presignPayload({ sizeBytes: 6 * 1024 * 1024 }))
        .expect(400);
    });

    it('rejects an invalid type value with 400', async () => {
      const { accessToken, organizationId } = await registerOrganizer();

      await request(app.getHttpServer())
        .post(`/organizations/${organizationId}/media/presign`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send(presignPayload({ type: 'banner' }))
        .expect(400);
    });

    it('rejects a caller with no membership in the organization', async () => {
      const { organizationId } = await registerOrganizer();
      const outsider = await registerOrganizer();

      await request(app.getHttpServer())
        .post(`/organizations/${organizationId}/media/presign`)
        .set('Authorization', `Bearer ${outsider.accessToken}`)
        .send(presignPayload())
        .expect(403);
    });
  });

  describe('POST .../media/confirm', () => {
    it('sets the avatar columns when the R2 object matches the declared metadata', async () => {
      const { accessToken, organizationId } = await registerOrganizer();
      jest.spyOn(r2Provider, 'headObject').mockResolvedValue({ sizeBytes: 1024, contentType: 'image/jpeg' });

      const res = await request(app.getHttpServer())
        .post(`/organizations/${organizationId}/media/confirm`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ type: 'avatar', storageKey: `organizations/${organizationId}/avatar-x.jpg`, mimeType: 'image/jpeg', sizeBytes: 1024 })
        .expect(201);

      expect(res.body.avatarImageUrl).toContain(`organizations/${organizationId}/avatar-x.jpg`);
      const stored = await prisma.organization.findUniqueOrThrow({ where: { id: organizationId } });
      expect(stored.avatarStorageKey).toBe(`organizations/${organizationId}/avatar-x.jpg`);
    });

    it('deletes the previous R2 object only after the new one is committed to the DB', async () => {
      const { accessToken, organizationId } = await registerOrganizer();
      jest.spyOn(r2Provider, 'headObject').mockResolvedValue({ sizeBytes: 1024, contentType: 'image/jpeg' });
      const deleteSpy = jest.spyOn(r2Provider, 'deleteObject').mockResolvedValue(undefined);

      await request(app.getHttpServer())
        .post(`/organizations/${organizationId}/media/confirm`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ type: 'cover', storageKey: 'first-key.jpg', mimeType: 'image/jpeg', sizeBytes: 1024 })
        .expect(201);
      expect(deleteSpy).not.toHaveBeenCalled();

      await request(app.getHttpServer())
        .post(`/organizations/${organizationId}/media/confirm`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ type: 'cover', storageKey: 'second-key.jpg', mimeType: 'image/jpeg', sizeBytes: 1024 })
        .expect(201);

      expect(deleteSpy).toHaveBeenCalledWith('first-key.jpg');
      const stored = await prisma.organization.findUniqueOrThrow({ where: { id: organizationId } });
      expect(stored.coverStorageKey).toBe('second-key.jpg');
    });

    it('rejects when the R2 object is missing (HEAD returns null)', async () => {
      const { accessToken, organizationId } = await registerOrganizer();
      jest.spyOn(r2Provider, 'headObject').mockResolvedValue(null);

      await request(app.getHttpServer())
        .post(`/organizations/${organizationId}/media/confirm`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ type: 'avatar', storageKey: 'x.jpg', mimeType: 'image/jpeg', sizeBytes: 1024 })
        .expect(400);
    });

    it('rejects when the actual R2 object size does not match the declared size', async () => {
      const { accessToken, organizationId } = await registerOrganizer();
      jest.spyOn(r2Provider, 'headObject').mockResolvedValue({ sizeBytes: 999, contentType: 'image/jpeg' });

      await request(app.getHttpServer())
        .post(`/organizations/${organizationId}/media/confirm`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ type: 'avatar', storageKey: 'x.jpg', mimeType: 'image/jpeg', sizeBytes: 1024 })
        .expect(400);
    });
  });

  describe('DELETE .../media/:type', () => {
    it('nulls the columns and deletes the R2 object', async () => {
      const { accessToken, organizationId } = await registerOrganizer();
      await prisma.organization.update({
        where: { id: organizationId },
        data: { avatarStorageKey: 'a.jpg', avatarImageUrl: 'https://example.com/a.jpg' },
      });
      const deleteSpy = jest.spyOn(r2Provider, 'deleteObject').mockResolvedValue(undefined);

      const res = await request(app.getHttpServer())
        .delete(`/organizations/${organizationId}/media/avatar`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      expect(res.body.avatarImageUrl).toBeNull();
      expect(deleteSpy).toHaveBeenCalledWith('a.jpg');
      const stored = await prisma.organization.findUniqueOrThrow({ where: { id: organizationId } });
      expect(stored.avatarStorageKey).toBeNull();
    });

    it('is idempotent — calling it twice both return 200', async () => {
      const { accessToken, organizationId } = await registerOrganizer();
      jest.spyOn(r2Provider, 'deleteObject').mockResolvedValue(undefined);

      await request(app.getHttpServer())
        .delete(`/organizations/${organizationId}/media/cover`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      await request(app.getHttpServer())
        .delete(`/organizations/${organizationId}/media/cover`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);
    });

    it('rejects an invalid type route param with 400', async () => {
      const { accessToken, organizationId } = await registerOrganizer();

      await request(app.getHttpServer())
        .delete(`/organizations/${organizationId}/media/banner`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(400);
    });

    it('rejects a caller with no membership in the organization', async () => {
      const { organizationId } = await registerOrganizer();
      const outsider = await registerOrganizer();

      await request(app.getHttpServer())
        .delete(`/organizations/${organizationId}/media/avatar`)
        .set('Authorization', `Bearer ${outsider.accessToken}`)
        .expect(403);
    });
  });
});
