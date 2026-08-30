// Mirrors types/index.ts's OrderStatus — kept as a local literal union
// (rather than importing via the `@/` alias) so this file has zero module
// resolution dependencies and can be tested with a bare `vitest run`, no
// tsconfig-paths plugin required.
type OrderStatus = 'PENDING' | 'PAID' | 'CANCELLED' | 'REFUNDED' | 'EXPIRED';

export type OrderDisplayState = 'paid' | 'pending' | 'expired' | 'failed';

// The only place backend OrderStatus -> confirmation-page display state is
// decided. EXPIRED gets its own state distinct from CANCELLED/REFUNDED
// ("failed") because the message shown to the buyer is different — a paint
// that expired unpaid is not the same story as a payment that was actively
// declined/refunded (docs/MODULE_PAIEMENT_SPEC.md §1/§7).
export function interpretOrderStatus(status: OrderStatus): OrderDisplayState {
  switch (status) {
    case 'PAID':
      return 'paid';
    case 'PENDING':
      return 'pending';
    case 'EXPIRED':
      return 'expired';
    case 'CANCELLED':
    case 'REFUNDED':
      return 'failed';
  }
}
