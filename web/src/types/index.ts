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

// Full profile returned by GET /organizations/:id — a superset of the
// Organization shape embedded in CurrentUser.memberships, which only carries
// the fields /auth/me needs.
export interface OrganizationProfile {
  id: string;
  name: string;
  slug: string;
  contactEmail: string | null;
  contactPhone: string | null;
  payoutPhoneNumber: string | null;
  isVerified: boolean;
}

// GET /admin/organizations — Super Admin only. eventsCount/salesVolume are
// computed server-side (see OrganizationsService.findAllForSuperAdmin),
// salesVolume is the organizer's part (subtotalAmount) of PAID orders only.
export interface AdminOrganizationListItem {
  id: string;
  name: string;
  slug: string;
  contactEmail: string | null;
  contactPhone: string | null;
  isVerified: boolean;
  suspendedAt: string | null;
  createdAt: string;
  eventsCount: number;
  salesVolume: number;
  owner: { id: string; fullName: string; email: string };
}

// GET /admin/events — Super Admin only, cross-organization moderation view.
export interface AdminEventListItem {
  id: string;
  name: string;
  slug: string;
  status: EventStatus;
  startAt: string;
  endAt: string;
  category: { label: string } | null;
  organization: { id: string; name: string };
}

// GET /organizations/:organizationId/members — also used by the admin
// "Voir l'équipe" panel (same shape, Super Admin already allowed to call it).
export interface AdminOrgMember {
  id: string;
  role: MemberRole;
  status: MemberStatus;
  user: { id: string; fullName: string; email: string };
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
  // false for an account created via Google Sign-In that never set a
  // password — the settings page uses this to hide the change-password form.
  hasPassword: boolean;
  // null for an unverified classic account, or one whose verification is
  // still pending. Always set for a Google account (Google already proved
  // email ownership at signup) — never gates login, see
  // EmailVerificationBanner.
  emailVerifiedAt: string | null;
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
  // Neighbourhood/district, never a street — see the backend provider for
  // why (french admin prefixes stripped, never falls back to display_name).
  district: string;
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

// GET /events/:slug (PUBLIC_EVENT_SELECT) — a narrower shape than the
// organizer's Event: no organizationId/status/createdBy, media is always
// present (not conditional on a "detail" endpoint like the organizer one).
export interface PublicEvent {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  venueName: string | null;
  address: string | null;
  country: string | null;
  city: string | null;
  latitude: string | null;
  longitude: string | null;
  category: EventCategory | null;
  minAge: number | null;
  dressCodes: EventDressCode[];
  startAt: string;
  endAt: string;
  media: EventMedia[];
  // Just the name — no real organizer profile (avatar/followers/verified
  // status) exists yet, see components/public/organizer-panel.tsx.
  organization: { name: string };
}

// GET /events/:slug/ticket-types — a deliberately narrower projection than
// the organizer's TicketType (no quantityTotal/quantitySold, see
// backend/src/ticket-types/ticket-types.service.ts#findPublicForEvent).
// presale_whitelist types never appear here — this page has no visitor
// identity to check a whitelist against.
export interface PublicTicketType {
  id: string;
  name: string;
  category: TicketCategory;
  price: string;
  // Commission-included price the buyer actually pays, computed on the
  // mobile money reference channel — see docs/SPEC.md §5.5. A plain number
  // (not a Decimal-as-string) since the backend computes it, not Prisma.
  displayPrice: number;
  currency: string;
  maxPerOrder: number;
  accessMode: TicketAccessMode;
  saleStart: string;
  saleEnd: string;
  available: number;
  isOnSale: boolean;
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

// GET /orders/:orderId (public, no auth) — a narrower, differently-shaped
// projection than the organizer's Order above (see
// backend/src/orders/orders.service.ts#findPublicById): no eventId/
// buyerEmail/createdAt, items carry a flat ticketTypeName instead of a
// joined ticketType, and only VALID tickets (with a rendered QR data-URL)
// are ever included per item.
export interface PublicOrderTicket {
  id: string;
  status: string;
  qrCode: string;
}

export interface PublicOrderItem {
  ticketTypeId: string;
  ticketTypeName: string;
  quantity: number;
  unitPrice: string;
  tickets: PublicOrderTicket[];
}

export interface PublicOrder {
  id: string;
  status: OrderStatus;
  subtotalAmount: string;
  serviceFeeAmount: string;
  totalAmount: string;
  currency: string;
  expiresAt: string;
  items: PublicOrderItem[];
}

export interface Scan {
  id: string;
  result: ScanResult;
  gateOrZone: string | null;
  scannedAt: string;
  ticket: { id: string; ticketType: { id: string; name: string } };
  controller: { id: string; fullName: string };
}
