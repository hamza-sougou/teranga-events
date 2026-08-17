import { SetMetadata } from '@nestjs/common';
import { MemberRole } from '@prisma/client';

export const ORG_ROLES_KEY = 'orgRoles';
export const OrgRoles = (...roles: MemberRole[]) => SetMetadata(ORG_ROLES_KEY, roles);

// Convenience for "any active member of the organization" — read endpoints
// across modules (events, ticket-types, orders...) share this same intent.
export const ALL_MEMBER_ROLES = Object.values(MemberRole);
