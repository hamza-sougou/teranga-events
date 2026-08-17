import { SetMetadata } from '@nestjs/common';
import { MemberRole } from '@prisma/client';

export const ORG_ROLES_KEY = 'orgRoles';
export const OrgRoles = (...roles: MemberRole[]) => SetMetadata(ORG_ROLES_KEY, roles);
