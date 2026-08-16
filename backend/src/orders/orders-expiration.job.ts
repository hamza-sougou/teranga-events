import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class OrdersExpirationJob {
  private readonly logger = new Logger(OrdersExpirationJob.name);

  constructor(private readonly prisma: PrismaService) {}

  @Cron(CronExpression.EVERY_MINUTE)
  async cancelExpiredOrders() {
    // Cancelling pending_payment orders past expires_at releases quota via
    // fn_release_ticket_capacity — implemented alongside the orders module.
  }
}
