// Shared "event card" shape for every homepage discovery section
// (docs/SPEC.md §9) — kept identical across all 8 backed sections so the
// future search/listing page can reuse it verbatim rather than each section
// growing its own ad hoc projection.
export interface EventCardDto {
  id: string;
  slug: string;
  name: string;
  category: { slug: string; label: string; icon: string; colorToken: string } | null;
  coverImageUrl: string | null;
  city: string | null;
  startAt: Date;
  // Commission-included price (docs/SPEC.md §5.5), same reference channel as
  // TicketTypesService.findPublicForEvent (mobile money, cheapest ticket
  // type). Null only when the event has no purchasable ticket type at all —
  // a free ticket type still yields 0, never null.
  displayPrice: number | null;
  currency: string;
}
