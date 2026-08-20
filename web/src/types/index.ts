// Mirrors backend/prisma/schema.prisma enums — keep in sync by hand, there
// is no shared package between web/ and backend/ in this monorepo.

export type MemberRole = 'OWNER' | 'CO_ORGANIZER' | 'SELLER' | 'CONTROLLER' | 'ACCOUNTANT';
export type MemberStatus = 'PENDING' | 'ACTIVE' | 'SUSPENDED';
export type EventStatus = 'DRAFT' | 'PUBLISHED' | 'CANCELLED' | 'COMPLETED';
export type TicketStatus = 'PENDING_PAYMENT' | 'VALID' | 'USED' | 'CANCELLED' | 'REFUNDED';
export type OrderStatus = 'PENDING' | 'PAID' | 'CANCELLED' | 'REFUNDED' | 'EXPIRED';
export type PayoutStatus = 'PENDING' | 'PROCESSING' | 'PAID' | 'FAILED';

export interface Organization {
  id: string;
  name: string;
  slug: string;
  isVerified: boolean;
}

export interface Membership {
  id: string;
  organizationId: string;
  role: MemberRole;
  status: MemberStatus;
  organization: Organization;
}

export interface CurrentUser {
  id: string;
  email: string;
  fullName: string;
  isSuperAdmin: boolean;
  isActive: boolean;
  memberships: Membership[];
}
