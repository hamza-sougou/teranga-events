import { Controller, Get, Param, UseGuards } from '@nestjs/common';
import { OrdersService } from './orders.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { OrganizationRolesGuard } from '../common/guards/organization-roles.guard';
import { ALL_MEMBER_ROLES, OrgRoles } from '../common/decorators/org-roles.decorator';

@Controller('organizations/:organizationId/events/:eventId/orders')
@UseGuards(JwtAuthGuard, OrganizationRolesGuard)
export class OrganizerOrdersController {
  constructor(private readonly ordersService: OrdersService) {}

  @Get()
  @OrgRoles(...ALL_MEMBER_ROLES)
  findAllForEvent(@Param('organizationId') organizationId: string, @Param('eventId') eventId: string) {
    return this.ordersService.findAllForEvent(organizationId, eventId);
  }
}
