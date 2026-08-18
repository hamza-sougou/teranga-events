import { Controller, Param, Post, UseGuards } from '@nestjs/common';
import { PayoutsService } from './payouts.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { SuperAdminGuard } from '../common/guards/super-admin.guard';

// Manual trigger — real money movement, Super Admin only. Re-runs the same
// eligibility + disbursement logic as the daily job for a single event
// (retry a FAILED payout, or exercise the flow without waiting for cron).
@Controller('admin/events/:eventId/payout')
@UseGuards(JwtAuthGuard, SuperAdminGuard)
export class AdminPayoutsController {
  constructor(private readonly payoutsService: PayoutsService) {}

  @Post()
  runForEvent(@Param('eventId') eventId: string) {
    return this.payoutsService.runPayoutForEvent(eventId);
  }
}
