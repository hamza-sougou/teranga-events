import { Body, Controller, Get, HttpCode, Param, Post, UseGuards } from '@nestjs/common';
import { MemberRole } from '@prisma/client';
import { ScanService } from './scan.service';
import { ScanTicketDto } from './dto/scan-ticket.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { OrganizationRolesGuard } from '../common/guards/organization-roles.guard';
import { ALL_MEMBER_ROLES, OrgRoles } from '../common/decorators/org-roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AuthenticatedUser } from '../auth/strategies/jwt.strategy';

const SCAN_ROLES = [MemberRole.OWNER, MemberRole.CO_ORGANIZER, MemberRole.CONTROLLER];

@Controller('organizations/:organizationId/events/:eventId')
@UseGuards(JwtAuthGuard, OrganizationRolesGuard)
export class ScanController {
  constructor(private readonly scanService: ScanService) {}

  @Post('scan')
  @HttpCode(200)
  @OrgRoles(...SCAN_ROLES)
  scan(
    @Param('organizationId') organizationId: string,
    @Param('eventId') eventId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: ScanTicketDto,
  ) {
    return this.scanService.scanTicket(organizationId, eventId, user.id, dto);
  }

  @Get('scans')
  @OrgRoles(...ALL_MEMBER_ROLES)
  findAll(@Param('organizationId') organizationId: string, @Param('eventId') eventId: string) {
    return this.scanService.findAllForEvent(organizationId, eventId);
  }
}
