// Mirrors backend/prisma/schema.prisma enums — keep in sync by hand, there
// is no shared package between web/ and backend/ in this monorepo.

export type MemberRole = 'OWNER' | 'CO_ORGANIZER' | 'SELLER' | 'CONTROLLER' | 'ACCOUNTANT';
export type MemberStatus = 'PENDING' | 'ACTIVE' | 'SUSPENDED';
export type EventStatus = 'DRAFT' | 'PUBLISHED' | 'CANCELLED' | 'COMPLETED';
export type TicketStatus = 'PENDING_PAYMENT' | 'VALID' | 'USED' | 'CANCELLED' | 'REFUNDED';
export type OrderStatus = 'PENDING' | 'PAID' | 'CANCELLED' | 'REFUNDED' | 'EXPIRED';
export type PayoutStatus = 'PENDING' | 'PROCESSING' | 'PAID' | 'FAILED';
export type TicketCategory = 'STANDARD' | 'VIP' | 'EARLY_BIRD' | 'PRESALE' | 'GROUP';
export type TicketAccessMode = 'PUBLIC' | 'PRESALE_WHITELIST' | 'PRIVATE_LINK';
export type EventMediaType = 'IMAGE' | 'VIDEO';

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

export interface EventCategory {
  id: string;
  slug: string;
  label: string;
  icon: string;
  colorToken: string;
  sortOrder: number;
  isActive: boolean;
  createdAt: string;
}

export interface Event {
  id: string;
  organizationId: string;
  name: string;
  slug: string;
  description: string | null;
  venueName: string | null;
  address: string | null;
  categoryId: string | null;
  category: EventCategory | null;
  status: EventStatus;
  startAt: string;
  endAt: string;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  // Only present on the detail endpoint (GET .../events/:eventId) — the
  // list endpoint deliberately omits it, nothing there renders a gallery.
  media?: EventMedia[];
}

export interface EventMedia {
  id: string;
  eventId: string;
  type: EventMediaType;
  url: string;
  mimeType: string;
  sizeBytes: number;
  originalFilename: string | null;
  createdAt: string;
}

export interface TicketType {
  id: string;
  eventId: string;
  name: string;
  category: TicketCategory;
  // Prisma Decimal serializes as a string over JSON — same reason
  // Payout.amountDue is typed `string` and converted with Number() at render time.
  price: string;
  currency: string;
  quantityTotal: number;
  quantitySold: number; // server-managed, driven by the anti-oversell trigger — never sent by the client
  maxPerOrder: number;
  accessMode: TicketAccessMode;
  saleStart: string;
  saleEnd: string;
  createdAt: string;
}

export interface TicketTypeWhitelist {
  id: string;
  ticketTypeId: string;
  email: string;
  usedAt: string | null;
  createdAt: string;
}
