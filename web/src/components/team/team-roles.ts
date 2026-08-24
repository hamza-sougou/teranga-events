import type { MemberRole } from '@/types';

// Mirrors INVITABLE_ROLES in backend/src/teams/dto/invite-member.dto.ts (and
// ASSIGNABLE_ROLES in update-member.dto.ts, identical set) — OWNER is never
// invited/reassigned through this module, it's created once at signup.
export const INVITABLE_ROLES: MemberRole[] = ['CO_ORGANIZER', 'SELLER', 'CONTROLLER', 'ACCOUNTANT'];

export const TEAM_ROLE_LABELS: Record<MemberRole, string> = {
  OWNER: 'Organisateur',
  CO_ORGANIZER: 'Co-organisateur',
  SELLER: 'Vendeur',
  CONTROLLER: 'Contrôleur',
  ACCOUNTANT: 'Comptable',
};
