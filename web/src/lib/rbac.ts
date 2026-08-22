import type { MemberRole } from '@/types';

// Mirrors MANAGE_ROLES in backend/src/events/events.controller.ts (and the
// identical constant in ticket-types.controller.ts) — keep in sync by hand,
// same convention as types/index.ts.
export const MANAGE_ROLES: MemberRole[] = ['OWNER', 'CO_ORGANIZER'];

export function canManageEvents(role?: MemberRole | null): boolean {
  return !!role && MANAGE_ROLES.includes(role);
}
