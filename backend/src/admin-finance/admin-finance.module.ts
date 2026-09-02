import { Module } from '@nestjs/common';
import { AdminFinanceController } from './admin-finance.controller';
import { AdminFinanceService } from './admin-finance.service';
import { StatsModule } from '../stats/stats.module';
import { PayoutsModule } from '../payouts/payouts.module';

@Module({
  imports: [StatsModule, PayoutsModule],
  controllers: [AdminFinanceController],
  providers: [AdminFinanceService],
})
export class AdminFinanceModule {}
