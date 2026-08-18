// Client-facing payin channels offered at checkout (docs/SPEC.md §5.5). The
// payment channel must be chosen on our own checkout page BEFORE the
// PayDunya invoice is created, because PayDunya charges exactly
// `invoice.totalAmount` with no server-side recalculation of its own — see
// docs/MODULE_PAIEMENT_SPEC.md §5.
export enum PaymentChannel {
  MOBILE_MONEY = 'MOBILE_MONEY', // Wave, Orange Money, Free Money
  CARD = 'CARD',
  DJAMO = 'DJAMO',
}

// Payin fees PayDunya confirmed (docs/SPEC.md §5.3) — what Zen Events pays
// when the client's money lands on our PayDunya balance.
export const PAYIN_FEE_RATES: Record<PaymentChannel, number> = {
  [PaymentChannel.MOBILE_MONEY]: 0.0225,
  [PaymentChannel.CARD]: 0.0325,
  [PaymentChannel.DJAMO]: 0.02,
};
