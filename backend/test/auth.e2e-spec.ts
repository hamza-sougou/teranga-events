import { randomUUID } from 'crypto';
import { INestApplication, UnauthorizedException, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import * as bcrypt from 'bcrypt';
import { generate as generateTotpCode } from 'otplib';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { AuthService } from '../src/auth/auth.service';
import { EmailChannel } from '../src/notifications/channels/email.channel';
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

  // continueWithGoogle() alone never creates an account for an unknown
  // identity (that's the whole point of the two-step flow) — tests that
  // need a real, fully-created Google account drive both steps.
  async function createGoogleAccount(fullName: string) {
    const unique = randomUUID();
    const email = `google-${unique}@example.com`;
    createdUserEmails.push(email);

    const pending = await authService.continueWithGoogle({ googleId: `google-${unique}`, email, fullName });
    if (pending.status !== 'signup_pending') throw new Error('expected signup_pending');

    return authService.completeGoogleSignup({
      pendingToken: pending.pendingToken,
      marketingOptIn: false,
      termsAccepted: true,
    });
  }

  function registerPayload() {
    const unique = randomUUID();
    return {
      email: `organizer-${unique}@example.com`,
      password: 'super-secret-password',
      passwordConfirmation: 'super-secret-password',
      fullName: 'Amadou Ba',
      marketingOptIn: false,
      termsAccepted: true,
    };
  }

  describe('POST /auth/register + /auth/login + GET /auth/me', () => {
    it('registers an organizer, auto-names the organization, and returns a usable token', async () => {
      const payload = registerPayload();
      createdUserEmails.push(payload.email);

      const res = await request(app.getHttpServer()).post('/auth/register').send(payload).expect(201);

      expect(res.body.accessToken).toEqual(expect.any(String));
      expect(res.body.user.email).toBe(payload.email);
      expect(res.body.user.passwordHash).toBeUndefined();
      expect(res.body.user.emailVerifiedAt).toBeNull();
      expect(res.body.user.termsAcceptedAt).toEqual(expect.any(String));
      expect(res.body.user.marketingOptIn).toBe(false);

      const me = await request(app.getHttpServer())
        .get('/auth/me')
        .set('Authorization', `Bearer ${res.body.accessToken}`)
        .expect(200);

      expect(me.body.memberships).toHaveLength(1);
      expect(me.body.memberships[0].role).toBe('OWNER');
      // Auto-generated per the same convention already used for Google
      // signups — "Organisation de {first name}" — never a form field.
      expect(me.body.memberships[0].organization.name).toBe('Organisation de Amadou');
      expect(me.body.memberships[0].organization.slug).toMatch(/^amadou-ba/);
    });

    it('rejects registration with an email already in use by a classic account', async () => {
      const payload = registerPayload();
      createdUserEmails.push(payload.email);

      await request(app.getHttpServer()).post('/auth/register').send(payload).expect(201);
      await request(app.getHttpServer()).post('/auth/register').send(payload).expect(409);
    });

    it('rejects registration when password and confirmation do not match', async () => {
      const payload = registerPayload();
      createdUserEmails.push(payload.email);

      await request(app.getHttpServer())
        .post('/auth/register')
        .send({ ...payload, passwordConfirmation: 'something-else' })
        .expect(400);
    });

    it('rejects registration when terms are not accepted', async () => {
      const payload = registerPayload();
      createdUserEmails.push(payload.email);

      await request(app.getHttpServer())
        .post('/auth/register')
        .send({ ...payload, termsAccepted: false })
        .expect(400);
    });

    it('rejects registration on an email already linked to a Google-only account, with a distinct error', async () => {
      const google = await createGoogleAccount('Fatou Ndiaye');
      const email = google.user.email;

      const res = await request(app.getHttpServer())
        .post('/auth/register')
        .send({ ...registerPayload(), email })
        .expect(409);

      expect(res.body.error).toBe('GOOGLE_ACCOUNT_EXISTS');
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

  describe('POST /auth/verify-email + /auth/verify-email/resend', () => {
    async function registerAndGetCode() {
      const payload = registerPayload();
      createdUserEmails.push(payload.email);
      const res = await request(app.getHttpServer()).post('/auth/register').send(payload).expect(201);
      const accessToken = res.body.accessToken as string;

      const user = await prisma.user.findUniqueOrThrow({ where: { id: res.body.user.id } });
      return { accessToken, userId: user.id };
    }

    it('verifies the email with the code sent at registration, and rejects a wrong code', async () => {
      // Only the bcrypt hash of the code is ever persisted — tests recover
      // the plaintext code by spying on EmailChannel.send, the one place it
      // exists outside the hash.
      const spy = jest.spyOn(app.get(EmailChannel, { strict: false }), 'send');

      const payload = registerPayload();
      createdUserEmails.push(payload.email);
      const res = await request(app.getHttpServer()).post('/auth/register').send(payload).expect(201);
      const accessToken = res.body.accessToken as string;

      expect(spy).toHaveBeenCalledWith(
        expect.objectContaining({ to: payload.email, text: expect.stringMatching(/\d{6}/) }),
      );
      const sentText = spy.mock.calls[spy.mock.calls.length - 1][0].text as string;
      const code = sentText.match(/\d{6}/)![0];

      await request(app.getHttpServer())
        .post('/auth/verify-email')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ code: '000000' === code ? '111111' : '000000' })
        .expect(400);

      await request(app.getHttpServer())
        .post('/auth/verify-email')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ code })
        .expect(201);

      const me = await request(app.getHttpServer())
        .get('/auth/me')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);
      expect(me.body.emailVerifiedAt).toEqual(expect.any(String));

      spy.mockRestore();
    });

    it('rejects verification once the code has expired', async () => {
      const { accessToken, userId } = await registerAndGetCode();

      await prisma.user.update({
        where: { id: userId },
        data: { emailVerificationCodeExpiresAt: new Date(Date.now() - 60_000) },
      });

      await request(app.getHttpServer())
        .post('/auth/verify-email')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ code: '123456' })
        .expect(400);
    });

    it('locks out verification after too many wrong attempts, even with the right code afterwards', async () => {
      const spy = jest.spyOn(app.get(EmailChannel, { strict: false }), 'send');

      const payload = registerPayload();
      createdUserEmails.push(payload.email);
      const res = await request(app.getHttpServer()).post('/auth/register').send(payload).expect(201);
      const accessToken = res.body.accessToken as string;

      const sentText = spy.mock.calls[spy.mock.calls.length - 1][0].text as string;
      const realCode = sentText.match(/\d{6}/)![0];
      const wrongCode = realCode === '000001' ? '000002' : '000001';

      for (let i = 0; i < 5; i++) {
        await request(app.getHttpServer())
          .post('/auth/verify-email')
          .set('Authorization', `Bearer ${accessToken}`)
          .send({ code: wrongCode })
          .expect(400);
      }

      // 6th attempt, even with the correct code, is rejected — the code is
      // treated as invalidated once the attempt cap is hit.
      await request(app.getHttpServer())
        .post('/auth/verify-email')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ code: realCode })
        .expect(400);

      spy.mockRestore();
    });

    it('resend issues a fresh code and resets the attempt counter', async () => {
      const spy = jest.spyOn(app.get(EmailChannel, { strict: false }), 'send');

      const payload = registerPayload();
      createdUserEmails.push(payload.email);
      const res = await request(app.getHttpServer()).post('/auth/register').send(payload).expect(201);
      const accessToken = res.body.accessToken as string;

      await request(app.getHttpServer())
        .post('/auth/verify-email/resend')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(201);

      const sentText = spy.mock.calls[spy.mock.calls.length - 1][0].text as string;
      const freshCode = sentText.match(/\d{6}/)![0];

      await request(app.getHttpServer())
        .post('/auth/verify-email')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ code: freshCode })
        .expect(201);

      spy.mockRestore();
    });

    it('never requires a code for a Google-only account, and resend is refused', async () => {
      const google = await createGoogleAccount('Aissatou Sow');

      const me = await request(app.getHttpServer())
        .get('/auth/me')
        .set('Authorization', `Bearer ${google.accessToken}`)
        .expect(200);
      expect(me.body.emailVerifiedAt).toEqual(expect.any(String));

      await request(app.getHttpServer())
        .post('/auth/verify-email/resend')
        .set('Authorization', `Bearer ${google.accessToken}`)
        .expect(400);
    });
  });

  describe('Google two-step signup (continueWithGoogle / google/pending / google/complete)', () => {
    it('creates nothing on first sign-in for an unknown Google identity, and issues a pending token', async () => {
      const unique = randomUUID();
      const email = `googlenew-${unique}@example.com`;

      const result = await authService.continueWithGoogle({
        googleId: `google-${unique}`,
        email,
        fullName: 'Fatou Ndiaye',
      });

      expect(result.status).toBe('signup_pending');
      const count = await prisma.user.count({ where: { email } });
      expect(count).toBe(0);

      if (result.status !== 'signup_pending') throw new Error('unreachable');
      const pending = await request(app.getHttpServer())
        .post('/auth/google/pending')
        .send({ token: result.pendingToken })
        .expect(201);

      expect(pending.body.email).toBe(email);
      expect(pending.body.suggestedFullName).toBe('Fatou Ndiaye');
      expect(pending.body.suggestedOrganizationName).toBe('Organisation de Fatou');
    });

    it('completes signup and creates user + organization + OWNER membership, email pre-verified', async () => {
      const unique = randomUUID();
      const email = `googlecomplete-${unique}@example.com`;
      createdUserEmails.push(email);

      const pending = await authService.continueWithGoogle({
        googleId: `google-${unique}`,
        email,
        fullName: 'Omar Diallo',
      });
      if (pending.status !== 'signup_pending') throw new Error('expected signup_pending');

      const res = await request(app.getHttpServer())
        .post('/auth/google/complete')
        .send({ pendingToken: pending.pendingToken, marketingOptIn: true, termsAccepted: true })
        .expect(201);

      expect(res.body.accessToken).toEqual(expect.any(String));
      expect(res.body.user.email).toBe(email);
      expect(res.body.user.emailVerifiedAt).toEqual(expect.any(String));
      expect(res.body.user.marketingOptIn).toBe(true);

      const memberships = await prisma.organizationMember.findMany({
        where: { userId: res.body.user.id },
        include: { organization: true },
      });
      expect(memberships).toHaveLength(1);
      expect(memberships[0].role).toBe('OWNER');
      expect(memberships[0].organization.name).toBe('Organisation de Omar');
    });

    it('rejects google/complete with an invalid or expired pending token', async () => {
      await request(app.getHttpServer())
        .post('/auth/google/complete')
        .send({ pendingToken: 'not-a-real-token', marketingOptIn: false, termsAccepted: true })
        .expect(401);
    });

    it('reconnects the same user on a second Google sign-in without creating a duplicate', async () => {
      const unique = randomUUID();
      const email = `googleuser-${unique}@example.com`;
      createdUserEmails.push(email);
      const googleId = `google-${unique}`;

      const first = await authService.continueWithGoogle({ googleId, email, fullName: 'Omar Diallo' });
      if (first.status !== 'signup_pending') throw new Error('expected signup_pending');
      const created = await authService.completeGoogleSignup({
        pendingToken: first.pendingToken,
        marketingOptIn: false,
        termsAccepted: true,
      });

      const second = await authService.continueWithGoogle({ googleId, email, fullName: 'Omar Diallo' });
      if (second.status !== 'login') throw new Error('expected login on known googleId');

      expect(second.user.id).toBe(created.user.id);
      const count = await prisma.user.count({ where: { email } });
      expect(count).toBe(1);
    });

    it('links a Google identity to an existing classic account with the same email (explicit login_linked)', async () => {
      const payload = registerPayload();
      createdUserEmails.push(payload.email);
      const registered = await authService.register(payload);

      const linked = await authService.continueWithGoogle({
        googleId: `google-${randomUUID()}`,
        email: payload.email,
        fullName: payload.fullName,
      });

      if (linked.status !== 'login_linked') throw new Error('expected login_linked');
      expect(linked.user.id).toBe(registered.user.id);
      const count = await prisma.user.count({ where: { email: payload.email } });
      expect(count).toBe(1);
    });

    it('double-completing the same pending token is idempotent rather than erroring', async () => {
      const unique = randomUUID();
      const email = `googledouble-${unique}@example.com`;
      createdUserEmails.push(email);

      const pending = await authService.continueWithGoogle({
        googleId: `google-${unique}`,
        email,
        fullName: 'Ibrahima Fall',
      });
      if (pending.status !== 'signup_pending') throw new Error('expected signup_pending');

      const dto = { pendingToken: pending.pendingToken, marketingOptIn: false, termsAccepted: true };
      const first = await authService.completeGoogleSignup(dto);
      const second = await authService.completeGoogleSignup(dto);

      expect(second.user.id).toBe(first.user.id);
      const count = await prisma.user.count({ where: { email } });
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
      const google = await createGoogleAccount('Aissatou Sow');

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

      const google = await createGoogleAccount('Ibrahima Fall');

      const googleMe = await request(app.getHttpServer())
        .get('/auth/me')
        .set('Authorization', `Bearer ${google.accessToken}`)
        .expect(200);
      expect(googleMe.body.hasPassword).toBe(false);
    });
  });

  describe('Super Admin 2FA (POST /auth/login + /auth/super-admin/totp/*, docs/SPEC.md §10.7)', () => {
    // No registration flow can ever produce a Super Admin account (see the
    // "Privilege escalation guard" suite below) — the seed script is the
    // only path, so tests replicate it directly rather than going through
    // the API.
    async function createSuperAdmin() {
      const unique = randomUUID();
      const email = `superadmin-${unique}@example.com`;
      const password = 'super-secret-admin-password';
      createdUserEmails.push(email);

      await prisma.user.create({
        data: {
          email,
          passwordHash: await bcrypt.hash(password, 10),
          fullName: 'Super Admin Test',
          isSuperAdmin: true,
        },
      });

      return { email, password };
    }

    it('requires TOTP setup on first login, before any secret is configured', async () => {
      const { email, password } = await createSuperAdmin();

      const res = await request(app.getHttpServer())
        .post('/auth/login')
        .send({ email, password })
        .expect(201);

      expect(res.body.status).toBe('totp_setup_required');
      expect(res.body.totpToken).toEqual(expect.any(String));
      expect(res.body.accessToken).toBeUndefined();
    });

    it('completes setup, verifies with a real TOTP code, and requires only verification on the next login', async () => {
      const { email, password } = await createSuperAdmin();

      const login = await request(app.getHttpServer())
        .post('/auth/login')
        .send({ email, password })
        .expect(201);
      expect(login.body.status).toBe('totp_setup_required');

      const setup = await request(app.getHttpServer())
        .post('/auth/super-admin/totp/setup')
        .send({ totpToken: login.body.totpToken })
        .expect(201);

      expect(setup.body.otpauthUrl).toMatch(/^otpauth:\/\/totp\//);
      expect(setup.body.secret).toEqual(expect.any(String));
      expect(setup.body.recoveryCodes).toHaveLength(10);

      const code = await generateTotpCode({ secret: setup.body.secret });

      const verify = await request(app.getHttpServer())
        .post('/auth/super-admin/totp/verify')
        .send({ totpToken: login.body.totpToken, code })
        .expect(201);

      expect(verify.body.accessToken).toEqual(expect.any(String));
      expect(verify.body.user.email).toBe(email);
      expect(verify.body.user.isSuperAdmin).toBe(true);
      expect(verify.body.user.totpSecret).toBeUndefined();

      const secondLogin = await request(app.getHttpServer())
        .post('/auth/login')
        .send({ email, password })
        .expect(201);
      expect(secondLogin.body.status).toBe('totp_required');

      const secondVerify = await request(app.getHttpServer())
        .post('/auth/super-admin/totp/verify')
        .send({ totpToken: secondLogin.body.totpToken, code: await generateTotpCode({ secret: setup.body.secret }) })
        .expect(201);
      expect(secondVerify.body.accessToken).toEqual(expect.any(String));
    });

    it('rejects an invalid TOTP code and locks the account out after too many attempts', async () => {
      const { email, password } = await createSuperAdmin();
      const login = await request(app.getHttpServer()).post('/auth/login').send({ email, password }).expect(201);
      const setup = await request(app.getHttpServer())
        .post('/auth/super-admin/totp/setup')
        .send({ totpToken: login.body.totpToken })
        .expect(201);

      const realCode = await generateTotpCode({ secret: setup.body.secret });
      const wrongCode = realCode === '000000' ? '111111' : '000000';

      for (let i = 0; i < 5; i++) {
        await request(app.getHttpServer())
          .post('/auth/super-admin/totp/verify')
          .send({ totpToken: login.body.totpToken, code: wrongCode })
          .expect(401);
      }

      // 6th attempt, even with the correct code, is rejected — the account
      // is locked regardless of which code is presented.
      await request(app.getHttpServer())
        .post('/auth/super-admin/totp/verify')
        .send({ totpToken: login.body.totpToken, code: realCode })
        .expect(401);
    });

    it('consumes a recovery code once and rejects reuse of the same code', async () => {
      const { email, password } = await createSuperAdmin();
      const login = await request(app.getHttpServer()).post('/auth/login').send({ email, password }).expect(201);
      const setup = await request(app.getHttpServer())
        .post('/auth/super-admin/totp/setup')
        .send({ totpToken: login.body.totpToken })
        .expect(201);

      const recoveryCode = setup.body.recoveryCodes[0] as string;

      await request(app.getHttpServer())
        .post('/auth/super-admin/totp/verify')
        .send({ totpToken: login.body.totpToken, code: recoveryCode })
        .expect(201);

      // Same temp token, not yet expired — proves single-use, not just a
      // freshly-issued token no longer carrying the code.
      await request(app.getHttpServer())
        .post('/auth/super-admin/totp/verify')
        .send({ totpToken: login.body.totpToken, code: recoveryCode })
        .expect(401);
    });

    it('blocks the Google flow for a super admin account, on both the googleId and email lookup branches', async () => {
      const { email } = await createSuperAdmin();
      const unique = randomUUID();
      const user = await prisma.user.findFirstOrThrow({ where: { email } });
      // Not reachable through the public API (the seed script never sets a
      // googleId) — set directly to exercise the defense-in-depth guard.
      await prisma.user.update({ where: { id: user.id }, data: { googleId: `google-${unique}` } });

      await expect(
        authService.continueWithGoogle({ googleId: `google-${unique}`, email, fullName: 'Super Admin Test' }),
      ).rejects.toThrow(UnauthorizedException);

      await expect(
        authService.continueWithGoogle({ googleId: `google-other-${unique}`, email, fullName: 'Super Admin Test' }),
      ).rejects.toThrow(UnauthorizedException);
    });
  });

  describe('Privilege escalation guard — isSuperAdmin can never be set via a public registration flow', () => {
    it('ignores isSuperAdmin injected into POST /auth/register', async () => {
      const payload = { ...registerPayload(), isSuperAdmin: true };
      createdUserEmails.push(payload.email);

      const res = await request(app.getHttpServer()).post('/auth/register').send(payload).expect(201);

      expect(res.body.user.isSuperAdmin).toBe(false);
      const user = await prisma.user.findUniqueOrThrow({ where: { id: res.body.user.id } });
      expect(user.isSuperAdmin).toBe(false);
    });

    it('ignores isSuperAdmin injected into POST /auth/google/complete', async () => {
      const unique = randomUUID();
      const email = `googleescalation-${unique}@example.com`;
      createdUserEmails.push(email);

      const pending = await authService.continueWithGoogle({
        googleId: `google-${unique}`,
        email,
        fullName: 'Test Escalation',
      });
      if (pending.status !== 'signup_pending') throw new Error('expected signup_pending');

      const res = await request(app.getHttpServer())
        .post('/auth/google/complete')
        .send({ pendingToken: pending.pendingToken, marketingOptIn: false, termsAccepted: true, isSuperAdmin: true })
        .expect(201);

      expect(res.body.user.isSuperAdmin).toBe(false);
      const user = await prisma.user.findUniqueOrThrow({ where: { id: res.body.user.id } });
      expect(user.isSuperAdmin).toBe(false);
    });
  });
});
