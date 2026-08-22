import { Module } from '@nestjs/common';
import { EventCategoriesController } from './event-categories.controller';
import { EventCategoriesService } from './event-categories.service';

@Module({
  controllers: [EventCategoriesController],
  providers: [EventCategoriesService],
  exports: [EventCategoriesService],
})
export class EventCategoriesModule {}
