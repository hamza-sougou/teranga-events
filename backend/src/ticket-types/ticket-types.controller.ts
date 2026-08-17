import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { MemberRole } from '@prisma/client';
import { TicketTypesService } from './ticket-types.service';
import { CreateTicketTypeDto } from './dto/create-ticket-type.dto';
import { UpdateTicketTypeDto } from './dto/update-ticket-type.dto';
import { AddWhitelistEntriesDto } from './dto/add-whitelist-entries.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { OrganizationRolesGuard } from '../common/guards/organization-roles.guard';
import { ALL_MEMBER_ROLES, OrgRoles } from '../common/decorators/org-roles.decorator';

const MANAGE_ROLES = [MemberRole.OWNER, MemberRole.CO_ORGANIZER];

@Controller('organizations/:organizationId/events/:eventId/ticket-types')
@UseGuards(JwtAuthGuard, OrganizationRolesGuard)
export class TicketTypesController {
  constructor(private readonly ticketTypesService: TicketTypesService) {}

  @Post()
  @OrgRoles(...MANAGE_ROLES)
  create(
    @Param('organizationId') organizationId: string,
    @Param('eventId') eventId: string,
    @Body() dto: CreateTicketTypeDto,
  ) {
    return this.ticketTypesService.create(organizationId, eventId, dto);
  }

  @Get()
  @OrgRoles(...ALL_MEMBER_ROLES)
  findAll(@Param('organizationId') organizationId: string, @Param('eventId') eventId: string) {
    return this.ticketTypesService.findAllForEvent(organizationId, eventId);
  }

  @Get(':ticketTypeId')
  @OrgRoles(...ALL_MEMBER_ROLES)
  findOne(
    @Param('organizationId') organizationId: string,
    @Param('eventId') eventId: string,
    @Param('ticketTypeId') ticketTypeId: string,
  ) {
    return this.ticketTypesService.findOneForEvent(organizationId, eventId, ticketTypeId);
  }

  @Patch(':ticketTypeId')
  @OrgRoles(...MANAGE_ROLES)
  update(
    @Param('organizationId') organizationId: string,
    @Param('eventId') eventId: string,
    @Param('ticketTypeId') ticketTypeId: string,
    @Body() dto: UpdateTicketTypeDto,
  ) {
    return this.ticketTypesService.update(organizationId, eventId, ticketTypeId, dto);
  }

  @Get(':ticketTypeId/whitelist')
  @OrgRoles(...MANAGE_ROLES)
  listWhitelist(
    @Param('organizationId') organizationId: string,
    @Param('eventId') eventId: string,
    @Param('ticketTypeId') ticketTypeId: string,
  ) {
    return this.ticketTypesService.listWhitelist(organizationId, eventId, ticketTypeId);
  }

  @Post(':ticketTypeId/whitelist')
  @OrgRoles(...MANAGE_ROLES)
  addWhitelistEntries(
    @Param('organizationId') organizationId: string,
    @Param('eventId') eventId: string,
    @Param('ticketTypeId') ticketTypeId: string,
    @Body() dto: AddWhitelistEntriesDto,
  ) {
    return this.ticketTypesService.addWhitelistEntries(organizationId, eventId, ticketTypeId, dto);
  }

  @Delete(':ticketTypeId/whitelist/:email')
  @OrgRoles(...MANAGE_ROLES)
  removeWhitelistEntry(
    @Param('organizationId') organizationId: string,
    @Param('eventId') eventId: string,
    @Param('ticketTypeId') ticketTypeId: string,
    @Param('email') email: string,
  ) {
    return this.ticketTypesService.removeWhitelistEntry(organizationId, eventId, ticketTypeId, email);
  }
}
