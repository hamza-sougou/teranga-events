import { randomUUID } from 'crypto';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { AuthService } from '../src/auth/auth.service';
import { PrismaService } from '../src/prisma/prisma.service';

describe('Organizations (e2e)', () => {
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
    for (const email of createdUserEmails) {
      const user = await prisma.user.findFirst({ where: { email } });
      if (!user) continue;
      await prisma.notification.deleteMany({ where: { userId: user.id } });
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

    const organization = await prisma.organization.findFirstOrThrow({
      where: { ownerUserId: user.id },
    });

    return { accessToken, organizationId: organization.id, userId: user.id };
  }

  describe('GET /organizations/:id', () => {
    it('returns the organization profile for an active member', async () => {
      const owner = await registerOrganizer();

      const res = await request(app.getHttpServer())
        .get(`/organizations/${owner.organizationId}`)
        .set('Authorization', `Bearer ${owner.accessToken}`)
        .expect(200);

      expect(res.body.name).toBe('Organisation de Amadou');
      expect(res.body.payoutPhoneNumber).toBeNull();
    });
  });

  describe('PATCH /organizations/:id', () => {
    it('lets OWNER update the profile', async () => {
      const owner = await registerOrganizer();

      const res = await request(app.getHttpServer())
        .patch(`/organizations/${owner.organizationId}`)
        .set('Authorization', `Bearer ${owner.accessToken}`)
        .send({ name: 'Amadou Events Renamed', contactEmail: 'contact@amadou.events', contactPhone: '771234567' })
        .expect(200);

      expect(res.body.name).toBe('Amadou Events Renamed');
      expect(res.body.contactEmail).toBe('contact@amadou.events');
      expect(res.body.contactPhone).toBe('771234567');
    });

    it('lets CO_ORGANIZER update the profile', async () => {
      const owner = await registerOrganizer();
      const coOrganizer = await registerOrganizer();
      await prisma.organizationMember.create({
        data: {
          organizationId: owner.organizationId,
          userId: coOrganizer.userId,
          role: 'CO_ORGANIZER',
          status: 'ACTIVE',
        },
      });

      await request(app.getHttpServer())
        .patch(`/organizations/${owner.organizationId}`)
        .set('Authorization', `Bearer ${coOrganizer.accessToken}`)
        .send({ name: 'Renamed by co-organizer' })
        .expect(200);
    });

    it('rejects an update from an unauthorized role (SELLER)', async () => {
      const owner = await registerOrganizer();
      const seller = await registerOrganizer();
      await prisma.organizationMember.create({
        data: { organizationId: owner.organizationId, userId: seller.userId, role: 'SELLER', status: 'ACTIVE' },
      });

      await request(app.getHttpServer())
        .patch(`/organizations/${owner.organizationId}`)
        .set('Authorization', `Bearer ${seller.accessToken}`)
        .send({ name: 'Should not be allowed' })
        .expect(403);
    });

    it('rejects a malformed contactPhone', async () => {
      const owner = await registerOrganizer();

      await request(app.getHttpServer())
        .patch(`/organizations/${owner.organizationId}`)
        .set('Authorization', `Bearer ${owner.accessToken}`)
        .send({ contactPhone: 'not-a-phone-number' })
        .expect(400);
    });

    it('lets OWNER set a bio within the length limit', async () => {
      const owner = await registerOrganizer();

      const res = await request(app.getHttpServer())
        .patch(`/organizations/${owner.organizationId}`)
        .set('Authorization', `Bearer ${owner.accessToken}`)
        .send({ bio: 'Nous organisons des festivals de musique traditionnelle depuis 2015.' })
        .expect(200);

      expect(res.body.bio).toBe('Nous organisons des festivals de musique traditionnelle depuis 2015.');
    });

    it('rejects a bio over 500 characters', async () => {
      const owner = await registerOrganizer();

      await request(app.getHttpServer())
        .patch(`/organizations/${owner.organizationId}`)
        .set('Authorization', `Bearer ${owner.accessToken}`)
        .send({ bio: 'a'.repeat(501) })
        .expect(400);
    });
  });

  describe('PATCH /organizations/:id/payout-method', () => {
    it('lets OWNER update the payout phone number', async () => {
      const owner = await registerOrganizer();

      const res = await request(app.getHttpServer())
        .patch(`/organizations/${owner.organizationId}/payout-method`)
        .set('Authorization', `Bearer ${owner.accessToken}`)
        .send({ payoutPhoneNumber: '+221771234567' })
        .expect(200);

      expect(res.body.payoutPhoneNumber).toBe('+221771234567');
    });

    it('rejects CO_ORGANIZER updating the payout phone number', async () => {
      const owner = await registerOrganizer();
      const coOrganizer = await registerOrganizer();
      await prisma.organizationMember.create({
        data: {
          organizationId: owner.organizationId,
          userId: coOrganizer.userId,
          role: 'CO_ORGANIZER',
          status: 'ACTIVE',
        },
      });

      await request(app.getHttpServer())
        .patch(`/organizations/${owner.organizationId}/payout-method`)
        .set('Authorization', `Bearer ${coOrganizer.accessToken}`)
        .send({ payoutPhoneNumber: '771234567' })
        .expect(403);
    });

    it('rejects a malformed payoutPhoneNumber', async () => {
      const owner = await registerOrganizer();

      await request(app.getHttpServer())
        .patch(`/organizations/${owner.organizationId}/payout-method`)
        .set('Authorization', `Bearer ${owner.accessToken}`)
        .send({ payoutPhoneNumber: '123' })
        .expect(400);
    });
  });
});
