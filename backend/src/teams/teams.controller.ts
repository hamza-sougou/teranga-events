import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { MemberRole } from '@prisma/client';
import { TeamsService } from './teams.service';
import { InviteMemberDto } from './dto/invite-member.dto';
import { UpdateMemberDto } from './dto/update-member.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { OrganizationRolesGuard } from '../common/guards/organization-roles.guard';
import { ALL_MEMBER_ROLES, OrgRoles } from '../common/decorators/org-roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AuthenticatedUser } from '../auth/strategies/jwt.strategy';

const MANAGE_ROLES = [MemberRole.OWNER, MemberRole.CO_ORGANIZER];

@Controller('organizations/:organizationId/members')
@UseGuards(JwtAuthGuard, OrganizationRolesGuard)
export class TeamsController {
  constructor(private readonly teamsService: TeamsService) {}

  @Get()
  @OrgRoles(...ALL_MEMBER_ROLES)
  findAll(@Param('organizationId') organizationId: string) {
    return this.teamsService.findAllForOrganization(organizationId);
  }

  @Post()
  @OrgRoles(...MANAGE_ROLES)
  invite(
    @Param('organizationId') organizationId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: InviteMemberDto,
  ) {
    return this.teamsService.invite(organizationId, user.id, dto);
  }

  @Patch(':memberId')
  @OrgRoles(...MANAGE_ROLES)
  update(
    @Param('organizationId') organizationId: string,
    @Param('memberId') memberId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: UpdateMemberDto,
  ) {
    return this.teamsService.update(organizationId, memberId, dto, user.id);
  }

  @Delete(':memberId')
  @OrgRoles(...MANAGE_ROLES)
  remove(@Param('organizationId') organizationId: string, @Param('memberId') memberId: string) {
    return this.teamsService.remove(organizationId, memberId);
  }
}
