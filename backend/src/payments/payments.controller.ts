import { Body, Controller, HttpCode, Post } from '@nestjs/common';
import { PaymentsService } from './payments.service';

@Controller('payments')
export class PaymentsController {
  constructor(private readonly paymentsService: PaymentsService) {}

  // No guard — called by PayDunya, authenticated via hash verification
  // inside the service (docs/MODULE_PAIEMENT_SPEC.md §3), not a JWT.
  @Post('webhooks/paydunya')
  @HttpCode(200)
  async handlePaydunyaWebhook(@Body() body: Record<string, unknown>) {
    await this.paymentsService.handlePaydunyaIpn(body);
    return { received: true };
  }
}
