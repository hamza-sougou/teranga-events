import { Body, Controller, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { MemberRole } from '@prisma/client';
import { EventsService } from './events.service';
import { CreateEventDto } from './dto/create-event.dto';
import { UpdateEventDto } from './dto/update-event.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { OrganizationRolesGuard } from '../common/guards/organization-roles.guard';
import { ALL_MEMBER_ROLES, OrgRoles } from '../common/decorators/org-roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AuthenticatedUser } from '../auth/strategies/jwt.strategy';

const MANAGE_ROLES = [MemberRole.OWNER, MemberRole.CO_ORGANIZER];

@Controller('organizations/:organizationId/events')
@UseGuards(JwtAuthGuard, OrganizationRolesGuard)
export class EventsController {
  constructor(private readonly eventsService: EventsService) {}

  @Post()
  @OrgRoles(...MANAGE_ROLES)
  create(
    @Param('organizationId') organizationId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateEventDto,
  ) {
    return this.eventsService.create(organizationId, user.id, dto);
  }

  @Get()
  @OrgRoles(...ALL_MEMBER_ROLES)
  findAll(@Param('organizationId') organizationId: string) {
    return this.eventsService.findAllForOrganization(organizationId);
  }

  @Get(':eventId')
  @OrgRoles(...ALL_MEMBER_ROLES)
  findOne(@Param('organizationId') organizationId: string, @Param('eventId') eventId: string) {
    return this.eventsService.findOneForOrganization(organizationId, eventId);
  }

  @Patch(':eventId')
  @OrgRoles(...MANAGE_ROLES)
  update(
    @Param('organizationId') organizationId: string,
    @Param('eventId') eventId: string,
    @Body() dto: UpdateEventDto,
  ) {
    return this.eventsService.update(organizationId, eventId, dto);
  }
}
