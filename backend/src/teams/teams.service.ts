import { randomBytes } from 'crypto';
import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { MemberRole, MemberStatus, Prisma } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../prisma/prisma.service';
import { InviteMemberDto } from './dto/invite-member.dto';
import { UpdateMemberDto } from './dto/update-member.dto';

const MEMBER_INCLUDE = {
  user: { select: { id: true, email: true, fullName: true, isActive: true } },
} satisfies Prisma.OrganizationMemberInclude;

@Injectable()
export class TeamsService {
  constructor(private readonly prisma: PrismaService) {}

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

    try {
      return await this.prisma.organizationMember.create({
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
  }

  async update(organizationId: string, memberId: string, dto: UpdateMemberDto) {
    const member = await this.findOneForOrganization(organizationId, memberId);
    this.assertNotOwner(member.role);

    return this.prisma.organizationMember.update({
      where: { id: memberId },
      data: { role: dto.role, status: dto.status },
      include: MEMBER_INCLUDE,
    });
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
