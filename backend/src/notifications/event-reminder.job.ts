import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { NotificationChannel, OrderStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

const REMINDER_WINDOW_MS = 24 * 60 * 60 * 1000;

// Creates event_reminder rows only — sending is NotificationsDispatchJob's
// job (single send codepath, no duplication). One reminder per paid order,
// once, in the [now, now+24h) window before the event starts.
@Injectable()
export class EventReminderJob {
  private readonly logger = new Logger(EventReminderJob.name);

  constructor(private readonly prisma: PrismaService) {}

  @Cron(CronExpression.EVERY_HOUR)
  async createDueReminders() {
    const now = new Date();
    const windowEnd = new Date(now.getTime() + REMINDER_WINDOW_MS);

    const dueOrders = await this.prisma.order.findMany({
      where: {
        status: OrderStatus.PAID,
        event: { startAt: { gte: now, lt: windowEnd } },
      },
    });

    let created = 0;
    for (const order of dueOrders) {
      const existing = await this.prisma.notification.findFirst({
        where: { orderId: order.id, type: 'event_reminder' },
      });
      if (existing) continue;

      await this.prisma.notification.create({
        data: {
          orderId: order.id,
          userId: order.buyerUserId,
          channel: NotificationChannel.EMAIL,
          type: 'event_reminder',
        },
      });
      created++;
    }

    if (created > 0) {
      this.logger.log(`Created ${created} event reminder notification(s)`);
    }
  }
}
