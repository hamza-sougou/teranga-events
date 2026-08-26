'use client';

import { useEffect, useState } from 'react';
import { HistoryIcon } from '@/components/ui/icons';
import { getRecentlyViewed } from '@/lib/recently-viewed';
import { DiscoverySection } from './discovery-section';
import type { EventCardData } from './event-card';

// Reads localStorage on mount only — the write happens on the event detail
// page, so this never needs to refetch anything itself. Absent entirely
// (not an empty state) until at least one real visit has happened, per
// docs/SPEC.md §9.1.
export function RecentlyViewedSection() {
  const [events, setEvents] = useState<EventCardData[] | null>(null);

  useEffect(() => {
    setEvents(getRecentlyViewed());
  }, []);

  if (events === null) return null;

  return (
    <DiscoverySection
      title="Vus récemment"
      icon={<HistoryIcon className="h-[17px] w-[17px]" />}
      isLoading={false}
      events={events}
    />
  );
}
