import { Controller, Get } from '@nestjs/common';
import { EventCategoriesService } from './event-categories.service';

// No guards — non-sensitive reference data needed to populate a dropdown,
// same public/no-auth pattern as PublicEventsController.
@Controller('event-categories')
export class EventCategoriesController {
  constructor(private readonly eventCategoriesService: EventCategoriesService) {}

  @Get()
  findAll() {
    return this.eventCategoriesService.findAllActive();
  }
}
