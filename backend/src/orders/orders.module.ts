import { Module } from '@nestjs/common';
import { OrdersController } from './orders.controller';
import { OrganizerOrdersController } from './organizer-orders.controller';
import { OrdersService } from './orders.service';
import { OrdersExpirationJob } from './orders-expiration.job';
import { PaymentsModule } from '../payments/payments.module';
import { TicketsModule } from '../tickets/tickets.module';

@Module({
  imports: [PaymentsModule, TicketsModule],
  controllers: [OrdersController, OrganizerOrdersController],
  providers: [OrdersService, OrdersExpirationJob],
  exports: [OrdersService],
})
export class OrdersModule {}
