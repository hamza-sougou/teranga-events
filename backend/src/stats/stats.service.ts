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
    const [eventGroups, revenueAgg] = await Promise.all([
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
    ]);

    const eventsByStatus = Object.fromEntries(
      Object.values(EventStatus).map((status) => [status, 0]),
    ) as Record<EventStatus, number>;
    let totalEvents = 0;
    for (const group of eventGroups) {
      eventsByStatus[group.status] = group._count._all;
      totalEvents += group._count._all;
    }

    return {
      totalEvents,
      eventsByStatus,
      revenue: {
        grossRevenue: Number(revenueAgg._sum.totalAmount ?? 0),
        organizerRevenue: Number(revenueAgg._sum.subtotalAmount ?? 0),
        platformCommission: Number(revenueAgg._sum.serviceFeeAmount ?? 0),
        currency: 'XOF',
        paidOrdersCount: revenueAgg._count,
      },
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
