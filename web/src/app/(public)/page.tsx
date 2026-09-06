'use client';

import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';
import { queryKeys } from '@/lib/query-keys';
import { HomeHero } from '@/components/public/home-hero';
import { DiscoverySection } from '@/components/public/discovery-section';
import { NearMeSection } from '@/components/public/near-me-section';
import { RecentlyViewedSection } from '@/components/public/recently-viewed-section';
import { CategoryGrid } from '@/components/public/category-grid';
import { BecomeOrganizerBand } from '@/components/public/become-organizer-band';
import { CalendarIcon, ZapIcon, FlameIcon, GiftIcon } from '@/components/ui/icons';
import type { EventCardData } from '@/components/public/event-card';

// Purely a list-of-lists page (docs/SPEC.md §9) — deliberately no fixed
// editorial content beyond the hero copy. Each section below fetches its own
// /discover/* endpoint independently so a slow/erroring one (near-me without
// geolocation especially) never blocks the others.
export default function HomePage() {
  const thisWeekendQuery = useQuery<EventCardData[]>({
    queryKey: queryKeys.discoverThisWeekend(),
    queryFn: async () => (await apiClient.get('/discover/this-weekend')).data,
  });

  const sponsoredQuery = useQuery<EventCardData[]>({
    queryKey: queryKeys.discoverSponsored(),
    queryFn: async () => (await apiClient.get('/discover/sponsored')).data,
  });

  const recentlyPublishedQuery = useQuery<EventCardData[]>({
    queryKey: queryKeys.discoverRecentlyPublished(),
    queryFn: async () => (await apiClient.get('/discover/recently-published')).data,
  });

  const lastChanceQuery = useQuery<EventCardData[]>({
    queryKey: queryKeys.discoverLastChance(),
    queryFn: async () => (await apiClient.get('/discover/last-chance')).data,
  });

  const freeQuery = useQuery<EventCardData[]>({
    queryKey: queryKeys.discoverFree(),
    queryFn: async () => (await apiClient.get('/discover/free')).data,
  });

  return (
    <main>
      <HomeHero />

      <DiscoverySection
        title="Ce week-end"
        icon={<CalendarIcon className="h-[17px] w-[17px]" />}
        isLoading={thisWeekendQuery.isLoading}
        events={thisWeekendQuery.data ?? []}
      />

      <NearMeSection />

      <DiscoverySection
        title="Sponsorisés"
        icon={<ZapIcon className="h-[17px] w-[17px]" />}
        tone="dark"
        isLoading={sponsoredQuery.isLoading}
        events={sponsoredQuery.data ?? []}
        badge={() => ({ label: 'Sponsorisé', tone: 'indigo' })}
      />

      <RecentlyViewedSection />

      <DiscoverySection
        title="Publiés récemment"
        icon={<CalendarIcon className="h-[17px] w-[17px]" />}
        isLoading={recentlyPublishedQuery.isLoading}
        events={recentlyPublishedQuery.data ?? []}
      />

      <DiscoverySection
        title="Dernière chance"
        icon={<FlameIcon className="h-[17px] w-[17px]" />}
        isLoading={lastChanceQuery.isLoading}
        events={lastChanceQuery.data ?? []}
        badge={() => ({ label: 'Dernière chance', tone: 'amber' })}
      />

      <DiscoverySection
        title="Gratuit"
        icon={<GiftIcon className="h-[17px] w-[17px]" />}
        isLoading={freeQuery.isLoading}
        events={freeQuery.data ?? []}
      />

      <CategoryGrid />
      <BecomeOrganizerBand />
    </main>
  );
}
