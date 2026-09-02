import { randomUUID } from 'crypto';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { AuthService } from '../src/auth/auth.service';
import { EmailChannel } from '../src/notifications/channels/email.channel';
import { SmsChannel } from '../src/notifications/channels/sms.channel';
import { normalizeSenegalPhone } from '../src/organizations/dto/phone.validator';
import { PrismaService } from '../src/prisma/prisma.service';

// Phone-auth step 2/5 (team invitation + account activation, PROGRESS.md).
describe('Team invitation activation (e2e) — step 2/5', () => {
  let app: INestApplication;
  let authService: AuthService;
  let prisma: PrismaService;
  const createdUserIds: string[] = [];

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
    // Same FK-cascade caution as other e2e suites — dependents (owned
    // organizations, notifications with no cascade) before the parent (user).
    for (const userId of createdUserIds) {
      await prisma.notification.deleteMany({ where: { userId } });
      await prisma.organization.deleteMany({ where: { ownerUserId: userId } });
      await prisma.organizationMember.deleteMany({ where: { userId } });
      await prisma.user.deleteMany({ where: { id: userId } });
    }
    await app.close();
  });

  function uniquePhone(): string {
    const digits = randomUUID().replace(/\D/g, '').slice(0, 8).padEnd(8, '0');
    return `7${digits}`;
  }

  async function registerOrganizer() {
    const unique = randomUUID();
    const email = `organizer-${unique}@example.com`;

    const { accessToken, user } = await authService.register({
      email,
      password: 'super-secret-password',
      fullName: 'Amadou Ba',
      passwordConfirmation: 'super-secret-password',
      marketingOptIn: false,
      termsAccepted: true,
    });
    createdUserIds.push(user.id);

    const organization = await prisma.organization.findFirstOrThrow({
      where: { ownerUserId: user.id },
    });

    return { accessToken, organizationId: organization.id, userId: user.id };
  }

  // authService.register() is called directly here (not through HTTP), which
  // bypasses RegisterDto's @Transform — normalization to E.164 only happens
  // inside Nest's ValidationPipe, never merely by constructing a plain
  // object. Normalize up front so the stored phoneNumber matches what a real
  // HTTP registration would have produced.
  async function registerPhoneAccount() {
    const phone = normalizeSenegalPhone(uniquePhone());
    const { accessToken, user } = await authService.register({
      phone,
      password: 'super-secret-password',
      passwordConfirmation: 'super-secret-password',
      fullName: 'Fatou Ndiaye',
      marketingOptIn: false,
      termsAccepted: true,
    });
    createdUserIds.push(user.id);

    return { accessToken, userId: user.id, phone: user.phoneNumber as string };
  }

  function extractCode(text: string): string {
    return text.match(/\d{6}/)![0];
  }

  describe('POST /organizations/:id/members — invite by phone or email', () => {
    it('rejects a payload with both email and phone', async () => {
      const owner = await registerOrganizer();
      await request(app.getHttpServer())
        .post(`/organizations/${owner.organizationId}/members`)
        .set('Authorization', `Bearer ${owner.accessToken}`)
        .send({ email: 'a@example.com', phone: '771234567', role: 'SELLER', fullName: 'X' })
        .expect(400);
    });

    it('creates a placeholder user by phone and sends an SMS activation code', async () => {
      const owner = await registerOrganizer();
      const spy = jest.spyOn(app.get(SmsChannel, { strict: false }), 'send');
      const phone = uniquePhone();

      const res = await request(app.getHttpServer())
        .post(`/organizations/${owner.organizationId}/members`)
        .set('Authorization', `Bearer ${owner.accessToken}`)
        .send({ phone, role: 'CONTROLLER', fullName: 'Vigile Test' })
        .expect(201);

      expect(res.body.status).toBe('PENDING');
      const created = await prisma.user.findFirstOrThrow({ where: { phoneNumber: `+221${phone}` } });
      createdUserIds.push(created.id);
      expect(created.fullName).toBe('Vigile Test');
      expect(created.passwordSet).toBe(false);

      expect(spy).toHaveBeenCalledWith(
        expect.objectContaining({ to: `+221${phone}`, text: expect.stringMatching(/\d{6}/) }),
      );
      spy.mockRestore();
    });

    it('creates a placeholder user by email and sends an email activation code — non-regression', async () => {
      const owner = await registerOrganizer();
      const spy = jest.spyOn(app.get(EmailChannel, { strict: false }), 'send');
      const email = `invitee-${randomUUID()}@example.com`;

      const res = await request(app.getHttpServer())
        .post(`/organizations/${owner.organizationId}/members`)
        .set('Authorization', `Bearer ${owner.accessToken}`)
        .send({ email, role: 'SELLER', fullName: 'Vendeur Test' })
        .expect(201);

      expect(res.body.status).toBe('PENDING');
      const created = await prisma.user.findFirstOrThrow({ where: { email } });
      createdUserIds.push(created.id);
      expect(created.passwordSet).toBe(false);

      expect(spy).toHaveBeenCalledWith(
        expect.objectContaining({ to: email, text: expect.stringMatching(/\d{6}/) }),
      );
      spy.mockRestore();
    });

    it('invites an existing active account by phone without sending any activation code', async () => {
      const owner = await registerOrganizer();
      const invitee = await registerPhoneAccount();
      const smsSpy = jest.spyOn(app.get(SmsChannel, { strict: false }), 'send');

      const res = await request(app.getHttpServer())
        .post(`/organizations/${owner.organizationId}/members`)
        .set('Authorization', `Bearer ${owner.accessToken}`)
        .send({ phone: invitee.phone.replace('+221', ''), role: 'CONTROLLER' })
        .expect(201);

      expect(res.body.status).toBe('PENDING');
      const inviteeUser = await prisma.user.findUniqueOrThrow({ where: { id: invitee.userId } });
      expect(inviteeUser.passwordSet).toBe(true);
      expect(smsSpy).not.toHaveBeenCalled();

      const listRes = await request(app.getHttpServer())
        .get('/users/me/invitations')
        .set('Authorization', `Bearer ${invitee.accessToken}`)
        .expect(200);
      expect(listRes.body).toHaveLength(1);

      smsSpy.mockRestore();
    });

    it('re-invites an un-activated placeholder without a 409, sending a fresh code', async () => {
      const owner = await registerOrganizer();
      const email = `reinvite-${randomUUID()}@example.com`;
      const emailSpy = jest.spyOn(app.get(EmailChannel, { strict: false }), 'send');

      await request(app.getHttpServer())
        .post(`/organizations/${owner.organizationId}/members`)
        .set('Authorization', `Bearer ${owner.accessToken}`)
        .send({ email, role: 'SELLER', fullName: 'Retard Activation' })
        .expect(201);
      const created = await prisma.user.findFirstOrThrow({ where: { email } });
      createdUserIds.push(created.id);

      const firstCode = extractCode(emailSpy.mock.calls[emailSpy.mock.calls.length - 1][0].text as string);

      await request(app.getHttpServer())
        .post(`/organizations/${owner.organizationId}/members`)
        .set('Authorization', `Bearer ${owner.accessToken}`)
        .send({ email, role: 'SELLER' })
        .expect(201);

      const secondCode = extractCode(emailSpy.mock.calls[emailSpy.mock.calls.length - 1][0].text as string);
      expect(secondCode).not.toBe(firstCode);

      emailSpy.mockRestore();
    });
  });

  describe('POST /auth/activate-invitation', () => {
    it('activates a phone-invited placeholder and returns a usable session', async () => {
      const owner = await registerOrganizer();
      const smsSpy = jest.spyOn(app.get(SmsChannel, { strict: false }), 'send');
      const phone = uniquePhone();

      await request(app.getHttpServer())
        .post(`/organizations/${owner.organizationId}/members`)
        .set('Authorization', `Bearer ${owner.accessToken}`)
        .send({ phone, role: 'CONTROLLER', fullName: 'Vigile Activation' })
        .expect(201);
      const created = await prisma.user.findFirstOrThrow({ where: { phoneNumber: `+221${phone}` } });
      createdUserIds.push(created.id);
      const code = extractCode(smsSpy.mock.calls[smsSpy.mock.calls.length - 1][0].text as string);
      smsSpy.mockRestore();

      const activateRes = await request(app.getHttpServer())
        .post('/auth/activate-invitation')
        .send({ phone, code, password: 'brand-new-password', passwordConfirmation: 'brand-new-password' })
        .expect(201);
      expect(activateRes.body.accessToken).toEqual(expect.any(String));

      const activated = await prisma.user.findUniqueOrThrow({ where: { id: created.id } });
      expect(activated.passwordSet).toBe(true);
      expect(activated.phoneVerifiedAt).toEqual(expect.any(Date));

      await request(app.getHttpServer())
        .post('/auth/login')
        .send({ phone, password: 'brand-new-password' })
        .expect(201);
    });

    it('activates an email-invited placeholder and lets it then accept the invitation', async () => {
      const owner = await registerOrganizer();
      const emailSpy = jest.spyOn(app.get(EmailChannel, { strict: false }), 'send');
      const email = `activate-${randomUUID()}@example.com`;

      const invite = await request(app.getHttpServer())
        .post(`/organizations/${owner.organizationId}/members`)
        .set('Authorization', `Bearer ${owner.accessToken}`)
        .send({ email, role: 'CO_ORGANIZER', fullName: 'Coorganisateur Activation' })
        .expect(201);
      const created = await prisma.user.findFirstOrThrow({ where: { email } });
      createdUserIds.push(created.id);
      const code = extractCode(emailSpy.mock.calls[emailSpy.mock.calls.length - 1][0].text as string);
      emailSpy.mockRestore();

      const activateRes = await request(app.getHttpServer())
        .post('/auth/activate-invitation')
        .send({ email, code, password: 'brand-new-password', passwordConfirmation: 'brand-new-password' })
        .expect(201);
      const accessToken = activateRes.body.accessToken as string;

      const acceptRes = await request(app.getHttpServer())
        .post(`/users/me/invitations/${invite.body.id}/accept`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(201);
      expect(acceptRes.body.status).toBe('ACTIVE');
    });

    it('rejects mismatched password confirmation', async () => {
      const owner = await registerOrganizer();
      const emailSpy = jest.spyOn(app.get(EmailChannel, { strict: false }), 'send');
      const email = `mismatch-${randomUUID()}@example.com`;

      await request(app.getHttpServer())
        .post(`/organizations/${owner.organizationId}/members`)
        .set('Authorization', `Bearer ${owner.accessToken}`)
        .send({ email, role: 'SELLER', fullName: 'Mismatch Test' })
        .expect(201);
      const created = await prisma.user.findFirstOrThrow({ where: { email } });
      createdUserIds.push(created.id);
      const code = extractCode(emailSpy.mock.calls[emailSpy.mock.calls.length - 1][0].text as string);
      emailSpy.mockRestore();

      await request(app.getHttpServer())
        .post('/auth/activate-invitation')
        .send({ email, code, password: 'password-one', passwordConfirmation: 'password-two' })
        .expect(400);
    });

    it('rejects an expired activation code', async () => {
      const owner = await registerOrganizer();
      const emailSpy = jest.spyOn(app.get(EmailChannel, { strict: false }), 'send');
      const email = `expired-${randomUUID()}@example.com`;

      await request(app.getHttpServer())
        .post(`/organizations/${owner.organizationId}/members`)
        .set('Authorization', `Bearer ${owner.accessToken}`)
        .send({ email, role: 'SELLER', fullName: 'Expired Test' })
        .expect(201);
      const created = await prisma.user.findFirstOrThrow({ where: { email } });
      createdUserIds.push(created.id);
      const code = extractCode(emailSpy.mock.calls[emailSpy.mock.calls.length - 1][0].text as string);
      emailSpy.mockRestore();

      await prisma.user.update({
        where: { id: created.id },
        data: { emailVerificationCodeExpiresAt: new Date(Date.now() - 60_000) },
      });

      await request(app.getHttpServer())
        .post('/auth/activate-invitation')
        .send({ email, code, password: 'brand-new-password', passwordConfirmation: 'brand-new-password' })
        .expect(400);
    });

    it('locks out after too many wrong attempts, even with the right code afterwards', async () => {
      const owner = await registerOrganizer();
      const emailSpy = jest.spyOn(app.get(EmailChannel, { strict: false }), 'send');
      const email = `lockout-${randomUUID()}@example.com`;

      await request(app.getHttpServer())
        .post(`/organizations/${owner.organizationId}/members`)
        .set('Authorization', `Bearer ${owner.accessToken}`)
        .send({ email, role: 'SELLER', fullName: 'Lockout Test' })
        .expect(201);
      const created = await prisma.user.findFirstOrThrow({ where: { email } });
      createdUserIds.push(created.id);
      const realCode = extractCode(emailSpy.mock.calls[emailSpy.mock.calls.length - 1][0].text as string);
      emailSpy.mockRestore();
      const wrongCode = realCode === '000001' ? '000002' : '000001';

      for (let i = 0; i < 5; i++) {
        await request(app.getHttpServer())
          .post('/auth/activate-invitation')
          .send({ email, code: wrongCode, password: 'brand-new-password', passwordConfirmation: 'brand-new-password' })
          .expect(400);
      }

      await request(app.getHttpServer())
        .post('/auth/activate-invitation')
        .send({ email, code: realCode, password: 'brand-new-password', passwordConfirmation: 'brand-new-password' })
        .expect(400);
    });

    it('rejects re-using activate-invitation on an already-activated (or real) account — no account takeover', async () => {
      const realAccount = await registerOrganizer();
      const realUser = await prisma.user.findUniqueOrThrow({ where: { id: realAccount.userId } });

      await request(app.getHttpServer())
        .post('/auth/activate-invitation')
        .send({ email: realUser.email, code: '123456', password: 'stolen-password', passwordConfirmation: 'stolen-password' })
        .expect(400);

      const unchanged = await prisma.user.findUniqueOrThrow({ where: { id: realAccount.userId } });
      expect(unchanged.passwordSet).toBe(true);
    });
  });

  describe('POST /auth/activate-invitation/resend', () => {
    it('issues a fresh code without revealing whether the account exists', async () => {
      const owner = await registerOrganizer();
      const emailSpy = jest.spyOn(app.get(EmailChannel, { strict: false }), 'send');
      const email = `resend-${randomUUID()}@example.com`;

      await request(app.getHttpServer())
        .post(`/organizations/${owner.organizationId}/members`)
        .set('Authorization', `Bearer ${owner.accessToken}`)
        .send({ email, role: 'SELLER', fullName: 'Resend Test' })
        .expect(201);
      const created = await prisma.user.findFirstOrThrow({ where: { email } });
      createdUserIds.push(created.id);
      const firstCode = extractCode(emailSpy.mock.calls[emailSpy.mock.calls.length - 1][0].text as string);

      await request(app.getHttpServer()).post('/auth/activate-invitation/resend').send({ email }).expect(201);
      const secondCode = extractCode(emailSpy.mock.calls[emailSpy.mock.calls.length - 1][0].text as string);
      expect(secondCode).not.toBe(firstCode);

      const unknownRes = await request(app.getHttpServer())
        .post('/auth/activate-invitation/resend')
        .send({ email: `unknown-${randomUUID()}@example.com` })
        .expect(201);
      expect(unknownRes.body).toEqual({ success: true });

      emailSpy.mockRestore();
    });
  });

  describe('POST /organizations — point C, additional organization for an existing account', () => {
    it('lets an account that is only a CONTROLLER elsewhere create and own a brand new organization', async () => {
      const owner = await registerOrganizer();
      const staff = await registerOrganizer();

      await prisma.organizationMember.create({
        data: { organizationId: owner.organizationId, userId: staff.userId, role: 'CONTROLLER', status: 'ACTIVE' },
      });

      const res = await request(app.getHttpServer())
        .post('/organizations')
        .set('Authorization', `Bearer ${staff.accessToken}`)
        .send({})
        .expect(201);

      expect(res.body.id).not.toBe(owner.organizationId);

      // staff already owns its own organization from registerOrganizer()
      // (every registration auto-creates one) — this endpoint adds a THIRD
      // membership row (OWNER on the brand new org) alongside that one and
      // the CONTROLLER row on owner's org, none of them replacing another.
      const memberships = await prisma.organizationMember.findMany({ where: { userId: staff.userId } });
      expect(memberships).toHaveLength(3);
      const ownRoles = memberships.map((m) => ({ organizationId: m.organizationId, role: m.role }));
      expect(ownRoles).toEqual(
        expect.arrayContaining([
          { organizationId: staff.organizationId, role: 'OWNER' },
          { organizationId: owner.organizationId, role: 'CONTROLLER' },
          { organizationId: res.body.id, role: 'OWNER' },
        ]),
      );

      const newOrg = await prisma.organization.findUniqueOrThrow({ where: { id: res.body.id } });
      expect(newOrg.ownerUserId).toBe(staff.userId);
    });

    it('lets an account already OWNER of one organization own a second one', async () => {
      const owner = await registerOrganizer();

      const res = await request(app.getHttpServer())
        .post('/organizations')
        .set('Authorization', `Bearer ${owner.accessToken}`)
        .send({})
        .expect(201);

      const ownedOrganizations = await prisma.organization.findMany({ where: { ownerUserId: owner.userId } });
      expect(ownedOrganizations).toHaveLength(2);
      expect(ownedOrganizations.map((o) => o.id)).toEqual(expect.arrayContaining([owner.organizationId, res.body.id]));
    });
  });
});
