// HYPOTHÈSE NON CONFIRMÉE PAR PAYDUNYA (docs/SPEC.md §5.3) : on suppose que
// les frais de payout sont déduits du montant décaissé (l'organisateur reçoit
// moins que ce qu'on demande à PayDunya de transférer), pas prélevés en plus
// sur le solde Zen Events. Réponse du support PayDunya en attente.
//
// Cette fonction est le SEUL endroit à corriger si PayDunya confirme l'autre
// modèle — elle est réutilisée à la fois par le calcul du prix affiché au
// client (PricingService.quoteCheckout, qui grossit le prix pour absorber ce
// même montant à décaisser) et par le job de reversement réel
// (PayoutsService), voir docs/MODULE_PAIEMENT_SPEC.md §5-6.
//
// Le reversement organisateur se fait exclusivement en mobile money
// (organizations.payout_phone_number, docs/SPEC.md §5.6) — pas de canal
// Djamo côté payout, donc pas de paramètre de canal ici.
const PAYOUT_FEE_RATE_MOBILE_MONEY = 0.02;

export function calculatePayoutAmount(netAmount: number): number {
  return netAmount / (1 - PAYOUT_FEE_RATE_MOBILE_MONEY);
}
