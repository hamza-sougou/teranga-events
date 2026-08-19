import { Controller, Get, Header, Param, UseGuards } from '@nestjs/common';
import { StatsService } from './stats.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { OrganizationRolesGuard } from '../common/guards/organization-roles.guard';
import { ALL_MEMBER_ROLES, OrgRoles } from '../common/decorators/org-roles.decorator';

@Controller('organizations/:organizationId')
@UseGuards(JwtAuthGuard, OrganizationRolesGuard)
export class StatsController {
  constructor(private readonly statsService: StatsService) {}

  @Get('stats')
  @OrgRoles(...ALL_MEMBER_ROLES)
  getOrganizationStats(@Param('organizationId') organizationId: string) {
    return this.statsService.getOrganizationStats(organizationId);
  }

  @Get('events/:eventId/stats')
  @OrgRoles(...ALL_MEMBER_ROLES)
  getEventStats(@Param('organizationId') organizationId: string, @Param('eventId') eventId: string) {
    return this.statsService.getEventStats(organizationId, eventId);
  }

  @Get('events/:eventId/orders/export')
  @OrgRoles(...ALL_MEMBER_ROLES)
  @Header('Content-Type', 'text/csv')
  @Header('Content-Disposition', 'attachment; filename="orders.csv"')
  exportOrders(@Param('organizationId') organizationId: string, @Param('eventId') eventId: string) {
    return this.statsService.exportEventOrdersCsv(organizationId, eventId);
  }
}
