import { Module } from '@nestjs/common';
import { TicketTypesController } from './ticket-types.controller';
import { PublicTicketTypesController } from './public-ticket-types.controller';
import { TicketTypesService } from './ticket-types.service';
import { EventsModule } from '../events/events.module';
import { PaymentsModule } from '../payments/payments.module';

@Module({
  imports: [EventsModule, PaymentsModule],
  controllers: [TicketTypesController, PublicTicketTypesController],
  providers: [TicketTypesService],
  exports: [TicketTypesService],
})
export class TicketTypesModule {}
