import Link from 'next/link';
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';
import { EventCategoryBadge } from '@/components/events/category-badge';
import { MapPinIcon } from '@/components/ui/icons';
import { cn, formatXof } from '@/lib/utils';
import type { EventCategory } from '@/types';

export interface EventCardData {
  id: string;
  slug: string;
  name: string;
  category: EventCategory | null;
  coverImageUrl: string | null;
  city: string | null;
  startAt: string;
  displayPrice: number | null;
}

interface EventCardBadge {
  label: string;
  tone: 'amber' | 'indigo';
}

// Opaque chips, not the amber-soft/emerald-soft translucent tokens used
// elsewhere for status badges on white panels — those barely register over a
// photo of unpredictable brightness (docs/DESIGN_SYSTEM.md "contraste
// vérifié à chaque changement de token", not just eyeballed).
const BADGE_TONE_CLASSES: Record<EventCardBadge['tone'], string> = {
  amber: 'bg-amber text-ink',
  indigo: 'bg-indigo text-white',
};

// The one event-card shape shared by the hero's trending row and every
// discovery section below it — also the shape a future search/listing page
// reuses (docs/DESIGN_SYSTEM.md build plan, backend EventCardDto).
export function EventCard({ event, badge, className }: { event: EventCardData; badge?: EventCardBadge; className?: string }) {
  return (
    <Link
      href={`/events/${event.slug}`}
      className={cn(
        'block w-[320px] shrink-0 overflow-hidden rounded-card bg-card transition-transform ',
        className,
      )}
    >
      <div className="relative h-[130px] w-full bg-ink-2">
        {event.coverImageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={event.coverImageUrl} alt={event.name} className="h-full w-full object-cover" />
        ) : null}
        {badge && (
          <span
            className={cn(
              'absolute left-2 top-2 rounded px-[7px] py-[3px] text-[10px] font-extrabold uppercase tracking-wide',
              BADGE_TONE_CLASSES[badge.tone],
            )}
          >
            {badge.label}
          </span>
        )}
      </div>

      <div className="p-3">
        {event.category && <EventCategoryBadge category={event.category} />}
        <div className="mt-2 truncate text-[14px] font-extrabold text-text">{event.name}</div>
        <div className="mt-1 flex items-center gap-1 truncate text-[12px] font-semibold text-text-muted">
          {event.city && (
            <>
              <MapPinIcon className="h-3 w-3 shrink-0" />
              <span className="truncate">{event.city}</span>
              <span>•</span>
            </>
          )}
          <span className="shrink-0">{format(new Date(event.startAt), 'd MMM', { locale: fr })}</span>
        </div>
        <div className="mt-2 text-[13px] font-bold text-indigo">
          {event.displayPrice === null ? 'Prix à venir' : event.displayPrice === 0 ? 'Gratuit' : formatXof(event.displayPrice)}
        </div>
      </div>
    </Link>
  );
}
