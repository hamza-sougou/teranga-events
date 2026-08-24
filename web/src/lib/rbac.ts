import type { MemberRole } from '@/types';

// Mirrors MANAGE_ROLES in backend/src/events/events.controller.ts (and the
// identical constant in ticket-types.controller.ts) — keep in sync by hand,
// same convention as types/index.ts.
export const MANAGE_ROLES: MemberRole[] = ['OWNER', 'CO_ORGANIZER'];

export function canManageEvents(role?: MemberRole | null): boolean {
  return !!role && MANAGE_ROLES.includes(role);
}

// Same MANAGE_ROLES as backend/src/teams/teams.controller.ts's MANAGE_ROLES
// (invite/update/remove a team member) — identical set to events, kept as
// its own function so each call site reads as what it's actually gating.
export function canManageTeam(role?: MemberRole | null): boolean {
  return !!role && MANAGE_ROLES.includes(role);
}

// Mirrors backend/src/organizations/organizations.controller.ts's
// MANAGE_PAYOUT_METHOD_ROLES — payout_phone_number is the real destination
// of the organization's money, restricted to OWNER only, unlike the rest of
// the organization profile (MANAGE_ROLES above).
export function canManagePayoutMethod(role?: MemberRole | null): boolean {
  return role === 'OWNER';
}
