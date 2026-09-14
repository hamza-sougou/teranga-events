import { Injectable } from '@nestjs/common';
import { OrderStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuthService } from '../auth/auth.service';
import { UpdateOrganizationDto } from './dto/update-organization.dto';

export const PROFILE_SELECT = {
  id: true,
  name: true,
  slug: true,
  contactEmail: true,
  contactPhone: true,
  payoutPhoneNumber: true,
  isVerified: true,
  avatarImageUrl: true,
  coverImageUrl: true,
  bio: true,
} as const;

const ADMIN_LIST_SELECT = {
  id: true,
  name: true,
  slug: true,
  contactEmail: true,
  contactPhone: true,
  isVerified: true,
  suspendedAt: true,
  createdAt: true,
  _count: { select: { events: true } },
  owner: { select: { id: true, fullName: true, email: true } },
} as const;

const ADMIN_MEMBER_INCLUDE = {
  user: { select: { id: true, email: true, fullName: true, isActive: true } },
} satisfies Prisma.OrganizationMemberInclude;

@Injectable()
export class OrganizationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly authService: AuthService,
  ) {}

  findOne(organizationId: string) {
    return this.prisma.organization.findUniqueOrThrow({
      where: { id: organizationId },
      select: PROFILE_SELECT,
    });
  }

  // Point C (phone-auth step 2/5, PROGRESS.md): an already-authenticated
  // user creates an additional organization they own — see
  // AuthService.provisionOrganizationForUser for why this isn't a variant
  // of /auth/register.
  async createForUser(userId: string) {
    const organization = await this.authService.provisionOrganizationForUser(userId);
    return this.findOne(organization.id);
  }

  updateProfile(organizationId: string, dto: UpdateOrganizationDto) {
    return this.prisma.organization.update({
      where: { id: organizationId },
      data: dto,
      select: PROFILE_SELECT,
    });
  }

  updatePayoutMethod(organizationId: string, payoutPhoneNumber: string) {
    return this.prisma.organization.update({
      where: { id: organizationId },
      data: { payoutPhoneNumber },
      select: PROFILE_SELECT,
    });
  }

  // Super Admin only (see AdminOrganizationsController). Sales volume is
  // computed via a separate groupBy-by-eventId + in-memory reduction to
  // organizationId, rather than a raw SQL join, since organization_id isn't
  // a column on `orders` — keeps this on plain Prisma like the rest of the
  // module, at the cost of loading all event id/organizationId pairs, which
  // is fine at the scale of a Super Admin org list.
  async findAllForSuperAdmin() {
    const [organizations, events, orderSums] = await Promise.all([
      this.prisma.organization.findMany({
        select: ADMIN_LIST_SELECT,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.event.findMany({ select: { id: true, organizationId: true } }),
      this.prisma.order.groupBy({
        by: ['eventId'],
        where: { status: OrderStatus.PAID },
        _sum: { subtotalAmount: true },
      }),
    ]);

    const eventToOrg = new Map(events.map((event) => [event.id, event.organizationId]));
    const salesVolumeByOrg = new Map<string, number>();
    for (const row of orderSums) {
      const organizationId = eventToOrg.get(row.eventId);
      if (!organizationId) continue;
      const amount = Number(row._sum.subtotalAmount ?? 0);
      salesVolumeByOrg.set(organizationId, (salesVolumeByOrg.get(organizationId) ?? 0) + amount);
    }

    return organizations.map(({ _count, ...org }) => ({
      ...org,
      eventsCount: _count.events,
      salesVolume: salesVolumeByOrg.get(org.id) ?? 0,
    }));
  }

  setVerification(organizationId: string, isVerified: boolean) {
    return this.prisma.organization.update({
      where: { id: organizationId },
      data: { isVerified },
      select: PROFILE_SELECT,
    });
  }

  // Account-level freeze — see OrganizationRolesGuard (blocks every member
  // including OWNER), OrdersService.validateAndResolveItems (blocks
  // checkout), EventsService.findPublicBySlug/DiscoveryService (hides public
  // visibility) and PayoutsService (skips payout eligibility). No dedicated
  // "reason" column — logged into audit_logs.metadata instead, the only
  // existing writer of that table (PaymentsService) follows the same
  // pattern rather than growing the organizations table for a cosmetic field.
  async setSuspension(organizationId: string, suspended: boolean, actorUserId: string, reason?: string) {
    const organization = await this.prisma.organization.update({
      where: { id: organizationId },
      data: { suspendedAt: suspended ? new Date() : null },
      select: PROFILE_SELECT,
    });

    await this.prisma.auditLog.create({
      data: {
        actorUserId,
        organizationId,
        action: suspended ? 'organization.suspended' : 'organization.reactivated',
        entityType: 'organization',
        entityId: organizationId,
        metadata: reason ? { reason } : undefined,
      },
    });

    return organization;
  }

  // Super Admin moderation view of an organization's team — the mutation
  // itself reuses TeamsController/TeamsService as-is (OrganizationRolesGuard
  // already bypasses role checks for a super admin on any :organizationId),
  // this is only the read side for the admin "Voir l'équipe" panel.
  findMembersForSuperAdmin(organizationId: string) {
    return this.prisma.organizationMember.findMany({
      where: { organizationId },
      include: ADMIN_MEMBER_INCLUDE,
    });
  }
}
