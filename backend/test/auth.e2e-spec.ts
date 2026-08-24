import { randomUUID } from 'crypto';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { AuthService } from '../src/auth/auth.service';
import { PrismaService } from '../src/prisma/prisma.service';

describe('Auth (e2e)', () => {
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
    // organization has no ON DELETE on users, so it's removed explicitly.
    for (const email of createdUserEmails) {
      const user = await prisma.user.findFirst({ where: { email } });
      if (!user) continue;
      await prisma.organization.deleteMany({ where: { ownerUserId: user.id } });
      await prisma.user.delete({ where: { id: user.id } });
    }
    await app.close();
  });

  function registerPayload() {
    const unique = randomUUID();
    return {
      email: `organizer-${unique}@example.com`,
      password: 'super-secret-password',
      fullName: 'Amadou Ba',
      organizationName: 'Amadou Events',
      organizationSlug: `amadou-events-${unique}`,
    };
  }

  describe('POST /auth/register + /auth/login + GET /auth/me', () => {
    it('registers an organizer and returns a usable token', async () => {
      const payload = registerPayload();
      createdUserEmails.push(payload.email);

      const res = await request(app.getHttpServer()).post('/auth/register').send(payload).expect(201);

      expect(res.body.accessToken).toEqual(expect.any(String));
      expect(res.body.user.email).toBe(payload.email);
      expect(res.body.user.passwordHash).toBeUndefined();

      const me = await request(app.getHttpServer())
        .get('/auth/me')
        .set('Authorization', `Bearer ${res.body.accessToken}`)
        .expect(200);

      expect(me.body.memberships).toHaveLength(1);
      expect(me.body.memberships[0].role).toBe('OWNER');
      expect(me.body.memberships[0].organization.slug).toBe(payload.organizationSlug);
    });

    it('rejects registration with an email already in use', async () => {
      const payload = registerPayload();
      createdUserEmails.push(payload.email);

      await request(app.getHttpServer()).post('/auth/register').send(payload).expect(201);
      await request(app.getHttpServer())
        .post('/auth/register')
        .send({ ...payload, organizationSlug: `${payload.organizationSlug}-2` })
        .expect(409);
    });

    it('logs in with correct credentials', async () => {
      const payload = registerPayload();
      createdUserEmails.push(payload.email);
      await request(app.getHttpServer()).post('/auth/register').send(payload).expect(201);

      const res = await request(app.getHttpServer())
        .post('/auth/login')
        .send({ email: payload.email, password: payload.password })
        .expect(201);

      expect(res.body.accessToken).toEqual(expect.any(String));
    });

    it('rejects login with a wrong password', async () => {
      const payload = registerPayload();
      createdUserEmails.push(payload.email);
      await request(app.getHttpServer()).post('/auth/register').send(payload).expect(201);

      await request(app.getHttpServer())
        .post('/auth/login')
        .send({ email: payload.email, password: 'not-the-right-password' })
        .expect(401);
    });

    it('rejects GET /auth/me without a token', async () => {
      await request(app.getHttpServer()).get('/auth/me').expect(401);
    });
  });

  describe('AuthService.loginWithGoogle', () => {
    it('creates a new organizer account + placeholder organization on first Google sign-in', async () => {
      const unique = randomUUID();
      const email = `googleuser-${unique}@example.com`;
      createdUserEmails.push(email);

      const result = await authService.loginWithGoogle({
        googleId: `google-${unique}`,
        email,
        fullName: 'Fatou Ndiaye',
      });

      expect(result.accessToken).toEqual(expect.any(String));
      expect(result.user.email).toBe(email);

      const memberships = await prisma.organizationMember.findMany({
        where: { userId: result.user.id },
        include: { organization: true },
      });
      expect(memberships).toHaveLength(1);
      expect(memberships[0].role).toBe('OWNER');
      expect(memberships[0].organization.name).toBe('Organisation de Fatou');
    });

    it('reconnects the same user on a second Google sign-in without creating a duplicate', async () => {
      const unique = randomUUID();
      const email = `googleuser-${unique}@example.com`;
      createdUserEmails.push(email);
      const googleId = `google-${unique}`;

      const first = await authService.loginWithGoogle({ googleId, email, fullName: 'Omar Diallo' });
      const second = await authService.loginWithGoogle({ googleId, email, fullName: 'Omar Diallo' });

      expect(second.user.id).toBe(first.user.id);
      const count = await prisma.user.count({ where: { email } });
      expect(count).toBe(1);
    });

    it('links a Google identity to an existing classic account with the same email', async () => {
      const payload = registerPayload();
      createdUserEmails.push(payload.email);
      const registered = await authService.register(payload);

      const linked = await authService.loginWithGoogle({
        googleId: `google-${randomUUID()}`,
        email: payload.email,
        fullName: payload.fullName,
      });

      expect(linked.user.id).toBe(registered.user.id);
      const count = await prisma.user.count({ where: { email: payload.email } });
      expect(count).toBe(1);
    });
  });

  describe('PATCH /auth/password', () => {
    it('changes the password when the current one is correct', async () => {
      const payload = registerPayload();
      createdUserEmails.push(payload.email);
      const registered = await request(app.getHttpServer()).post('/auth/register').send(payload).expect(201);

      await request(app.getHttpServer())
        .patch('/auth/password')
        .set('Authorization', `Bearer ${registered.body.accessToken}`)
        .send({ currentPassword: payload.password, newPassword: 'a-brand-new-password' })
        .expect(200);

      await request(app.getHttpServer())
        .post('/auth/login')
        .send({ email: payload.email, password: payload.password })
        .expect(401);

      await request(app.getHttpServer())
        .post('/auth/login')
        .send({ email: payload.email, password: 'a-brand-new-password' })
        .expect(201);
    });

    it('rejects a wrong current password', async () => {
      const payload = registerPayload();
      createdUserEmails.push(payload.email);
      const registered = await request(app.getHttpServer()).post('/auth/register').send(payload).expect(201);

      await request(app.getHttpServer())
        .patch('/auth/password')
        .set('Authorization', `Bearer ${registered.body.accessToken}`)
        .send({ currentPassword: 'not-the-right-password', newPassword: 'a-brand-new-password' })
        .expect(401);
    });

    it('rejects changing the password on a Google-only account with a clear error, not a crash', async () => {
      const unique = randomUUID();
      const email = `googleonly-${unique}@example.com`;
      createdUserEmails.push(email);

      const google = await authService.loginWithGoogle({
        googleId: `google-${unique}`,
        email,
        fullName: 'Aissatou Sow',
      });

      const res = await request(app.getHttpServer())
        .patch('/auth/password')
        .set('Authorization', `Bearer ${google.accessToken}`)
        .send({ currentPassword: 'anything', newPassword: 'a-brand-new-password' })
        .expect(400);

      expect(res.body.message).toMatch(/Google/);
    });

    it('exposes hasPassword on GET /auth/me for both account types', async () => {
      const payload = registerPayload();
      createdUserEmails.push(payload.email);
      const registered = await request(app.getHttpServer()).post('/auth/register').send(payload).expect(201);

      const classicMe = await request(app.getHttpServer())
        .get('/auth/me')
        .set('Authorization', `Bearer ${registered.body.accessToken}`)
        .expect(200);
      expect(classicMe.body.hasPassword).toBe(true);

      const unique = randomUUID();
      const email = `googleonly2-${unique}@example.com`;
      createdUserEmails.push(email);
      const google = await authService.loginWithGoogle({
        googleId: `google-${unique}`,
        email,
        fullName: 'Ibrahima Fall',
      });

      const googleMe = await request(app.getHttpServer())
        .get('/auth/me')
        .set('Authorization', `Bearer ${google.accessToken}`)
        .expect(200);
      expect(googleMe.body.hasPassword).toBe(false);
    });
  });
});
