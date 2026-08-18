import { Controller, Get, Param, UseGuards } from '@nestjs/common';
import { MemberRole } from '@prisma/client';
import { PayoutsService } from './payouts.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { OrganizationRolesGuard } from '../common/guards/organization-roles.guard';
import { OrgRoles } from '../common/decorators/org-roles.decorator';

const VIEW_ROLES = [MemberRole.OWNER, MemberRole.CO_ORGANIZER, MemberRole.ACCOUNTANT];

@Controller('organizations/:organizationId/payouts')
@UseGuards(JwtAuthGuard, OrganizationRolesGuard)
export class PayoutsController {
  constructor(private readonly payoutsService: PayoutsService) {}

  @Get()
  @OrgRoles(...VIEW_ROLES)
  findAllForOrganization(@Param('organizationId') organizationId: string) {
    return this.payoutsService.findAllForOrganization(organizationId);
  }
}
