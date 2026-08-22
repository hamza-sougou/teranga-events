import { Body, Controller, Delete, Get, Param, Post, UseGuards } from '@nestjs/common';
import { MemberRole } from '@prisma/client';
import { EventMediaService } from './event-media.service';
import { PresignEventMediaDto } from './dto/presign-event-media.dto';
import { ConfirmEventMediaDto } from './dto/confirm-event-media.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { OrganizationRolesGuard } from '../common/guards/organization-roles.guard';
import { ALL_MEMBER_ROLES, OrgRoles } from '../common/decorators/org-roles.decorator';

const MANAGE_ROLES = [MemberRole.OWNER, MemberRole.CO_ORGANIZER];

@Controller('organizations/:organizationId/events/:eventId/media')
@UseGuards(JwtAuthGuard, OrganizationRolesGuard)
export class EventMediaController {
  constructor(private readonly eventMediaService: EventMediaService) {}

  @Post('presign')
  @OrgRoles(...MANAGE_ROLES)
  presign(
    @Param('organizationId') organizationId: string,
    @Param('eventId') eventId: string,
    @Body() dto: PresignEventMediaDto,
  ) {
    return this.eventMediaService.presign(organizationId, eventId, dto);
  }

  @Post('confirm')
  @OrgRoles(...MANAGE_ROLES)
  confirm(
    @Param('organizationId') organizationId: string,
    @Param('eventId') eventId: string,
    @Body() dto: ConfirmEventMediaDto,
  ) {
    return this.eventMediaService.confirm(organizationId, eventId, dto);
  }

  @Get()
  @OrgRoles(...ALL_MEMBER_ROLES)
  findAll(@Param('organizationId') organizationId: string, @Param('eventId') eventId: string) {
    return this.eventMediaService.findAllForEvent(organizationId, eventId);
  }

  @Delete(':mediaId')
  @OrgRoles(...MANAGE_ROLES)
  remove(
    @Param('organizationId') organizationId: string,
    @Param('eventId') eventId: string,
    @Param('mediaId') mediaId: string,
  ) {
    return this.eventMediaService.remove(organizationId, eventId, mediaId);
  }
}
