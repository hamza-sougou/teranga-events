import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { MemberRole } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { ORG_ROLES_KEY } from '../decorators/org-roles.decorator';

// Assumes JwtAuthGuard already ran and populated request.user. Any route
// using this guard must have :organizationId in its path — resolving it
// from a nested resource (e.g. an eventId) is left to that resource's own
// module, this guard only handles the direct case.
@Injectable()
export class OrganizationRolesGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const requiredRoles = this.reflector.getAllAndOverride<MemberRole[]>(ORG_ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!requiredRoles || requiredRoles.length === 0) {
      return true;
    }

    const request = context.switchToHttp().getRequest();
    const user = request.user;
    if (!user) {
      throw new ForbiddenException('Not authenticated');
    }
    if (user.isSuperAdmin) {
      return true;
    }

    const organizationId = request.params?.organizationId;
    if (!organizationId) {
      throw new ForbiddenException('Missing organizationId route parameter');
    }

    const membership = await this.prisma.organizationMember.findUnique({
      where: { organizationId_userId: { organizationId, userId: user.id } },
      include: { organization: { select: { suspendedAt: true } } },
    });

    if (!membership || membership.status !== 'ACTIVE' || !requiredRoles.includes(membership.role)) {
      throw new ForbiddenException('Insufficient organization role');
    }

    // Account-level freeze (Super Admin moderation) — blocks every member,
    // OWNER included, unlike an individual member's own `status` which can
    // never be set to SUSPENDED on the OWNER row (TeamsService.assertNotOwner).
    if (membership.organization.suspendedAt) {
      throw new ForbiddenException('This organization is suspended');
    }

    request.membership = membership;
    return true;
  }
}
