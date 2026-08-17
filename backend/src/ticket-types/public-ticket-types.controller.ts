import { Controller, Get, Param } from '@nestjs/common';
import { TicketTypesService } from './ticket-types.service';

@Controller('events/:slug/ticket-types')
export class PublicTicketTypesController {
  constructor(private readonly ticketTypesService: TicketTypesService) {}

  @Get()
  findPublicForEvent(@Param('slug') slug: string) {
    return this.ticketTypesService.findPublicForEvent(slug);
  }
}
