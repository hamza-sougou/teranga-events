import { format } from 'date-fns';
import { fr } from 'date-fns/locale';
import { cn } from '@/lib/utils';
import type { EventStatus, MemberStatus, OrderStatus, PayoutStatus, ScanResult } from '@/types';

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

// Derived status for the read-only "Reversements" page — deliberately only
// two tones (docs/DESIGN_SYSTEM.md §3), the sub-copy is what distinguishes
// "not ended yet" from "ended but not yet processed" rather than a 3rd
// color. PROCESSING/FAILED/no-row are all shown identically here: the
// organizer can't act on any of them (job retries FAILED automatically),
// so exposing that internal state would only read as alarming/confusing.
export function PayoutOverviewStatusBadge({
  payoutStatus,
  eventEndAt,
  triggeredAt,
}: {
  payoutStatus: PayoutStatus | null;
  eventEndAt: string;
  triggeredAt: string | null;
}) {
  if (payoutStatus === 'PAID') {
    return (
      <Badge
        tone="positive"
        label={`Versé${triggeredAt ? ` le ${format(new Date(triggeredAt), 'd MMM', { locale: fr })}` : ''}`}
      />
    );
  }
  if (new Date(eventEndAt) > new Date()) {
    return (
      <Badge tone="pending" label={`En attente — après le ${format(new Date(eventEndAt), 'd MMM', { locale: fr })}`} />
    );
  }
  return <Badge tone="pending" label="En attente — traitement en cours" />;
}

const ORDER_STATUS: Record<OrderStatus, { label: string; tone: BadgeTone }> = {
  PAID: { label: 'Payée', tone: 'positive' },
  PENDING: { label: 'En attente', tone: 'pending' },
  CANCELLED: { label: 'Annulée', tone: 'neutral' },
  REFUNDED: { label: 'Remboursée', tone: 'neutral' },
  EXPIRED: { label: 'Expirée', tone: 'neutral' },
};

export function OrderStatusBadge({ status }: { status: OrderStatus }) {
  const { label, tone } = ORDER_STATUS[status];
  return <Badge label={label} tone={tone} />;
}

// ALREADY_USED/INVALID/EXPIRED_EVENT map to "pending" (amber) rather than
// "neutral" — a rejected scan attempt is a security-relevant event a
// controller should notice, closer to "prudence" than "ended/neutral"
// (docs/DESIGN_SYSTEM.md §3). Never a 4th color for this.
const SCAN_RESULT: Record<ScanResult, { label: string; tone: BadgeTone }> = {
  SUCCESS: { label: 'Validé', tone: 'positive' },
  ALREADY_USED: { label: 'Déjà utilisé', tone: 'pending' },
  INVALID: { label: 'Invalide', tone: 'pending' },
  EXPIRED_EVENT: { label: 'Évènement terminé', tone: 'pending' },
};

export function ScanResultBadge({ result }: { result: ScanResult }) {
  const { label, tone } = SCAN_RESULT[result];
  return <Badge label={label} tone={tone} />;
}

const MEMBER_STATUS: Record<MemberStatus, { label: string; tone: BadgeTone }> = {
  ACTIVE: { label: 'Actif', tone: 'positive' },
  PENDING: { label: 'Invitation en attente', tone: 'pending' },
  SUSPENDED: { label: 'Suspendu', tone: 'neutral' },
};

export function MemberStatusBadge({ status }: { status: MemberStatus }) {
  const { label, tone } = MEMBER_STATUS[status];
  return <Badge label={label} tone={tone} />;
}

// Super Admin organizations list — organizations.is_verified is a plain
// boolean (no separate "rejected" state in the schema), so only 2 tones.
export function OrganizationVerificationBadge({ isVerified }: { isVerified: boolean }) {
  return isVerified ? (
    <Badge label="Vérifiée" tone="positive" />
  ) : (
    <Badge label="Non vérifiée" tone="pending" />
  );
}

// Independent of OrganizationVerificationBadge above — an organization can be
// verified AND suspended at the same time (fraud found after the fact).
// suspendedAt is a plain nullable timestamp, not a 3-state enum.
export function OrganizationSuspensionBadge({ suspendedAt }: { suspendedAt: string | null }) {
  return suspendedAt ? <Badge label="Suspendu" tone="neutral" /> : <Badge label="Actif" tone="positive" />;
}
