import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PayoutsService } from './payouts.service';

@Injectable()
export class PayoutsSchedulerJob {
  private readonly logger = new Logger(PayoutsSchedulerJob.name);

  constructor(private readonly payoutsService: PayoutsService) {}

  @Cron(CronExpression.EVERY_DAY_AT_3AM)
  async runDailyPayouts() {
    const results = await this.payoutsService.runDueEventPayouts();
    if (results.length > 0) {
      this.logger.log(`Processed ${results.length} event payout(s)`);
    }
  }
}
