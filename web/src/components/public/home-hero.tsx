'use client';

import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';
import { queryKeys } from '@/lib/query-keys';
import { usePublicNavbarVisibility } from './public-navbar-context';
import { Input } from '@/components/ui/input';
import { SearchIcon, TrendingUpIcon } from '@/components/ui/icons';
import { EventCarousel } from './event-carousel';
import type { EventCardData } from './event-card';

// Full-viewport-ish opener for the homepage. No background fill of its own
// (inherits the page's --bg) — the visual weight comes from the marker-style
// gradient highlight behind the H1 (.hero-title-highlight, globals.css)
// instead.
export function HomeHero() {
  const router = useRouter();
  const [search, setSearch] = useState('');
  const sentinelRef = useRef<HTMLDivElement>(null);
  const { setCategoriesVisible } = usePublicNavbarVisibility();

  const trendingQuery = useQuery<EventCardData[]>({
    queryKey: queryKeys.discoverTrending(),
    queryFn: async () => (await apiClient.get('/discover/trending', { params: { limit: 16 } })).data,
  });

  // Same sentinel + boundingClientRect.top < 0 recipe already fixed on
  // StickyBuyBar/EventPage (app/(public)/events/[slug]/page.tsx) — never
  // `!entry.isIntersecting` alone, which is also true before the sentinel has
  // ever entered the viewport, not just after it scrolled past. Hidden while
  // the hero is on screen, revealed once scrolled past — inverse of the
  // sticky buy bar's own visible condition.
  useEffect(() => {
    const el = sentinelRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(([entry]) => setCategoriesVisible(!(entry.boundingClientRect.top < 0)), {
      threshold: 0,
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, [setCategoriesVisible]);

  function handleSearchSubmit(e: FormEvent) {
    e.preventDefault();
    const term = search.trim();
    router.push(term ? `/events?q=${encodeURIComponent(term)}` : '/events');
  }

  return (
    <div className="relative">
      <div className="relative flex min-h-[640px] flex-col items-center overflow-hidden px-6 pb-16 pt-28 sm:px-10 bg-black">
        <video
          className="absolute inset-0 h-full w-full object-cover"
          src="/hero-bg-video.mp4"
          autoPlay
          loop
          muted
          playsInline
        />
        {/* Darkens the raw footage so the white/on-dark text above it stays
            readable regardless of how bright the source clip is — same
            reasoning as the bg-black fallback it now sits on top of. Also
            what keeps this behind the content below: both are `relative`
            (stack level 0, painted in DOM order), so the video/overlay pair
            — first in the DOM — paints under the content that follows. */}
        <div className="absolute inset-0 bg-black/60" />

        <div className="relative flex w-full flex-col items-center">
          {/* Eyebrow pill — a deliberate, documented one-off (docs/DESIGN_SYSTEM.md
              §3), not the standard Kicker used by every other section title. */}
          <span className="mb-5 rounded-full bg-ink-2 px-4 py-1.5 text-[11px] font-extrabold uppercase tracking-wide text-on-dark">
            Entre dans l&apos;ambiance
          </span>
          <h1 className="max-w-2xl text-center text-4xl font-black leading-[1.35] sm:text-6xl">
            <span className="hero-title-highlight">Découvre ta prochaine sortie.</span>
          </h1>

          <form onSubmit={handleSearchSubmit} className="mt-8 flex w-full max-w-md items-center gap-2">
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Rechercher un évènement..."
              aria-label="Rechercher un évènement"
              className="py-3"
            />
            <button
              type="submit"
              aria-label="Rechercher"
              className="flex h-[43px] w-[43px] shrink-0 items-center justify-center rounded bg-indigo text-white transition-colors hover:opacity-90"
            >
              <SearchIcon className="h-4 w-4" />
            </button>
          </form>

          {!trendingQuery.isLoading && (trendingQuery.data?.length ?? 0) > 0 && (
            <div className="mt-14 w-full max-w-6xl">
              <EventCarousel
                title={
                  <div className="flex items-center gap-2 px-1 text-[12px] font-extrabold uppercase tracking-wide text-text-muted">
                    <TrendingUpIcon className="h-4 w-4" />
                    Évènements en tendance
                  </div>
                }
                events={trendingQuery.data!}
                tone="dark"
              />
            </div>
          )}
        </div>
      </div>
      <div ref={sentinelRef} />
    </div>
  );
}
