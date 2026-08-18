import { Injectable } from '@nestjs/common';
import { calculatePayoutAmount } from './payout-amount';
import { PAYIN_FEE_RATES, PaymentChannel } from './payment-channel';

// Commission cible : 5% du prix organisateur, quel que soit le canal choisi
// par le client (docs/SPEC.md §5.5).
const ORGANIZER_MARGIN_RATE = 0.05;

export interface CheckoutQuote {
  subtotalAmount: number;
  serviceFeeAmount: number;
  totalAmount: number;
}

@Injectable()
export class PricingService {
  // Réutilisé par POST /orders/preview et POST /orders — jamais recalculé
  // différemment entre les deux (docs/MODULE_PAIEMENT_SPEC.md §5).
  quoteCheckout(subtotalAmount: number, paymentChannel: PaymentChannel): CheckoutQuote {
    const payoutAmount = calculatePayoutAmount(subtotalAmount);
    const balanceNeededAfterPayin = payoutAmount + subtotalAmount * ORGANIZER_MARGIN_RATE;
    const payinRate = PAYIN_FEE_RATES[paymentChannel];

    // Arrondi à l'unité XOF (pas de sous-unité en usage réel), puis
    // serviceFeeAmount dérivé par soustraction — jamais arrondi
    // indépendamment — pour garantir chk_orders_total_equals_parts par
    // construction (voir db/schema.sql section 7).
    const totalAmount = Math.round(balanceNeededAfterPayin / (1 - payinRate));
    const serviceFeeAmount = totalAmount - subtotalAmount;

    return { subtotalAmount, serviceFeeAmount, totalAmount };
  }
}
