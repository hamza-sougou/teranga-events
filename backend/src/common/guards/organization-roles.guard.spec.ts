import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { MemberRole, MemberStatus } from '@prisma/client';
import { OrganizationRolesGuard } from './organization-roles.guard';
import { PrismaService } from '../../prisma/prisma.service';

describe('OrganizationRolesGuard', () => {
  let guard: OrganizationRolesGuard;
  let reflector: Reflector;
  let prisma: { organizationMember: { findUnique: jest.Mock } };

  const organizationId = 'org-1';
  const userId = 'user-1';

  const makeContext = (user: unknown, params: Record<string, string> = { organizationId }) =>
    ({
      switchToHttp: () => ({
        getRequest: () => ({ user, params }),
      }),
      getHandler: () => ({}),
      getClass: () => ({}),
    }) as unknown as ExecutionContext;

  beforeEach(() => {
    reflector = new Reflector();
    prisma = { organizationMember: { findUnique: jest.fn() } };
    guard = new OrganizationRolesGuard(reflector, prisma as unknown as PrismaService);
  });

  it('allows the request when no @OrgRoles metadata is present', async () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(undefined);
    await expect(guard.canActivate(makeContext({ id: userId }))).resolves.toBe(true);
    expect(prisma.organizationMember.findUnique).not.toHaveBeenCalled();
  });

  it('bypasses membership checks for a super admin', async () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue([MemberRole.OWNER]);
    await expect(
      guard.canActivate(makeContext({ id: userId, isSuperAdmin: true })),
    ).resolves.toBe(true);
    expect(prisma.organizationMember.findUnique).not.toHaveBeenCalled();
  });

  it('allows an active member with a matching role', async () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue([MemberRole.OWNER, MemberRole.CO_ORGANIZER]);
    prisma.organizationMember.findUnique.mockResolvedValue({
      organizationId,
      userId,
      role: MemberRole.CO_ORGANIZER,
      status: MemberStatus.ACTIVE,
    });

    await expect(
      guard.canActivate(makeContext({ id: userId, isSuperAdmin: false })),
    ).resolves.toBe(true);
  });

  it('rejects a member whose role is not in the required list', async () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue([MemberRole.OWNER]);
    prisma.organizationMember.findUnique.mockResolvedValue({
      organizationId,
      userId,
      role: MemberRole.SELLER,
      status: MemberStatus.ACTIVE,
    });

    await expect(guard.canActivate(makeContext({ id: userId }))).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });

  it('rejects a suspended member even with the right role', async () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue([MemberRole.OWNER]);
    prisma.organizationMember.findUnique.mockResolvedValue({
      organizationId,
      userId,
      role: MemberRole.OWNER,
      status: MemberStatus.SUSPENDED,
    });

    await expect(guard.canActivate(makeContext({ id: userId }))).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });

  it('rejects a user with no membership in the organization at all', async () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue([MemberRole.OWNER]);
    prisma.organizationMember.findUnique.mockResolvedValue(null);

    await expect(guard.canActivate(makeContext({ id: userId }))).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });

  it('rejects when organizationId is missing from the route params', async () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue([MemberRole.OWNER]);
    await expect(guard.canActivate(makeContext({ id: userId }, {}))).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });
});
