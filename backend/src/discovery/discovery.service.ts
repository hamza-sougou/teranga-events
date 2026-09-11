import { Injectable, NotFoundException } from '@nestjs/common';
import { EventStatus, OrderStatus, TicketAccessMode } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { PricingService } from '../payments/pricing/pricing.service';
import { EventCardDto } from './dto/event-card.dto';
import { EVENT_CARD_SELECT, EventCardRow, NOT_SUSPENDED, toEventCard } from './event-card.mapper';

const DEFAULT_LIMIT = 10;

@Injectable()
export class DiscoveryService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly pricingService: PricingService,
  ) {}

  // "En tendance" — orders PAID récentes (jamais ticket_types.quantity_sold,
  // cumulatif depuis toujours et pas représentatif d'une dynamique récente).
  async trending(limit = DEFAULT_LIMIT): Promise<EventCardDto[]> {
    const windowStart = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const orders = await this.prisma.order.findMany({
      where: {
        status: OrderStatus.PAID,
        createdAt: { gte: windowStart },
        event: { status: EventStatus.PUBLISHED, ...NOT_SUSPENDED },
      },
      select: { eventId: true, items: { select: { quantity: true } } },
    });

    const quantityByEvent = new Map<string, number>();
    for (const order of orders) {
      const quantity = order.items.reduce((sum, item) => sum + item.quantity, 0);
      quantityByEvent.set(order.eventId, (quantityByEvent.get(order.eventId) ?? 0) + quantity);
    }

    const topEventIds = [...quantityByEvent.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, limit)
      .map(([eventId]) => eventId);

    return this.cardsInOrder(topEventIds);
  }

  // "Ce week-end" — fenêtre vendredi-dimanche à venir. Si aujourd'hui est
  // déjà dans le week-end (ven/sam/dim), inclut le reste du week-end en
  // cours plutôt que de sauter au prochain complet — voir getWeekendEnd.
  async thisWeekend(limit = DEFAULT_LIMIT): Promise<EventCardDto[]> {
    const now = new Date();
    const events = await this.prisma.event.findMany({
      where: { status: EventStatus.PUBLISHED, startAt: { gte: now, lte: getWeekendEnd(now) }, ...NOT_SUSPENDED },
      orderBy: { startAt: 'asc' },
      take: limit,
      select: EVENT_CARD_SELECT,
    });
    return events.map((event) => this.toCard(event));
  }

  // "Près de toi" — Haversine en SQL brut, pas de colonne/PostGIS ajoutés
  // (même raisonnement que pour la carte évènement). Isolé dans sa propre
  // méthode, jamais mélangé au query builder Prisma.
  async nearMe(lat: number, lng: number, radiusKm = 25, limit = DEFAULT_LIMIT): Promise<EventCardDto[]> {
    const nearby = await this.prisma.$queryRaw<{ id: string }[]>`
      SELECT id FROM (
        SELECT events.id, (6371 * acos(LEAST(1, GREATEST(-1,
          cos(radians(${lat})) * cos(radians(latitude)) * cos(radians(longitude) - radians(${lng}))
          + sin(radians(${lat})) * sin(radians(latitude))
        )))) AS distance_km
        FROM events
        JOIN organizations ON organizations.id = events.organization_id AND organizations.suspended_at IS NULL
        WHERE events.status = 'published' AND latitude IS NOT NULL AND longitude IS NOT NULL
      ) AS event_distances
      WHERE distance_km <= ${radiusKm}
      ORDER BY distance_km ASC
      LIMIT ${limit}
    `;
    return this.cardsInOrder(nearby.map((row) => row.id));
  }

  // "Sponsorisés" — event_promotions actives maintenant (docs/SPEC.md §9.2).
  // Triées par expiration la plus proche d'abord : évite qu'une mise en
  // avant gagnée tôt monopolise la section jusqu'à son expiration.
  async sponsored(limit = DEFAULT_LIMIT): Promise<EventCardDto[]> {
    const now = new Date();
    const promotions = await this.prisma.eventPromotion.findMany({
      where: { startsAt: { lte: now }, endsAt: { gte: now }, event: { status: EventStatus.PUBLISHED, ...NOT_SUSPENDED } },
      orderBy: { endsAt: 'asc' },
      distinct: ['eventId'],
      take: limit,
      select: { event: { select: EVENT_CARD_SELECT } },
    });
    return promotions.map((promotion) => this.toCard(promotion.event));
  }

  // "Publiés récemment" — published_at, jamais created_at (docs/SPEC.md §9.3).
  async recentlyPublished(limit = DEFAULT_LIMIT): Promise<EventCardDto[]> {
    const events = await this.prisma.event.findMany({
      where: { status: EventStatus.PUBLISHED, publishedAt: { not: null }, ...NOT_SUSPENDED },
      orderBy: { publishedAt: 'desc' },
      take: limit,
      select: EVENT_CARD_SELECT,
    });
    return events.map((event) => this.toCard(event));
  }

  async byCategory(categorySlug: string, limit = DEFAULT_LIMIT): Promise<EventCardDto[]> {
    const category = await this.prisma.eventCategory.findFirst({ where: { slug: categorySlug, isActive: true } });
    if (!category) {
      throw new NotFoundException('Category not found');
    }
    const events = await this.prisma.event.findMany({
      where: { status: EventStatus.PUBLISHED, categoryId: category.id, ...NOT_SUSPENDED },
      orderBy: { startAt: 'asc' },
      take: limit,
      select: EVENT_CARD_SELECT,
    });
    return events.map((event) => this.toCard(event));
  }

  // "Dernière chance" — >85% vendu et/ou évènement dans 0-72h (borne haute
  // retenue pour l'intervalle 48-72h de docs/SPEC.md §9.1). Le ratio
  // quantity_sold/quantity_total ne peut pas s'exprimer comme filtre Prisma
  // (pas de comparaison colonne-à-colonne dans le query builder) — filtré en
  // JS sur un lot borné, même simplification que
  // StatsService.getWeeklySales à l'échelle MVP actuelle.
  async lastChance(limit = DEFAULT_LIMIT): Promise<EventCardDto[]> {
    const now = new Date();
    const soonThreshold = new Date(now.getTime() + 72 * 60 * 60 * 1000);

    const candidates = await this.prisma.event.findMany({
      where: { status: EventStatus.PUBLISHED, startAt: { gt: now }, ...NOT_SUSPENDED },
      orderBy: { startAt: 'asc' },
      take: 200,
      select: {
        ...EVENT_CARD_SELECT,
        ticketTypes: {
          select: {
            price: true,
            currency: true,
            quantitySold: true,
            quantityTotal: true,
            saleStart: true,
            saleEnd: true,
          },
          where: { accessMode: { not: TicketAccessMode.PRESALE_WHITELIST } },
        },
      },
    });

    const qualifying = candidates.filter((event) => {
      const startingSoon = event.startAt <= soonThreshold;
      const almostSoldOut = event.ticketTypes.some(
        (tt) => tt.saleStart <= now && tt.saleEnd >= now && tt.quantitySold / tt.quantityTotal > 0.85,
      );
      return startingSoon || almostSoldOut;
    });

    return qualifying.slice(0, limit).map((event) => this.toCard(event));
  }

  // "Gratuit" — au moins un ticket type à price = 0, actuellement en vente.
  async free(limit = DEFAULT_LIMIT): Promise<EventCardDto[]> {
    const now = new Date();
    const events = await this.prisma.event.findMany({
      where: {
        status: EventStatus.PUBLISHED,
        ...NOT_SUSPENDED,
        ticketTypes: {
          some: {
            price: 0,
            accessMode: { not: TicketAccessMode.PRESALE_WHITELIST },
            saleStart: { lte: now },
            saleEnd: { gte: now },
          },
        },
      },
      orderBy: { startAt: 'asc' },
      take: limit,
      select: EVENT_CARD_SELECT,
    });
    return events.map((event) => this.toCard(event));
  }

  // Re-fetches full card rows for a list of ids obtained from a query that
  // can't `select` the card shape directly (raw SQL, or a JS-side aggregate
  // across relations) — `IN (...)` doesn't preserve order, so results are
  // re-ordered to match the caller's ranking.
  private async cardsInOrder(eventIds: string[]): Promise<EventCardDto[]> {
    if (eventIds.length === 0) return [];
    const events = await this.prisma.event.findMany({
      where: { id: { in: eventIds }, ...NOT_SUSPENDED },
      select: EVENT_CARD_SELECT,
    });
    const byId = new Map(events.map((event) => [event.id, event]));
    return eventIds
      .map((id) => byId.get(id))
      .filter((event): event is EventCardRow => event !== undefined)
      .map((event) => this.toCard(event));
  }

  private toCard(event: EventCardRow): EventCardDto {
    return toEventCard(event, this.pricingService);
  }
}

// Sénégal tourne en UTC+0 toute l'année (pas d'heure d'été) — le jour de la
// semaine en UTC est donc exact pour le public visé, aucune conversion de
// fuseau nécessaire.
function getWeekendEnd(now: Date): Date {
  const day = now.getUTCDay(); // 0 = dimanche ... 6 = samedi
  const daysUntilSunday = (7 - day) % 7; // ven->2, sam->1, dim->0, lun->6, ...
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + daysUntilSunday, 23, 59, 59, 999));
}
