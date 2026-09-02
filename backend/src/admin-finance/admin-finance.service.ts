import { Injectable } from '@nestjs/common';
import { OrderStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { StatsService } from '../stats/stats.service';
import { PayoutsService } from '../payouts/payouts.service';

const GROWTH_MONTHS = 6;

// Super Admin "Finances plateforme" overview (docs/SPEC.md §10.4) — composes
// StatsService/PayoutsService's existing aggregation logic (never duplicated)
// plus a platform-wide growth trend that doesn't exist anywhere else yet.
@Injectable()
export class AdminFinanceService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly statsService: StatsService,
    private readonly payoutsService: PayoutsService,
  ) {}

  async getOverview() {
    const [stats, payouts, growth] = await Promise.all([
      this.statsService.getPlatformStats(),
      this.payoutsService.getPlatformOverview(),
      this.getGrowth(),
    ]);

    return { ...stats, payouts, growth };
  }

  // Monthly buckets, last GROWTH_MONTHS months (current month included) —
  // same JS-bucketing approach as StatsService.getWeeklySales (fetch rows
  // with just their createdAt, bucket in memory), just a coarser grain. No
  // raw SQL, no new table.
  private async getGrowth() {
    const now = new Date();
    const bucketStarts: Date[] = [];
    for (let i = GROWTH_MONTHS - 1; i >= 0; i--) {
      bucketStarts.push(new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1)));
    }
    const rangeStart = bucketStarts[0];

    const [organizations, events, tickets] = await Promise.all([
      this.prisma.organization.findMany({
        where: { createdAt: { gte: rangeStart } },
        select: { createdAt: true },
      }),
      this.prisma.event.findMany({
        where: { createdAt: { gte: rangeStart } },
        select: { createdAt: true },
      }),
      this.prisma.ticket.findMany({
        where: { orderItem: { order: { status: OrderStatus.PAID, createdAt: { gte: rangeStart } } } },
        select: { createdAt: true },
      }),
    ]);

    return bucketStarts.map((bucketStart, index) => {
      const bucketEnd =
        index + 1 < bucketStarts.length
          ? bucketStarts[index + 1]
          : new Date(Date.UTC(bucketStart.getUTCFullYear(), bucketStart.getUTCMonth() + 1, 1));
      const inBucket = (date: Date) => date >= bucketStart && date < bucketEnd;

      return {
        month: bucketStart.toISOString().slice(0, 7),
        newOrganizations: organizations.filter((o) => inBucket(o.createdAt)).length,
        newEvents: events.filter((e) => inBucket(e.createdAt)).length,
        ticketsSold: tickets.filter((t) => inBucket(t.createdAt)).length,
      };
    });
  }
}
