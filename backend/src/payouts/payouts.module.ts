import { Module } from '@nestjs/common';
import { PayoutsController } from './payouts.controller';
import { AdminPayoutsController } from './admin-payouts.controller';
import { PayoutsService } from './payouts.service';
import { PayoutsSchedulerJob } from './payouts-scheduler.job';
import { PaymentsModule } from '../payments/payments.module';

@Module({
  imports: [PaymentsModule],
  controllers: [PayoutsController, AdminPayoutsController],
  providers: [PayoutsService, PayoutsSchedulerJob],
  exports: [PayoutsService],
})
export class PayoutsModule {}
