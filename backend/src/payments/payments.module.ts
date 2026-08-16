import { Module } from '@nestjs/common';
import { PaymentsController } from './payments.controller';
import { PaymentsService } from './payments.service';
import { StripeProvider } from './providers/stripe.provider';
import { CinetpayProvider } from './providers/cinetpay.provider';
import { PaydunyaProvider } from './providers/paydunya.provider';

@Module({
  controllers: [PaymentsController],
  providers: [PaymentsService, StripeProvider, CinetpayProvider, PaydunyaProvider],
  exports: [PaymentsService],
})
export class PaymentsModule {}
