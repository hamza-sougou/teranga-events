import { randomBytes } from 'crypto';
import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { MemberRole, MemberStatus, Prisma, User } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../prisma/prisma.service';
import { AuthService } from '../auth/auth.service';
import { InviteMemberDto } from './dto/invite-member.dto';
import { UpdateMemberDto } from './dto/update-member.dto';
import { NotificationsService } from '../notifications/notifications.service';

const MEMBER_INCLUDE = {
  user: { select: { id: true, email: true, phoneNumber: true, fullName: true, isActive: true } },
} satisfies Prisma.OrganizationMemberInclude;

@Injectable()
export class TeamsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notificationsService: NotificationsService,
    private readonly authService: AuthService,
  ) {}

  findAllForOrganization(organizationId: string) {
    return this.prisma.organizationMember.findMany({
      where: { organizationId },
      include: MEMBER_INCLUDE,
    });
  }

  async invite(organizationId: string, inviterUserId: string, dto: InviteMemberDto) {
    const existingUser = dto.email
      ? await this.prisma.user.findFirst({ where: { email: { equals: dto.email, mode: 'insensitive' } } })
      : await this.prisma.user.findFirst({ where: { phoneNumber: dto.phone } });

    if (existingUser) {
      const existingMembership = await this.prisma.organizationMember.findUnique({
        where: { organizationId_userId: { organizationId, userId: existingUser.id } },
      });
      if (existingMembership) {
        return this.reinviteExistingMember(existingMembership, existingUser, organizationId, dto.role);
      }
    }

    const userId = existingUser
      ? existingUser.id
      : await this.createPlaceholderUser(dto.email, dto.phone, dto.fullName);

    let membership;
    try {
      membership = await this.prisma.organizationMember.create({
        data: {
          organizationId,
          userId,
          role: dto.role,
          status: MemberStatus.PENDING,
          invitedBy: inviterUserId,
        },
        include: MEMBER_INCLUDE,
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException('This user is already a member of the organization');
      }
      throw error;
    }

    // Only a freshly-created placeholder needs an activation code — an
    // invited existing account already has a working password (or Google),
    // it just needs to accept the invitation via /users/me/invitations.
    if (!existingUser) {
      const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId } });
      const organization = await this.prisma.organization.findUniqueOrThrow({ where: { id: organizationId } });
      await this.authService.issueInvitationActivationCode(user, organization.name, dto.role);
    }

    await this.notificationsService.notifyTeamInvitation(membership.id);
    return membership;
  }

  async update(organizationId: string, memberId: string, dto: UpdateMemberDto, actorUserId?: string) {
    const member = await this.findOneForOrganization(organizationId, memberId);
    this.assertNotOwner(member.role);

    const updated = await this.prisma.organizationMember.update({
      where: { id: memberId },
      data: { role: dto.role, status: dto.status },
      include: MEMBER_INCLUDE,
    });

    // Security-relevant either way (a team member frozen out or restored) —
    // logged regardless of who the actor is (a manager suspending their own
    // seller, or a Super Admin moderating), same pattern as AuditLog's only
    // other writer today (PaymentsService).
    if (dto.status && dto.status !== member.status) {
      await this.prisma.auditLog.create({
        data: {
          actorUserId,
          organizationId,
          action: dto.status === MemberStatus.SUSPENDED ? 'member.suspended' : 'member.reactivated',
          entityType: 'organization_member',
          entityId: memberId,
        },
      });
    }

    return updated;
  }

  async remove(organizationId: string, memberId: string) {
    const member = await this.findOneForOrganization(organizationId, memberId);
    this.assertNotOwner(member.role);

    await this.prisma.organizationMember.delete({ where: { id: memberId } });
  }

  private async findOneForOrganization(organizationId: string, memberId: string) {
    const member = await this.prisma.organizationMember.findFirst({
      where: { id: memberId, organizationId },
    });
    if (!member) {
      throw new NotFoundException('Member not found');
    }
    return member;
  }

  private assertNotOwner(role: MemberRole) {
    if (role === MemberRole.OWNER) {
      throw new BadRequestException('The organization owner cannot be modified through this endpoint');
    }
  }

  // Re-inviting someone already a member of this organization is only ever
  // allowed to resend an activation code to a placeholder that never
  // activated (their original code/link expired) — every other case (already
  // ACTIVE/SUSPENDED, or an already-activated account still PENDING) stays a
  // real conflict, same as before this method existed.
  private async reinviteExistingMember(
    membership: { id: string; status: MemberStatus },
    user: User,
    organizationId: string,
    role: MemberRole,
  ) {
    if (membership.status !== MemberStatus.PENDING || user.passwordSet) {
      throw new ConflictException('This user is already a member of the organization');
    }

    const organization = await this.prisma.organization.findUniqueOrThrow({ where: { id: organizationId } });
    await this.authService.issueInvitationActivationCode(user, organization.name, role);

    return this.prisma.organizationMember.findUniqueOrThrow({
      where: { id: membership.id },
      include: MEMBER_INCLUDE,
    });
  }

  // No password/notification is sent from here — activation (setting a real
  // password, whichever channel this placeholder was invited through) goes
  // through AuthService.issueInvitationActivationCode / POST
  // /auth/activate-invitation (phone-auth step 2/5, PROGRESS.md). The random
  // bcrypt hash below is unusable and never meant to be — passwordSet: false
  // is what actually gates activation, kept only as defense in depth and to
  // satisfy chk_users_auth_method for an email-only placeholder.
  private async createPlaceholderUser(
    email: string | undefined,
    phone: string | undefined,
    fullName?: string,
  ): Promise<string> {
    if (!fullName) {
      throw new BadRequestException('fullName is required to invite a user who has no account yet');
    }

    const passwordHash = await bcrypt.hash(randomBytes(32).toString('hex'), 10);
    const user = await this.prisma.user.create({
      data: { email, phoneNumber: phone, fullName, passwordHash, passwordSet: false },
    });
    return user.id;
  }
}
