import { randomBytes } from 'crypto';
import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { MemberRole, MemberStatus, Prisma } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../prisma/prisma.service';
import { InviteMemberDto } from './dto/invite-member.dto';
import { UpdateMemberDto } from './dto/update-member.dto';
import { NotificationsService } from '../notifications/notifications.service';

const MEMBER_INCLUDE = {
  user: { select: { id: true, email: true, fullName: true, isActive: true } },
} satisfies Prisma.OrganizationMemberInclude;

@Injectable()
export class TeamsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notificationsService: NotificationsService,
  ) {}

  findAllForOrganization(organizationId: string) {
    return this.prisma.organizationMember.findMany({
      where: { organizationId },
      include: MEMBER_INCLUDE,
    });
  }

  async invite(organizationId: string, inviterUserId: string, dto: InviteMemberDto) {
    const existing = await this.prisma.user.findFirst({
      where: { email: { equals: dto.email, mode: 'insensitive' } },
    });

    const userId = existing
      ? existing.id
      : await this.createPlaceholderUser(dto.email, dto.fullName);

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

  // No password/notification is ever sent for this placeholder — the
  // invitee activates the account by signing in with Google on the same
  // email (AuthService.loginWithGoogle auto-links by email).
  private async createPlaceholderUser(email: string, fullName?: string): Promise<string> {
    if (!fullName) {
      throw new BadRequestException('fullName is required to invite a user who has no account yet');
    }

    const passwordHash = await bcrypt.hash(randomBytes(32).toString('hex'), 10);
    const user = await this.prisma.user.create({
      data: { email, fullName, passwordHash },
    });
    return user.id;
  }
}
