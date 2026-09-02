import { Injectable, Logger } from '@nestjs/common';
import { EventStatus, OrderStatus, Payout, PayoutStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { PaydunyaProvider } from '../payments/providers/paydunya.provider';
import { calculatePayoutAmount } from '../payments/pricing/payout-amount';

// Post-event organizer payout — see docs/SPEC.md §6 and
// docs/MODULE_PAIEMENT_SPEC.md §6. Never triggered in real time or on a
// fixed schedule: only once an event has actually ended.
@Injectable()
export class PayoutsService {
  private readonly logger = new Logger(PayoutsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly paydunyaProvider: PaydunyaProvider,
  ) {}

  async runDueEventPayouts() {
    const eligibleEvents = await this.prisma.event.findMany({
      where: {
        endAt: { lt: new Date() },
        status: { not: EventStatus.CANCELLED },
        organization: { suspendedAt: null },
        OR: [{ payout: { is: null } }, { payout: { is: { status: PayoutStatus.FAILED } } }],
      },
      select: { id: true },
    });

    const results = [];
    for (const event of eligibleEvents) {
      results.push(await this.runPayoutForEvent(event.id));
    }
    return results;
  }

  async runPayoutForEvent(eventId: string) {
    const event = await this.prisma.event.findUniqueOrThrow({
      where: { id: eventId },
      include: { organization: true, payout: true },
    });

    if (event.status === EventStatus.CANCELLED) {
      return { eventId, skipped: 'event cancelled' };
    }
    if (event.organization.suspendedAt) {
      return { eventId, skipped: 'organization suspended' };
    }
    if (event.endAt > new Date()) {
      return { eventId, skipped: 'event has not ended yet' };
    }
    if (event.payout && event.payout.status !== PayoutStatus.FAILED) {
      return { eventId, skipped: `payout already ${event.payout.status.toLowerCase()}` };
    }

    const aggregate = await this.prisma.order.aggregate({
      where: { eventId, status: OrderStatus.PAID },
      _sum: { subtotalAmount: true },
    });
    const amountDue = Number(aggregate._sum.subtotalAmount ?? 0);
    if (amountDue <= 0) {
      return { eventId, skipped: 'nothing due' };
    }

    let payout: Payout;
    try {
      payout = event.payout
        ? await this.prisma.payout.update({
            where: { id: event.payout.id },
            data: { amountDue, status: PayoutStatus.PROCESSING },
          })
        : await this.prisma.payout.create({
            data: {
              organizationId: event.organizationId,
              eventId: event.id,
              amountDue,
              status: PayoutStatus.PROCESSING,
            },
          });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        // Lost a concurrent race to create the payout row for this event —
        // UNIQUE(event_id) backstop, same defense-in-depth pattern as
        // anti-oversell (db/schema.sql section 8B).
        return { eventId, skipped: 'payout already created concurrently' };
      }
      throw error;
    }

    if (!event.organization.payoutPhoneNumber) {
      await this.prisma.payout.update({
        where: { id: payout.id },
        data: { status: PayoutStatus.FAILED, rawResponse: { error: 'missing payout_phone_number' } },
      });
      return { eventId, failed: 'missing payout_phone_number' };
    }

    const disbursementAmount = calculatePayoutAmount(amountDue);

    try {
      const result = await this.paydunyaProvider.disburse(event.organization.payoutPhoneNumber, disbursementAmount);
      await this.prisma.payout.update({
        where: { id: payout.id },
        data: {
          status: PayoutStatus.PAID,
          amountPaid: amountDue,
          providerTransactionId: result.transactionId,
          rawResponse: JSON.parse(JSON.stringify(result)),
          triggeredAt: new Date(),
        },
      });
      return { eventId, paid: amountDue };
    } catch (error) {
      const message = (error as Error).message;
      this.logger.error(`Payout failed for event ${eventId}: ${message}`);
      await this.prisma.payout.update({
        where: { id: payout.id },
        data: {
          status: PayoutStatus.FAILED,
          rawResponse: { error: message },
          triggeredAt: new Date(),
        },
      });
      return { eventId, failed: message };
    }
  }

  findAllForOrganization(organizationId: string) {
    return this.prisma.payout.findMany({
      where: { organizationId },
      orderBy: { createdAt: 'desc' },
      include: { event: { select: { id: true, name: true } } },
    });
  }

  // Read-only overview for the organizer-facing "Reversements" page — one row
  // per event with >=1 paid order, including events with no `payouts` row yet
  // (not ended, or ended but not yet picked up by the nightly job). Additive:
  // findAllForOrganization above stays untouched, it already backs the
  // dashboard's payouts panel with a different response shape.
  async getOverviewForOrganization(organizationId: string) {
    const events = await this.prisma.event.findMany({
      where: { organizationId, orders: { some: { status: OrderStatus.PAID } } },
      select: { id: true, name: true, endAt: true, payout: true },
      orderBy: { endAt: 'desc' },
    });
    if (events.length === 0) return [];

    const eventsWithoutPayout = events.filter((event) => !event.payout).map((event) => event.id);
    const liveDue = eventsWithoutPayout.length
      ? await this.prisma.order.groupBy({
          by: ['eventId'],
          where: { eventId: { in: eventsWithoutPayout }, status: OrderStatus.PAID },
          _sum: { subtotalAmount: true },
        })
      : [];
    const liveDueMap = new Map(liveDue.map((row) => [row.eventId, Number(row._sum.subtotalAmount ?? 0)]));

    return events.map((event) => ({
      eventId: event.id,
      eventName: event.name,
      eventEndAt: event.endAt,
      amountDue: event.payout ? Number(event.payout.amountDue) : (liveDueMap.get(event.id) ?? 0),
      payoutStatus: event.payout?.status ?? null,
      amountPaid: event.payout?.amountPaid !== undefined && event.payout?.amountPaid !== null
        ? Number(event.payout.amountPaid)
        : null,
      triggeredAt: event.payout?.triggeredAt ?? null,
    }));
  }

  // Platform-wide equivalent of getOverviewForOrganization above, for the
  // Super Admin "Finances plateforme" overview (docs/SPEC.md §10.4) — same
  // "live due" reasoning for events that ended but have no payouts row yet,
  // generalized without an organizationId filter, plus the FAILED list the
  // spec calls out ("suivi des reversements en échec nécessitant une
  // attention" — the retry job exists, no view surfaced these before).
  async getPlatformOverview() {
    const [paidAgg, pendingAgg, failedPayouts, endedEventsWithoutPayout] = await Promise.all([
      this.prisma.payout.aggregate({
        where: { status: PayoutStatus.PAID },
        _sum: { amountPaid: true },
      }),
      this.prisma.payout.aggregate({
        where: { status: { in: [PayoutStatus.PENDING, PayoutStatus.PROCESSING] } },
        _sum: { amountDue: true },
      }),
      this.prisma.payout.findMany({
        where: { status: PayoutStatus.FAILED },
        orderBy: { triggeredAt: 'desc' },
        include: { event: { select: { id: true, name: true } }, organization: { select: { id: true, name: true } } },
      }),
      this.prisma.event.findMany({
        where: {
          endAt: { lt: new Date() },
          status: { not: EventStatus.CANCELLED },
          payout: { is: null },
          orders: { some: { status: OrderStatus.PAID } },
        },
        select: { id: true },
      }),
    ]);

    const liveDue = endedEventsWithoutPayout.length
      ? await this.prisma.order.aggregate({
          where: { eventId: { in: endedEventsWithoutPayout.map((event) => event.id) }, status: OrderStatus.PAID },
          _sum: { subtotalAmount: true },
        })
      : null;

    return {
      totalPaidOut: Number(paidAgg._sum.amountPaid ?? 0),
      totalPending: Number(pendingAgg._sum.amountDue ?? 0) + Number(liveDue?._sum.subtotalAmount ?? 0),
      failedPayouts: failedPayouts.map((payout) => ({
        eventId: payout.eventId,
        eventName: payout.event.name,
        organizationId: payout.organizationId,
        organizationName: payout.organization.name,
        amountDue: Number(payout.amountDue),
        errorMessage: (payout.rawResponse as { error?: string } | null)?.error ?? null,
        triggeredAt: payout.triggeredAt,
      })),
    };
  }
}
