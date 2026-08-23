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
export type DressCodeAudience = 'EVERYONE' | 'MEN' | 'WOMEN';
export type ScanResult = 'SUCCESS' | 'ALREADY_USED' | 'INVALID' | 'EXPIRED_EVENT';

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
  country: string | null;
  city: string | null;
  // Prisma Decimal serializes as a string over JSON, same reason as
  // TicketType.price below — convert with Number() at usage sites.
  latitude: string | null;
  longitude: string | null;
  categoryId: string | null;
  category: EventCategory | null;
  status: EventStatus;
  // Paramètres optionnels : null = tout le monde. No separate "18+" field —
  // that's just minAge = 18, a frontend shortcut only.
  minAge: number | null;
  startAt: string;
  endAt: string;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  // Only present on the detail endpoint (GET .../events/:eventId) — the
  // list endpoint deliberately omits it, nothing there renders a gallery.
  media?: EventMedia[];
  dressCodes?: EventDressCode[];
}

export interface EventDressCode {
  id: string;
  eventId: string;
  label: string;
  appliesTo: DressCodeAudience;
  sortOrder: number;
  createdAt: string;
}

// Mirrors backend/src/geocoding/providers/nominatim-geocoding.provider.ts's
// NormalizedPlace — one search result from GET /geocode/search.
export interface NormalizedPlace {
  placeId: number;
  name: string;
  displayName: string;
  country: string;
  city: string;
  road: string;
  latitude: number;
  longitude: number;
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

export interface OrderItem {
  id: string;
  ticketTypeId: string;
  quantity: number;
  // Prisma Decimal serializes as a string over JSON — same as TicketType.price.
  unitPrice: string;
  subtotal: string;
  // Only joined on the organizer orders list (GET .../events/:eventId/orders).
  ticketType?: { id: string; name: string };
}

export interface Order {
  id: string;
  eventId: string;
  buyerEmail: string;
  buyerPhone: string | null;
  status: OrderStatus;
  subtotalAmount: string;
  serviceFeeAmount: string;
  totalAmount: string;
  currency: string;
  expiresAt: string;
  createdAt: string;
  items: OrderItem[];
}

export interface Scan {
  id: string;
  result: ScanResult;
  gateOrZone: string | null;
  scannedAt: string;
  ticket: { id: string; ticketType: { id: string; name: string } };
  controller: { id: string; fullName: string };
}
