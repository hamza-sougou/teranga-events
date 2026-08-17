import { Controller, Get, Param } from '@nestjs/common';
import { EventsService } from './events.service';

@Controller('events')
export class PublicEventsController {
  constructor(private readonly eventsService: EventsService) {}

  @Get(':slug')
  findPublicBySlug(@Param('slug') slug: string) {
    return this.eventsService.findPublicBySlug(slug);
  }
}
