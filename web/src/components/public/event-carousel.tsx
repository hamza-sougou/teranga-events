'use client';

import { useLayoutEffect, useRef, useState } from 'react';
import { cn } from '@/lib/utils';
import { ChevronLeftIcon, ChevronRightIcon } from '@/components/ui/icons';
import { EventCard, type EventCardData } from './event-card';

const PAGE_SIZE = 4;
const MAX_EVENTS = 16;
// Tolerates sub-pixel float rounding from getBoundingClientRect/scrollWidth
// without flipping a button's disabled state one pixel early/late.
const SCROLL_EPSILON = 4;

type SectionTone = 'light' | 'dark';

interface EventCarouselProps {
  // Fully-styled heading node, owned by the caller (DiscoverySection's
  // Kicker+h2 vs. HomeHero's eyebrow-style label look nothing alike) — this
  // component only places it in a row next to the arrow buttons.
  title: React.ReactNode;
  events: EventCardData[];
  badge?: (event: EventCardData) => { label: string; tone: 'amber' | 'indigo' } | undefined;
  tone?: SectionTone;
}

// Shared carousel for every discovery row (DiscoverySection) and the hero's
// trending row. A real horizontally-scrolling track (native smooth-scroll
// animation, not a re-render swap) with prev/next buttons above it driving
// `scrollTo` — at most MAX_EVENTS are ever loaded, PAGE_SIZE (4) items wide
// at a time. "Next" always lands on a full page: the target scroll position
// is clamped to `scrollWidth - clientWidth` (the exact position where the
// last item sits flush against the right edge), so a tail shorter than 4
// (e.g. 6 events: 1-4, then 3-6, not 1-4 then a half-empty 5-6) shifts by
// however much is needed rather than a fixed 4-item jump.
export function EventCarousel({ title, events, badge, tone = 'light' }: EventCarouselProps) {
  const trackRef = useRef<HTMLDivElement>(null);
  // Seeded with a same-breakpoint-agnostic guess so the buttons don't pop in
  // a frame late on first paint — refined immediately by the layout effect
  // below once real widths are known.
  const [hasOverflow, setHasOverflow] = useState(events.length > PAGE_SIZE);
  const [canGoBack, setCanGoBack] = useState(false);
  const [canGoForward, setCanGoForward] = useState(true);

  const capped = events.slice(0, MAX_EVENTS);

  function updateArrowState() {
    const el = trackRef.current;
    if (!el) return;
    setHasOverflow(el.scrollWidth > el.clientWidth + SCROLL_EPSILON);
    setCanGoBack(el.scrollLeft > SCROLL_EPSILON);
    setCanGoForward(el.scrollLeft < el.scrollWidth - el.clientWidth - SCROLL_EPSILON);
  }

  // useLayoutEffect (not useEffect): measuring scrollWidth/clientWidth after
  // paint would show stale/wrong button states for one frame.
  useLayoutEffect(() => {
    updateArrowState();
    const el = trackRef.current;
    if (!el) return;
    el.addEventListener('scroll', updateArrowState, { passive: true });
    window.addEventListener('resize', updateArrowState);
    return () => {
      el.removeEventListener('scroll', updateArrowState);
      window.removeEventListener('resize', updateArrowState);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [capped.length]);

  function scrollByPage(direction: 1 | -1) {
    const el = trackRef.current;
    const firstItem = el?.children[0] as HTMLElement | undefined;
    if (!el || !firstItem) return;
    const gap = parseFloat(getComputedStyle(el).columnGap || '0');
    const step = (firstItem.getBoundingClientRect().width + gap) * PAGE_SIZE;
    const maxScroll = el.scrollWidth - el.clientWidth;
    const target = direction === 1 ? Math.min(el.scrollLeft + step, maxScroll) : Math.max(el.scrollLeft - step, 0);
    el.scrollTo({ left: target, behavior: 'smooth' });
  }

  return (
    <div>
      <div className="mb-4 flex items-center justify-between gap-3">
        {title}
        {hasOverflow && (
          <div className="flex shrink-0 gap-2">
            <CarouselArrowButton direction="left" tone={tone} disabled={!canGoBack} onClick={() => scrollByPage(-1)} />
            <CarouselArrowButton direction="right" tone={tone} disabled={!canGoForward} onClick={() => scrollByPage(1)} />
          </div>
        )}
      </div>

      <div
        ref={trackRef}
        className="flex gap-4 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {capped.map((event) => (
          <div key={event.id} className="w-full shrink-0 sm:w-[calc(50%_-_8px)] lg:w-[calc(25%_-_12px)]">
            <EventCard event={event} badge={badge?.(event)} className="w-full" />
          </div>
        ))}
      </div>
    </div>
  );
}

function CarouselArrowButton({
  direction,
  tone,
  disabled,
  onClick,
}: {
  direction: 'left' | 'right';
  tone: SectionTone;
  disabled: boolean;
  onClick: () => void;
}) {
  const Icon = direction === 'left' ? ChevronLeftIcon : ChevronRightIcon;
  return (
    <button
      type="button"
      aria-label={direction === 'left' ? 'Précédent' : 'Suivant'}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        'flex h-9 w-9 items-center justify-center rounded border transition-colors disabled:cursor-not-allowed disabled:opacity-30',
        tone === 'dark' ? 'border-white/20 text-on-dark hover:bg-ink-2' : 'border-border text-text hover:bg-bg',
      )}
    >
      <Icon className="h-4 w-4" />
    </button>
  );
}
