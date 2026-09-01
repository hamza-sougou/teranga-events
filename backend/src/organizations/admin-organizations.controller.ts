import { Body, Controller, Get, Param, Patch, UseGuards } from '@nestjs/common';
import { OrganizationsService } from './organizations.service';
import { UpdateVerificationDto } from './dto/update-verification.dto';
import { UpdateSuspensionDto } from './dto/update-suspension.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { SuperAdminGuard } from '../common/guards/super-admin.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AuthenticatedUser } from '../auth/strategies/jwt.strategy';

// Platform-wide view, not org-scoped — OrganizationRolesGuard doesn't apply
// here (a Super Admin has no organization_members row), same reasoning as
// AdminPayoutsController.
@Controller('admin/organizations')
@UseGuards(JwtAuthGuard, SuperAdminGuard)
export class AdminOrganizationsController {
  constructor(private readonly organizationsService: OrganizationsService) {}

  @Get()
  findAll() {
    return this.organizationsService.findAllForSuperAdmin();
  }

  @Patch(':organizationId/verification')
  setVerification(@Param('organizationId') organizationId: string, @Body() dto: UpdateVerificationDto) {
    return this.organizationsService.setVerification(organizationId, dto.isVerified);
  }

  @Patch(':organizationId/suspension')
  setSuspension(
    @Param('organizationId') organizationId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: UpdateSuspensionDto,
  ) {
    return this.organizationsService.setSuspension(organizationId, dto.suspended, user.id, dto.reason);
  }

  // Backs the admin "Voir l'équipe" panel — suspending/reactivating a
  // non-OWNER member reuses PATCH /organizations/:organizationId/members/:memberId
  // directly (TeamsController), already callable by a super admin.
  @Get(':organizationId/members')
  findMembers(@Param('organizationId') organizationId: string) {
    return this.organizationsService.findMembersForSuperAdmin(organizationId);
  }
}
