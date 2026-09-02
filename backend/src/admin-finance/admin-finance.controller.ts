import { Controller, Get, UseGuards } from '@nestjs/common';
import { AdminFinanceService } from './admin-finance.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { SuperAdminGuard } from '../common/guards/super-admin.guard';

// Platform-wide, not org-scoped — same reasoning as AdminOrganizationsController/
// AdminPayoutsController (a Super Admin has no organization_members row).
@Controller('admin/finance')
@UseGuards(JwtAuthGuard, SuperAdminGuard)
export class AdminFinanceController {
  constructor(private readonly adminFinanceService: AdminFinanceService) {}

  @Get('overview')
  getOverview() {
    return this.adminFinanceService.getOverview();
  }
}
