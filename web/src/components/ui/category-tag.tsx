import { cn } from '@/lib/utils';
import type { TicketCategory } from '@/types';

// Decorative-only mapping (visual variety, not semantic status — see
// docs/DESIGN_SYSTEM.md §2 "Couleurs de catégorie d'évènement"). Do not
// confuse with EventStatusBadge/PayoutStatusBadge's strict tone system.
// Solid background rather than a soft/tinted one: the cat-* tokens are
// plain hex custom properties, not RGB-channel triples, so a Tailwind
// opacity modifier (`bg-cat-indigo/10`) can't be applied to them — same
// constraint documented in globals.css for --emerald-soft/--amber-soft.
const CATEGORY: Record<TicketCategory, { label: string; className: string }> = {
  STANDARD: { label: 'Standard', className: 'bg-cat-indigo text-white' },
  VIP: { label: 'VIP', className: 'bg-cat-amber text-ink' },
  EARLY_BIRD: { label: 'Early bird', className: 'bg-cat-teal text-white' },
  PRESALE: { label: 'Prévente', className: 'bg-cat-emerald text-white' },
  GROUP: { label: 'Groupe', className: 'bg-cat-orange text-white' },
};

export function TicketCategoryTag({ category }: { category: TicketCategory }) {
  const { label, className } = CATEGORY[category];
  return (
    <span className={cn('inline-flex items-center rounded px-[9px] py-1 text-[11px] font-bold', className)}>
      {label}
    </span>
  );
}
