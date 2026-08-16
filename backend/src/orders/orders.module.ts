import { Module } from '@nestjs/common';
import { OrdersController } from './orders.controller';
import { OrdersService } from './orders.service';
import { OrdersExpirationJob } from './orders-expiration.job';

@Module({
  controllers: [OrdersController],
  providers: [OrdersService, OrdersExpirationJob],
  exports: [OrdersService],
})
export class OrdersModule {}
