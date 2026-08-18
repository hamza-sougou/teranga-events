import { Module } from '@nestjs/common';
import { PaymentsController } from './payments.controller';
import { PaymentsService } from './payments.service';
import { CinetpayProvider } from './providers/cinetpay.provider';
import { PaydunyaProvider } from './providers/paydunya.provider';
import { PricingService } from './pricing/pricing.service';

@Module({
  controllers: [PaymentsController],
  providers: [PaymentsService, CinetpayProvider, PaydunyaProvider, PricingService],
  exports: [PaymentsService, PaydunyaProvider, PricingService],
})
export class PaymentsModule {}
