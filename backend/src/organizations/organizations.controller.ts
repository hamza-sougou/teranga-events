import { Body, Controller, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { MemberRole } from '@prisma/client';
import { OrganizationsService } from './organizations.service';
import { UpdateOrganizationDto } from './dto/update-organization.dto';
import { UpdatePayoutMethodDto } from './dto/update-payout-method.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { OrganizationRolesGuard } from '../common/guards/organization-roles.guard';
import { ALL_MEMBER_ROLES, OrgRoles } from '../common/decorators/org-roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AuthenticatedUser } from '../auth/strategies/jwt.strategy';

const MANAGE_ROLES = [MemberRole.OWNER, MemberRole.CO_ORGANIZER];

// payout_phone_number is the real destination of the organization's money at
// payout time (PayDunya Déboursement) — kept out of MANAGE_ROLES on purpose
// and restricted to OWNER only, unlike the rest of the profile.
const MANAGE_PAYOUT_METHOD_ROLES = [MemberRole.OWNER];

// Collection-level route (no :organizationId — there is no organization to
// scope a role check against yet), kept separate from OrganizationsController
// below on purpose: that controller's class-level OrganizationRolesGuard
// expects an :organizationId route param on every route it guards.
@Controller('organizations')
@UseGuards(JwtAuthGuard)
export class OrganizationsCollectionController {
  constructor(private readonly organizationsService: OrganizationsService) {}

  // Point C (phone-auth step 2/5, PROGRESS.md): an already-authenticated
  // user (e.g. invited elsewhere as CONTROLLER) creates and owns a new
  // organization, without going through /auth/register — which would fail
  // on their already-used email/phone.
  @Post()
  create(@CurrentUser() user: AuthenticatedUser) {
    return this.organizationsService.createForUser(user.id);
  }
}

@Controller('organizations/:organizationId')
@UseGuards(JwtAuthGuard, OrganizationRolesGuard)
export class OrganizationsController {
  constructor(private readonly organizationsService: OrganizationsService) {}

  @Get()
  @OrgRoles(...ALL_MEMBER_ROLES)
  findOne(@Param('organizationId') organizationId: string) {
    return this.organizationsService.findOne(organizationId);
  }

  @Patch()
  @OrgRoles(...MANAGE_ROLES)
  updateProfile(@Param('organizationId') organizationId: string, @Body() dto: UpdateOrganizationDto) {
    return this.organizationsService.updateProfile(organizationId, dto);
  }

  @Patch('payout-method')
  @OrgRoles(...MANAGE_PAYOUT_METHOD_ROLES)
  updatePayoutMethod(@Param('organizationId') organizationId: string, @Body() dto: UpdatePayoutMethodDto) {
    return this.organizationsService.updatePayoutMethod(organizationId, dto.payoutPhoneNumber);
  }
}
