import { Body, Controller, Get, Param, Patch, Query, UseGuards } from '@nestjs/common';
import { EventsService } from './events.service';
import { AdminEventsQueryDto } from './dto/admin-events-query.dto';
import { AdminCancelEventDto } from './dto/admin-cancel-event.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { SuperAdminGuard } from '../common/guards/super-admin.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AuthenticatedUser } from '../auth/strategies/jwt.strategy';

// Platform-wide moderation view (docs/SPEC.md §10.3) — cross-organization,
// unlike EventsController which is scoped under /organizations/:organizationId.
@Controller('admin/events')
@UseGuards(JwtAuthGuard, SuperAdminGuard)
export class AdminEventsController {
  constructor(private readonly eventsService: EventsService) {}

  @Get()
  findAll(@Query() query: AdminEventsQueryDto) {
    return this.eventsService.findAllForSuperAdmin(query);
  }

  @Patch(':eventId/cancel')
  cancel(
    @Param('eventId') eventId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: AdminCancelEventDto,
  ) {
    return this.eventsService.adminCancel(eventId, user.id, dto.reason);
  }
}
