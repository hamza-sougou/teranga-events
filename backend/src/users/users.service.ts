import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { MemberStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  listMyInvitations(userId: string) {
    return this.prisma.organizationMember.findMany({
      where: { userId, status: MemberStatus.PENDING },
      include: { organization: { select: { id: true, name: true, slug: true } } },
    });
  }

  async acceptInvitation(userId: string, membershipId: string) {
    await this.findOwnPendingInvitation(userId, membershipId);
    return this.prisma.organizationMember.update({
      where: { id: membershipId },
      data: { status: MemberStatus.ACTIVE },
    });
  }

  async declineInvitation(userId: string, membershipId: string) {
    await this.findOwnPendingInvitation(userId, membershipId);
    await this.prisma.organizationMember.delete({ where: { id: membershipId } });
  }

  private async findOwnPendingInvitation(userId: string, membershipId: string) {
    const membership = await this.prisma.organizationMember.findUnique({
      where: { id: membershipId },
    });
    if (!membership || membership.status !== MemberStatus.PENDING) {
      throw new NotFoundException('Invitation not found');
    }
    if (membership.userId !== userId) {
      throw new ForbiddenException('This invitation does not belong to you');
    }
    return membership;
  }
}
