import { Prisma, TicketAccessMode } from '@prisma/client';
import { PricingService } from '../payments/pricing/pricing.service';
import { PaymentChannel } from '../payments/pricing/payment-channel';
import { EventCardDto } from './dto/event-card.dto';

// Shared "event card" projection — used by every DiscoveryService section
// AND EventsService.findPublicList (the /events listing page), so the
// EventCardDto shape and its displayPrice calculation never drift between
// the homepage carousels and the search/listing page. Presale-whitelist
// ticket types are excluded from the price reference for the same reason as
// TicketTypesService.findPublicForEvent: no visitor identity exists to
// resolve access against.
export const EVENT_CARD_SELECT = {
  id: true,
  slug: true,
  name: true,
  city: true,
  venueName: true,
  startAt: true,
  category: { select: { slug: true, label: true, icon: true, colorToken: true } },
  media: { select: { url: true }, where: { type: 'IMAGE' }, orderBy: { createdAt: 'asc' }, take: 1 },
  ticketTypes: {
    select: { price: true, currency: true },
    where: { accessMode: { not: TicketAccessMode.PRESALE_WHITELIST } },
  },
} satisfies Prisma.EventSelect;

// Every public event query composes this into its `where` so a suspended
// organization's events never surface anywhere public (Super Admin
// moderation, docs/PROGRESS.md §"Suspendre un compte organisateur").
export const NOT_SUSPENDED = { organization: { suspendedAt: null } } satisfies Prisma.EventWhereInput;

export type EventCardRow = Prisma.EventGetPayload<{ select: typeof EVENT_CARD_SELECT }>;

export function toEventCard(event: EventCardRow, pricingService: PricingService): EventCardDto {
  const prices = event.ticketTypes.map((tt) => Number(tt.price));
  const cheapest = prices.length > 0 ? Math.min(...prices) : null;
  return {
    id: event.id,
    slug: event.slug,
    name: event.name,
    category: event.category
      ? {
          slug: event.category.slug,
          label: event.category.label,
          icon: event.category.icon,
          colorToken: event.category.colorToken,
        }
      : null,
    coverImageUrl: event.media[0]?.url ?? null,
    city: event.city,
    venueName: event.venueName,
    startAt: event.startAt,
    displayPrice: cheapest !== null ? pricingService.quoteCheckout(cheapest, PaymentChannel.MOBILE_MONEY).totalAmount : null,
    currency: event.ticketTypes[0]?.currency ?? 'XOF',
  };
}
