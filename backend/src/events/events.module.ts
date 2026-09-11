import { Module } from '@nestjs/common';
import { EventsController } from './events.controller';
import { PublicEventsController } from './public-events.controller';
import { AdminEventsController } from './admin-events.controller';
import { EventsService } from './events.service';
import { NotificationsModule } from '../notifications/notifications.module';
import { PaymentsModule } from '../payments/payments.module';

@Module({
  imports: [NotificationsModule, PaymentsModule],
  controllers: [EventsController, PublicEventsController, AdminEventsController],
  providers: [EventsService],
  exports: [EventsService],
})
export class EventsModule {}
