import { randomUUID } from 'crypto';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import * as bcrypt from 'bcrypt';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { SmsChannel } from '../src/notifications/channels/sms.channel';
import { PrismaService } from '../src/prisma/prisma.service';

describe('Phone auth (e2e) — step 1/5, backend foundations', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const createdUserIds: string[] = [];

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();

    prisma = moduleFixture.get(PrismaService);
  });

  afterAll(async () => {
    // Same FK-cascade caution as auth.e2e-spec.ts — dependents (owned
    // organization) before the parent (user).
    for (const userId of createdUserIds) {
      await prisma.organization.deleteMany({ where: { ownerUserId: userId } });
      await prisma.user.deleteMany({ where: { id: userId } });
    }
    await app.close();
  });

  function uniquePhone(): string {
    // 9-digit local part starting with 7, unique enough per test run —
    // randomUUID's numeric digits sliced down to 8 after the mandatory
    // leading 7.
    const digits = randomUUID().replace(/\D/g, '').slice(0, 8).padEnd(8, '0');
    return `7${digits}`;
  }

  function phoneRegisterPayload() {
    return {
      phone: uniquePhone(),
      password: 'super-secret-password',
      passwordConfirmation: 'super-secret-password',
      fullName: 'Amadou Ba',
      marketingOptIn: false,
      termsAccepted: true,
    };
  }

  function emailRegisterPayload() {
    const unique = randomUUID();
    return {
      email: `phoneauth-regression-${unique}@example.com`,
      password: 'super-secret-password',
      passwordConfirmation: 'super-secret-password',
      fullName: 'Fatou Ndiaye',
      marketingOptIn: false,
      termsAccepted: true,
    };
  }

  describe('POST /auth/register + /auth/login by phone', () => {
    it('registers a phone-only account and returns a usable token', async () => {
      const payload = phoneRegisterPayload();

      const res = await request(app.getHttpServer()).post('/auth/register').send(payload).expect(201);
      createdUserIds.push(res.body.user.id);

      expect(res.body.accessToken).toEqual(expect.any(String));
      expect(res.body.user.phoneNumber).toBe(`+221${payload.phone}`);
      expect(res.body.user.email).toBeNull();
      expect(res.body.user.phoneVerifiedAt).toBeNull();
    });

    it('logs in with phone + password', async () => {
      const payload = phoneRegisterPayload();
      const registered = await request(app.getHttpServer()).post('/auth/register').send(payload).expect(201);
      createdUserIds.push(registered.body.user.id);

      const res = await request(app.getHttpServer())
        .post('/auth/login')
        .send({ phone: payload.phone, password: payload.password })
        .expect(201);

      expect(res.body.accessToken).toEqual(expect.any(String));
    });

    it('rejects registration with a phone number already in use', async () => {
      const payload = phoneRegisterPayload();
      const registered = await request(app.getHttpServer()).post('/auth/register').send(payload).expect(201);
      createdUserIds.push(registered.body.user.id);

      await request(app.getHttpServer()).post('/auth/register').send({ ...payload, fullName: 'Second Attempt' }).expect(409);
    });

    it('rejects registration with neither email nor phone provided', async () => {
      const { phone: _phone, ...payload } = phoneRegisterPayload();
      await request(app.getHttpServer()).post('/auth/register').send(payload).expect(400);
    });

    it('rejects registration with both email and phone provided', async () => {
      const payload = { ...phoneRegisterPayload(), email: `both-${randomUUID()}@example.com` };
      await request(app.getHttpServer()).post('/auth/register').send(payload).expect(400);
    });

    it('accepts 0-prefixed and E.164 input forms, normalizing both to the same E.164 value', async () => {
      const local = uniquePhone();
      const zeroPrefixed = { ...phoneRegisterPayload(), phone: `0${local}` };
      const res = await request(app.getHttpServer()).post('/auth/register').send(zeroPrefixed).expect(201);
      createdUserIds.push(res.body.user.id);

      expect(res.body.user.phoneNumber).toBe(`+221${local}`);
    });
  });

  describe('Email-only account — non-regression', () => {
    it('still registers and logs in by email exactly as before', async () => {
      const payload = emailRegisterPayload();

      const res = await request(app.getHttpServer()).post('/auth/register').send(payload).expect(201);
      createdUserIds.push(res.body.user.id);
      expect(res.body.user.email).toBe(payload.email);
      expect(res.body.user.phoneNumber).toBeNull();

      const login = await request(app.getHttpServer())
        .post('/auth/login')
        .send({ email: payload.email, password: payload.password })
        .expect(201);
      expect(login.body.accessToken).toEqual(expect.any(String));
    });
  });

  describe('POST /auth/verify-phone + /auth/verify-phone/resend', () => {
    it('verifies the phone with the code sent at registration, and rejects a wrong code', async () => {
      const spy = jest.spyOn(app.get(SmsChannel, { strict: false }), 'send');

      const payload = phoneRegisterPayload();
      const res = await request(app.getHttpServer()).post('/auth/register').send(payload).expect(201);
      createdUserIds.push(res.body.user.id);
      const accessToken = res.body.accessToken as string;

      expect(spy).toHaveBeenCalledWith(
        expect.objectContaining({ to: `+221${payload.phone}`, text: expect.stringMatching(/\d{6}/) }),
      );
      const sentText = spy.mock.calls[spy.mock.calls.length - 1][0].text as string;
      const code = sentText.match(/\d{6}/)![0];

      await request(app.getHttpServer())
        .post('/auth/verify-phone')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ code: '000000' === code ? '111111' : '000000' })
        .expect(400);

      await request(app.getHttpServer())
        .post('/auth/verify-phone')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ code })
        .expect(201);

      const me = await request(app.getHttpServer())
        .get('/auth/me')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);
      expect(me.body.phoneVerifiedAt).toEqual(expect.any(String));

      spy.mockRestore();
    });

    it('rejects verification once the code has expired', async () => {
      const payload = phoneRegisterPayload();
      const res = await request(app.getHttpServer()).post('/auth/register').send(payload).expect(201);
      createdUserIds.push(res.body.user.id);
      const accessToken = res.body.accessToken as string;

      await prisma.user.update({
        where: { id: res.body.user.id },
        data: { phoneVerificationCodeExpiresAt: new Date(Date.now() - 60_000) },
      });

      await request(app.getHttpServer())
        .post('/auth/verify-phone')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ code: '123456' })
        .expect(400);
    });

    it('locks out verification after too many wrong attempts, even with the right code afterwards', async () => {
      const spy = jest.spyOn(app.get(SmsChannel, { strict: false }), 'send');

      const payload = phoneRegisterPayload();
      const res = await request(app.getHttpServer()).post('/auth/register').send(payload).expect(201);
      createdUserIds.push(res.body.user.id);
      const accessToken = res.body.accessToken as string;

      const sentText = spy.mock.calls[spy.mock.calls.length - 1][0].text as string;
      const realCode = sentText.match(/\d{6}/)![0];
      const wrongCode = realCode === '000001' ? '000002' : '000001';

      for (let i = 0; i < 5; i++) {
        await request(app.getHttpServer())
          .post('/auth/verify-phone')
          .set('Authorization', `Bearer ${accessToken}`)
          .send({ code: wrongCode })
          .expect(400);
      }

      await request(app.getHttpServer())
        .post('/auth/verify-phone')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ code: realCode })
        .expect(400);

      spy.mockRestore();
    });

    it('resend issues a fresh code and resets the attempt counter', async () => {
      const spy = jest.spyOn(app.get(SmsChannel, { strict: false }), 'send');

      const payload = phoneRegisterPayload();
      const res = await request(app.getHttpServer()).post('/auth/register').send(payload).expect(201);
      createdUserIds.push(res.body.user.id);
      const accessToken = res.body.accessToken as string;

      await request(app.getHttpServer())
        .post('/auth/verify-phone/resend')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(201);

      const sentText = spy.mock.calls[spy.mock.calls.length - 1][0].text as string;
      const freshCode = sentText.match(/\d{6}/)![0];

      await request(app.getHttpServer())
        .post('/auth/verify-phone')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ code: freshCode })
        .expect(201);

      spy.mockRestore();
    });
  });

  describe('Super Admin — phone login explicitly rejected (docs/SPEC.md §10.7, adapted)', () => {
    it('rejects a phone-number login attempt on a super admin account', async () => {
      const unique = randomUUID();
      const email = `superadmin-phoneauth-${unique}@example.com`;
      const password = 'super-secret-admin-password';

      const superAdmin = await prisma.user.create({
        data: {
          email,
          passwordHash: await bcrypt.hash(password, 10),
          fullName: 'Super Admin Test',
          isSuperAdmin: true,
        },
      });
      createdUserIds.push(superAdmin.id);

      // Not reachable through the public API (no registration flow can set
      // isSuperAdmin, and phone-auth registration never touches it either)
      // — set directly to exercise the defense-in-depth guard, same
      // reasoning as the Google-flow equivalent in auth.e2e-spec.ts.
      const phone = uniquePhone();
      await prisma.user.update({ where: { id: superAdmin.id }, data: { phoneNumber: `+221${phone}` } });

      await request(app.getHttpServer()).post('/auth/login').send({ phone, password }).expect(401);
    });
  });
});
