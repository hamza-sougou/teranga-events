import { Injectable } from '@nestjs/common';
import { EventStatus, OrderStatus, TicketStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { EventsService } from '../events/events.service';

@Injectable()
export class StatsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly eventsService: EventsService,
  ) {}

  async getEventStats(organizationId: string, eventId: string) {
    const event = await this.eventsService.findOneForOrganization(organizationId, eventId);

    const [ticketTypes, ticketGroups, revenueAgg, payout] = await Promise.all([
      this.prisma.ticketType.findMany({ where: { eventId } }),
      this.prisma.ticket.groupBy({
        by: ['status'],
        where: { ticketType: { eventId } },
        _count: { _all: true },
      }),
      this.prisma.order.aggregate({
        where: { eventId, status: OrderStatus.PAID },
        _sum: { subtotalAmount: true, serviceFeeAmount: true, totalAmount: true },
        _count: true,
      }),
      this.prisma.payout.findUnique({ where: { eventId } }),
    ]);

    const ticketsByStatus = Object.fromEntries(
      Object.values(TicketStatus).map((status) => [status, 0]),
    ) as Record<TicketStatus, number>;
    for (const group of ticketGroups) {
      ticketsByStatus[group.status] = group._count._all;
    }

    // quantity_sold is trigger-maintained (db/schema.sql section 13) —
    // reserved capacity as soon as a ticket row exists (pending_payment
    // included), released back on cancellation/refund. Reused directly
    // rather than recomputed from ticket rows.
    const capacityTotal = ticketTypes.reduce((sum, tt) => sum + tt.quantityTotal, 0);
    const capacityReserved = ticketTypes.reduce((sum, tt) => sum + tt.quantitySold, 0);

    return {
      event: { id: event.id, name: event.name, status: event.status, startAt: event.startAt, endAt: event.endAt },
      capacity: {
        total: capacityTotal,
        reserved: capacityReserved,
        available: capacityTotal - capacityReserved,
      },
      fillRate: capacityTotal > 0 ? capacityReserved / capacityTotal : 0,
      ticketsByStatus,
      revenue: {
        grossRevenue: Number(revenueAgg._sum.totalAmount ?? 0),
        organizerRevenue: Number(revenueAgg._sum.subtotalAmount ?? 0),
        platformCommission: Number(revenueAgg._sum.serviceFeeAmount ?? 0),
        currency: 'XOF',
        paidOrdersCount: revenueAgg._count,
      },
      salesByTicketType: ticketTypes.map((tt) => ({
        id: tt.id,
        name: tt.name,
        quantityTotal: tt.quantityTotal,
        quantitySold: tt.quantitySold,
        available: tt.quantityTotal - tt.quantitySold,
      })),
      payout: payout
        ? {
            status: payout.status,
            amountDue: Number(payout.amountDue),
            amountPaid: payout.amountPaid !== null ? Number(payout.amountPaid) : null,
            triggeredAt: payout.triggeredAt,
          }
        : null,
    };
  }

  async getOrganizationStats(organizationId: string) {
    const [eventGroups, revenueAgg, capacityAgg, recentEvents, weeklySales] = await Promise.all([
      this.prisma.event.groupBy({
        by: ['status'],
        where: { organizationId },
        _count: { _all: true },
      }),
      this.prisma.order.aggregate({
        where: { event: { organizationId }, status: OrderStatus.PAID },
        _sum: { subtotalAmount: true, serviceFeeAmount: true, totalAmount: true },
        _count: true,
      }),
      this.prisma.ticketType.aggregate({
        where: { event: { organizationId } },
        _sum: { quantityTotal: true, quantitySold: true },
      }),
      this.getRecentEventsBreakdown(organizationId),
      this.getWeeklySales(organizationId),
    ]);

    const eventsByStatus = Object.fromEntries(
      Object.values(EventStatus).map((status) => [status, 0]),
    ) as Record<EventStatus, number>;
    let totalEvents = 0;
    for (const group of eventGroups) {
      eventsByStatus[group.status] = group._count._all;
      totalEvents += group._count._all;
    }

    const capacityTotal = capacityAgg._sum.quantityTotal ?? 0;
    const capacityReserved = capacityAgg._sum.quantitySold ?? 0;

    return {
      totalEvents,
      eventsByStatus,
      capacity: {
        total: capacityTotal,
        reserved: capacityReserved,
        available: capacityTotal - capacityReserved,
      },
      fillRate: capacityTotal > 0 ? capacityReserved / capacityTotal : 0,
      revenue: {
        grossRevenue: Number(revenueAgg._sum.totalAmount ?? 0),
        organizerRevenue: Number(revenueAgg._sum.subtotalAmount ?? 0),
        platformCommission: Number(revenueAgg._sum.serviceFeeAmount ?? 0),
        currency: 'XOF',
        paidOrdersCount: revenueAgg._count,
      },
      recentEvents,
      weeklySales,
    };
  }

  // 5 most recent events with their own ticket/revenue breakdown — two
  // grouped queries (ticket types already joined, revenue via groupBy),
  // never one query per event.
  private async getRecentEventsBreakdown(organizationId: string) {
    const events = await this.prisma.event.findMany({
      where: { organizationId },
      orderBy: { startAt: 'desc' },
      take: 5,
      include: { ticketTypes: { select: { quantityTotal: true, quantitySold: true } } },
    });
    if (events.length === 0) return [];

    const revenueByEvent = await this.prisma.order.groupBy({
      by: ['eventId'],
      where: { eventId: { in: events.map((event) => event.id) }, status: OrderStatus.PAID },
      _sum: { subtotalAmount: true },
    });
    const revenueMap = new Map(revenueByEvent.map((row) => [row.eventId, Number(row._sum.subtotalAmount ?? 0)]));

    return events.map((event) => ({
      id: event.id,
      name: event.name,
      slug: event.slug,
      status: event.status,
      startAt: event.startAt,
      venueName: event.venueName,
      ticketsSold: event.ticketTypes.reduce((sum, tt) => sum + tt.quantitySold, 0),
      ticketsTotal: event.ticketTypes.reduce((sum, tt) => sum + tt.quantityTotal, 0),
      revenue: revenueMap.get(event.id) ?? 0,
    }));
  }

  // Orders count per day, last 7 days (today included), bucketed in JS
  // rather than a raw DATE_TRUNC query — the order volume this needs to
  // handle at MVP scale is small enough that this stays simple and correct;
  // revisit with a grouped SQL query if that stops being true.
  private async getWeeklySales(organizationId: string) {
    const now = new Date();
    const bucketStarts: Date[] = [];
    for (let i = 6; i >= 0; i--) {
      bucketStarts.push(new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - i)));
    }

    const paidOrders = await this.prisma.order.findMany({
      where: { event: { organizationId }, status: OrderStatus.PAID, updatedAt: { gte: bucketStarts[0] } },
      select: { updatedAt: true },
    });

    return bucketStarts.map((bucketStart) => {
      const bucketEnd = new Date(bucketStart.getTime() + 24 * 60 * 60 * 1000);
      const ordersCount = paidOrders.filter((o) => o.updatedAt >= bucketStart && o.updatedAt < bucketEnd).length;
      return { date: bucketStart.toISOString().slice(0, 10), ordersCount };
    });
  }

  // Platform-wide equivalent of getOrganizationStats' revenue aggregate —
  // same query, just without the organizationId filter. Backs the Super
  // Admin "Finances plateforme" overview (docs/SPEC.md §10.4).
  async getPlatformStats() {
    const revenueAgg = await this.prisma.order.aggregate({
      where: { status: OrderStatus.PAID },
      _sum: { subtotalAmount: true, serviceFeeAmount: true, totalAmount: true },
      _count: true,
    });

    return {
      gmv: Number(revenueAgg._sum.totalAmount ?? 0),
      organizerRevenue: Number(revenueAgg._sum.subtotalAmount ?? 0),
      platformCommission: Number(revenueAgg._sum.serviceFeeAmount ?? 0),
      currency: 'XOF',
      paidOrdersCount: revenueAgg._count,
    };
  }

  async exportEventOrdersCsv(organizationId: string, eventId: string): Promise<string> {
    await this.eventsService.findOneForOrganization(organizationId, eventId);
    const orders = await this.prisma.order.findMany({ where: { eventId }, orderBy: { createdAt: 'asc' } });

    const header = [
      'id',
      'status',
      'buyerEmail',
      'subtotalAmount',
      'serviceFeeAmount',
      'totalAmount',
      'currency',
      'createdAt',
    ];
    const rows = orders.map((order) => [
      order.id,
      order.status,
      order.buyerEmail,
      order.subtotalAmount.toString(),
      order.serviceFeeAmount.toString(),
      order.totalAmount.toString(),
      order.currency,
      order.createdAt.toISOString(),
    ]);

    return [header, ...rows].map((row) => row.map(escapeCsvField).join(',')).join('\n');
  }
}

function escapeCsvField(value: string): string {
  if (/[",\n]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}
