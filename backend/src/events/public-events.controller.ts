import { Controller, Get, Param, Query } from '@nestjs/common';
import { EventsService } from './events.service';
import { PublicEventsQueryDto } from './dto/public-events-query.dto';

@Controller('events')
export class PublicEventsController {
  constructor(private readonly eventsService: EventsService) {}

  // Declared before ':slug' — Nest matches routes in declaration order, and
  // this is the unambiguous convention for a static-vs-param route pair.
  @Get()
  findPublicList(@Query() query: PublicEventsQueryDto) {
    return this.eventsService.findPublicList(query);
  }

  @Get(':slug')
  findPublicBySlug(@Param('slug') slug: string) {
    return this.eventsService.findPublicBySlug(slug);
  }
}
