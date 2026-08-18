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
    });
  }
}
