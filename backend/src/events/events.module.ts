import { Module } from '@nestjs/common';
import { EventsController } from './events.controller';
import { PublicEventsController } from './public-events.controller';
import { EventsService } from './events.service';

@Module({
  controllers: [EventsController, PublicEventsController],
  providers: [EventsService],
  exports: [EventsService],
})
export class EventsModule {}
