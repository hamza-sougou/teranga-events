import { randomUUID } from 'crypto';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { AuthService } from '../src/auth/auth.service';
import { PrismaService } from '../src/prisma/prisma.service';

describe('Teams (e2e)', () => {
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
      // notifications.user_id has no cascade — must go before deleting the user.
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

  it('rejects an invite payload with no email', async () => {
    const owner = await registerOrganizer();

    await request(app.getHttpServer())
      .post(`/organizations/${owner.organizationId}/members`)
      .set('Authorization', `Bearer ${owner.accessToken}`)
      .send({ role: 'CO_ORGANIZER' })
      .expect(400);
  });

  it('invites an existing user by email as PENDING', async () => {
    const owner = await registerOrganizer();
    const invitee = await registerOrganizer();
    const inviteeUser = await prisma.user.findUniqueOrThrow({ where: { id: invitee.userId } });

    const res = await request(app.getHttpServer())
      .post(`/organizations/${owner.organizationId}/members`)
      .set('Authorization', `Bearer ${owner.accessToken}`)
      .send({ email: inviteeUser.email, role: 'CO_ORGANIZER' })
      .expect(201);

    expect(res.body.status).toBe('PENDING');
    expect(res.body.role).toBe('CO_ORGANIZER');
    expect(res.body.user.email).toBe(inviteeUser.email);
  });

  it('creates a placeholder user when inviting an unknown email', async () => {
    const owner = await registerOrganizer();
    const unique = randomUUID();
    const email = `newcomer-${unique}@example.com`;
    createdUserEmails.push(email);

    const res = await request(app.getHttpServer())
      .post(`/organizations/${owner.organizationId}/members`)
      .set('Authorization', `Bearer ${owner.accessToken}`)
      .send({ email, role: 'SELLER', fullName: 'Nouvel Employe' })
      .expect(201);

    expect(res.body.status).toBe('PENDING');
    const created = await prisma.user.findFirstOrThrow({ where: { email } });
    expect(created.fullName).toBe('Nouvel Employe');
    expect(created.passwordHash).not.toBeNull();
    expect(created.googleId).toBeNull();
  });

  it('rejects inviting an unknown email without a fullName', async () => {
    const owner = await registerOrganizer();
    const email = `nofullname-${randomUUID()}@example.com`;

    await request(app.getHttpServer())
      .post(`/organizations/${owner.organizationId}/members`)
      .set('Authorization', `Bearer ${owner.accessToken}`)
      .send({ email, role: 'SELLER' })
      .expect(400);
  });

  it('rejects inviting with role OWNER', async () => {
    const owner = await registerOrganizer();
    const invitee = await registerOrganizer();
    const inviteeUser = await prisma.user.findUniqueOrThrow({ where: { id: invitee.userId } });

    await request(app.getHttpServer())
      .post(`/organizations/${owner.organizationId}/members`)
      .set('Authorization', `Bearer ${owner.accessToken}`)
      .send({ email: inviteeUser.email, role: 'OWNER' })
      .expect(400);
  });

  it('rejects invitation from a member with an unauthorized role', async () => {
    const owner = await registerOrganizer();
    const seller = await registerOrganizer();
    // Directly create an ACTIVE seller membership (no invite endpoint test dependency).
    await prisma.organizationMember.create({
      data: { organizationId: owner.organizationId, userId: seller.userId, role: 'SELLER', status: 'ACTIVE' },
    });
    const invitee = await registerOrganizer();
    const inviteeUser = await prisma.user.findUniqueOrThrow({ where: { id: invitee.userId } });

    await request(app.getHttpServer())
      .post(`/organizations/${owner.organizationId}/members`)
      .set('Authorization', `Bearer ${seller.accessToken}`)
      .send({ email: inviteeUser.email, role: 'CONTROLLER' })
      .expect(403);
  });

  it('rejects inviting a user who is already a member with 409', async () => {
    const owner = await registerOrganizer();
    const invitee = await registerOrganizer();
    const inviteeUser = await prisma.user.findUniqueOrThrow({ where: { id: invitee.userId } });

    await request(app.getHttpServer())
      .post(`/organizations/${owner.organizationId}/members`)
      .set('Authorization', `Bearer ${owner.accessToken}`)
      .send({ email: inviteeUser.email, role: 'CO_ORGANIZER' })
      .expect(201);

    await request(app.getHttpServer())
      .post(`/organizations/${owner.organizationId}/members`)
      .set('Authorization', `Bearer ${owner.accessToken}`)
      .send({ email: inviteeUser.email, role: 'SELLER' })
      .expect(409);
  });

  it('rejects modifying or removing the OWNER membership row', async () => {
    const owner = await registerOrganizer();
    const ownerMembership = await prisma.organizationMember.findFirstOrThrow({
      where: { organizationId: owner.organizationId, role: 'OWNER' },
    });

    await request(app.getHttpServer())
      .patch(`/organizations/${owner.organizationId}/members/${ownerMembership.id}`)
      .set('Authorization', `Bearer ${owner.accessToken}`)
      .send({ status: 'SUSPENDED' })
      .expect(400);

    await request(app.getHttpServer())
      .delete(`/organizations/${owner.organizationId}/members/${ownerMembership.id}`)
      .set('Authorization', `Bearer ${owner.accessToken}`)
      .expect(400);
  });

  it('lists members scoped to the organization', async () => {
    const owner = await registerOrganizer();
    const res = await request(app.getHttpServer())
      .get(`/organizations/${owner.organizationId}/members`)
      .set('Authorization', `Bearer ${owner.accessToken}`)
      .expect(200);

    expect(res.body).toHaveLength(1);
    expect(res.body[0].role).toBe('OWNER');
  });

  describe('invitation acceptance (invitee side)', () => {
    it('lets the invitee accept their own invitation', async () => {
      const owner = await registerOrganizer();
      const invitee = await registerOrganizer();
      const inviteeUser = await prisma.user.findUniqueOrThrow({ where: { id: invitee.userId } });

      const invite = await request(app.getHttpServer())
        .post(`/organizations/${owner.organizationId}/members`)
        .set('Authorization', `Bearer ${owner.accessToken}`)
        .send({ email: inviteeUser.email, role: 'CO_ORGANIZER' })
        .expect(201);

      const listRes = await request(app.getHttpServer())
        .get('/users/me/invitations')
        .set('Authorization', `Bearer ${invitee.accessToken}`)
        .expect(200);
      expect(listRes.body).toHaveLength(1);
      expect(listRes.body[0].id).toBe(invite.body.id);

      const acceptRes = await request(app.getHttpServer())
        .post(`/users/me/invitations/${invite.body.id}/accept`)
        .set('Authorization', `Bearer ${invitee.accessToken}`)
        .expect(201);
      expect(acceptRes.body.status).toBe('ACTIVE');
    });

    it('lets the invitee decline their own invitation, removing the row', async () => {
      const owner = await registerOrganizer();
      const invitee = await registerOrganizer();
      const inviteeUser = await prisma.user.findUniqueOrThrow({ where: { id: invitee.userId } });

      const invite = await request(app.getHttpServer())
        .post(`/organizations/${owner.organizationId}/members`)
        .set('Authorization', `Bearer ${owner.accessToken}`)
        .send({ email: inviteeUser.email, role: 'CO_ORGANIZER' })
        .expect(201);

      await request(app.getHttpServer())
        .post(`/users/me/invitations/${invite.body.id}/decline`)
        .set('Authorization', `Bearer ${invitee.accessToken}`)
        .expect(201);

      const remaining = await prisma.organizationMember.findUnique({ where: { id: invite.body.id } });
      expect(remaining).toBeNull();
    });

    it('rejects accepting an invitation that does not belong to the caller', async () => {
      const owner = await registerOrganizer();
      const invitee = await registerOrganizer();
      const stranger = await registerOrganizer();
      const inviteeUser = await prisma.user.findUniqueOrThrow({ where: { id: invitee.userId } });

      const invite = await request(app.getHttpServer())
        .post(`/organizations/${owner.organizationId}/members`)
        .set('Authorization', `Bearer ${owner.accessToken}`)
        .send({ email: inviteeUser.email, role: 'CO_ORGANIZER' })
        .expect(201);

      await request(app.getHttpServer())
        .post(`/users/me/invitations/${invite.body.id}/accept`)
        .set('Authorization', `Bearer ${stranger.accessToken}`)
        .expect(403);
    });
  });

  describe('Super Admin moderation of an individual member (docs/SPEC.md §10.3)', () => {
    // No new backend endpoint for this — OrganizationRolesGuard already
    // bypasses role checks for a super admin on any :organizationId, so the
    // existing organizer-facing routes work cross-org as-is.
    async function promoteToSuperAdmin(userId: string) {
      await prisma.user.update({ where: { id: userId }, data: { isSuperAdmin: true } });
    }

    it('lets a super admin suspend then reactivate a non-OWNER member of an organization they do not belong to, logging an audit entry each time', async () => {
      const admin = await registerOrganizer();
      await promoteToSuperAdmin(admin.userId);
      const owner = await registerOrganizer();
      const seller = await registerOrganizer();
      const membership = await prisma.organizationMember.create({
        data: { organizationId: owner.organizationId, userId: seller.userId, role: 'SELLER', status: 'ACTIVE' },
      });

      const listRes = await request(app.getHttpServer())
        .get(`/organizations/${owner.organizationId}/members`)
        .set('Authorization', `Bearer ${admin.accessToken}`)
        .expect(200);
      expect(listRes.body.map((m: { id: string }) => m.id)).toEqual(expect.arrayContaining([membership.id]));

      const suspendRes = await request(app.getHttpServer())
        .patch(`/organizations/${owner.organizationId}/members/${membership.id}`)
        .set('Authorization', `Bearer ${admin.accessToken}`)
        .send({ status: 'SUSPENDED' })
        .expect(200);
      expect(suspendRes.body.status).toBe('SUSPENDED');

      const suspendLog = await prisma.auditLog.findFirst({
        where: { entityType: 'organization_member', entityId: membership.id, action: 'member.suspended' },
      });
      expect(suspendLog?.actorUserId).toBe(admin.userId);

      const reactivateRes = await request(app.getHttpServer())
        .patch(`/organizations/${owner.organizationId}/members/${membership.id}`)
        .set('Authorization', `Bearer ${admin.accessToken}`)
        .send({ status: 'ACTIVE' })
        .expect(200);
      expect(reactivateRes.body.status).toBe('ACTIVE');

      const reactivateLog = await prisma.auditLog.findFirst({
        where: { entityType: 'organization_member', entityId: membership.id, action: 'member.reactivated' },
      });
      expect(reactivateLog?.actorUserId).toBe(admin.userId);

      await prisma.auditLog.deleteMany({ where: { entityType: 'organization_member', entityId: membership.id } });
    });

    it('still rejects a super admin trying to suspend the OWNER row through this endpoint', async () => {
      const admin = await registerOrganizer();
      await promoteToSuperAdmin(admin.userId);
      const owner = await registerOrganizer();
      const ownerMembership = await prisma.organizationMember.findFirstOrThrow({
        where: { organizationId: owner.organizationId, role: 'OWNER' },
      });

      await request(app.getHttpServer())
        .patch(`/organizations/${owner.organizationId}/members/${ownerMembership.id}`)
        .set('Authorization', `Bearer ${admin.accessToken}`)
        .send({ status: 'SUSPENDED' })
        .expect(400);
    });
  });
});
