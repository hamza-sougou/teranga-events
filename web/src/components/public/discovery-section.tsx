import { Kicker } from '@/components/ui/kicker';
import { cn } from '@/lib/utils';
import { EventCarousel } from './event-carousel';
import type { EventCardData } from './event-card';

type SectionTone = 'light' | 'dark';

interface DiscoverySectionProps {
  title: string;
  icon: React.ReactNode;
  tone?: SectionTone;
  isLoading: boolean;
  events: EventCardData[];
  badge?: (event: EventCardData) => { label: string; tone: 'amber' | 'indigo' } | undefined;
}

// Shared shell for every horizontally-scrolling discovery row (docs/SPEC.md
// §9) — one component instead of duplicating the Kicker+title+scroll-row
// markup 6 times. Renders nothing once loaded with zero results, per
// "no visible empty state" — a first-time visitor with no orders/promotions
// yet must not see a hollow section.
export function DiscoverySection({ title, icon, tone = 'light', isLoading, events, badge }: DiscoverySectionProps) {
  if (!isLoading && events.length === 0) return null;

  const isDark = tone === 'dark';
  const heading = (
    <h2
      className={cn(
        'flex items-center gap-2 text-lg font-black uppercase tracking-[-0.01em]',
        isDark ? 'text-on-dark' : 'text-text',
      )}
    >
      {icon}
      {title}
    </h2>
  );

  return (
    <section className={cn('py-10', isDark ? 'bg-ink' : 'bg-bg')}>
      <div className="mx-auto max-w-6xl px-6 sm:px-10">
        <Kicker tone={isDark ? 'dark' : 'light'} />

        {isLoading ? (
          <>
            <div className="mb-4">{heading}</div>
            <div className={cn('h-[228px] w-full animate-pulse rounded-card', isDark ? 'bg-ink-2' : 'bg-card')} />
          </>
        ) : (
          <EventCarousel title={heading} events={events} badge={badge} tone={tone} />
        )}
      </div>
    </section>
  );
}
