import { Body, Controller, Delete, Param, Post, UseGuards } from '@nestjs/common';
import { MemberRole } from '@prisma/client';
import { OrganizationMediaService } from './organization-media.service';
import { PresignOrganizationMediaDto } from './dto/presign-organization-media.dto';
import { ConfirmOrganizationMediaDto } from './dto/confirm-organization-media.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { OrganizationRolesGuard } from '../common/guards/organization-roles.guard';
import { OrgRoles } from '../common/decorators/org-roles.decorator';

const MANAGE_ROLES = [MemberRole.OWNER, MemberRole.CO_ORGANIZER];

@Controller('organizations/:organizationId/media')
@UseGuards(JwtAuthGuard, OrganizationRolesGuard)
export class OrganizationMediaController {
  constructor(private readonly organizationMediaService: OrganizationMediaService) {}

  @Post('presign')
  @OrgRoles(...MANAGE_ROLES)
  presign(@Param('organizationId') organizationId: string, @Body() dto: PresignOrganizationMediaDto) {
    return this.organizationMediaService.presign(organizationId, dto);
  }

  @Post('confirm')
  @OrgRoles(...MANAGE_ROLES)
  confirm(@Param('organizationId') organizationId: string, @Body() dto: ConfirmOrganizationMediaDto) {
    return this.organizationMediaService.confirm(organizationId, dto);
  }

  @Delete(':type')
  @OrgRoles(...MANAGE_ROLES)
  remove(@Param('organizationId') organizationId: string, @Param('type') type: string) {
    return this.organizationMediaService.remove(organizationId, type);
  }
}
