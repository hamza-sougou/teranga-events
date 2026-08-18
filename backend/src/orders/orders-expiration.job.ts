import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { OrderStatus, TicketStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class OrdersExpirationJob {
  private readonly logger = new Logger(OrdersExpirationJob.name);

  constructor(private readonly prisma: PrismaService) {}

  @Cron(CronExpression.EVERY_MINUTE)
  async cancelExpiredOrders() {
    const expired = await this.prisma.order.findMany({
      where: { status: OrderStatus.PENDING, expiresAt: { lt: new Date() } },
      select: { id: true },
    });
    if (expired.length === 0) return;

    const expiredIds = expired.map((order) => order.id);

    await this.prisma.order.updateMany({
      where: { id: { in: expiredIds } },
      data: { status: OrderStatus.EXPIRED },
    });

    // Triggers fn_release_ticket_capacity for each affected row (db/schema.sql
    // section 13), releasing quota back to other buyers.
    await this.prisma.ticket.updateMany({
      where: { status: TicketStatus.PENDING_PAYMENT, orderItem: { orderId: { in: expiredIds } } },
      data: { status: TicketStatus.CANCELLED },
    });

    this.logger.log(`Expired ${expiredIds.length} order(s)`);
  }
}
