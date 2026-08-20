import { cn } from '@/lib/utils';
import type { EventStatus, PayoutStatus } from '@/types';

type BadgeTone = 'positive' | 'pending' | 'neutral';

// Strict semantic mapping — docs/DESIGN_SYSTEM.md §3: emerald = positive/
// verified/active, amber = pending/draft, ink (low opacity) = ended/neutral.
// Never interchange these for decoration.
const toneClasses: Record<BadgeTone, string> = {
  positive: 'bg-emerald-soft text-emerald-strong',
  pending: 'bg-amber-soft text-amber-strong',
  neutral: 'bg-ink-soft text-text-muted',
};

function Badge({ label, tone }: { label: string; tone: BadgeTone }) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-[5px] rounded px-[9px] py-1 text-[11px] font-bold',
        toneClasses[tone],
      )}
    >
      <span className="h-[5px] w-[5px] rounded-full bg-current" />
      {label}
    </span>
  );
}

const EVENT_STATUS: Record<EventStatus, { label: string; tone: BadgeTone }> = {
  PUBLISHED: { label: 'Publié', tone: 'positive' },
  DRAFT: { label: 'Brouillon', tone: 'pending' },
  COMPLETED: { label: 'Terminé', tone: 'neutral' },
  CANCELLED: { label: 'Annulé', tone: 'neutral' },
};

export function EventStatusBadge({ status }: { status: EventStatus }) {
  const { label, tone } = EVENT_STATUS[status];
  return <Badge label={label} tone={tone} />;
}

const PAYOUT_STATUS: Record<PayoutStatus, { label: string; tone: BadgeTone }> = {
  PAID: { label: 'Versé', tone: 'positive' },
  PROCESSING: { label: 'En cours', tone: 'pending' },
  PENDING: { label: 'En attente', tone: 'pending' },
  FAILED: { label: 'Échoué', tone: 'neutral' },
};

export function PayoutStatusBadge({ status }: { status: PayoutStatus }) {
  const { label, tone } = PAYOUT_STATUS[status];
  return <Badge label={label} tone={tone} />;
}
