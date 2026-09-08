'use client';

import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { CompassIcon } from '@/components/ui/icons';
import { apiClient } from '@/lib/api-client';
import { queryKeys } from '@/lib/query-keys';
import { DiscoverySection } from './discovery-section';
import type { EventCardData } from './event-card';

type GeoState = { status: 'pending' | 'denied' } | { status: 'granted'; lat: number; lng: number };

// Requests geolocation permission on mount, entirely independent of the rest
// of the page — never awaited by anything else. Denied/unavailable/error all
// collapse to the same outcome: this component renders nothing, no visible
// error (per the plan). GET /discover/near-me requires lat/lng (no server
// fallback), so the query only ever fires once permission is granted.
export function NearMeSection() {
  const [geo, setGeo] = useState<GeoState>({ status: 'pending' });

  useEffect(() => {
    if (!('geolocation' in navigator)) {
      setGeo({ status: 'denied' });
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (position) => setGeo({ status: 'granted', lat: position.coords.latitude, lng: position.coords.longitude }),
      () => setGeo({ status: 'denied' }),
      { timeout: 8000 },
    );
  }, []);

  const nearMeQuery = useQuery<EventCardData[]>({
    queryKey: queryKeys.discoverNearMe(geo.status === 'granted' ? geo.lat : undefined, geo.status === 'granted' ? geo.lng : undefined),
    queryFn: async () => {
      if (geo.status !== 'granted') return [];
      return (await apiClient.get('/discover/near-me', { params: { lat: geo.lat, lng: geo.lng, limit: 16 } })).data;
    },
    enabled: geo.status === 'granted',
  });

  if (geo.status === 'denied') return null;
  if (geo.status === 'granted' && !nearMeQuery.isLoading && (nearMeQuery.data ?? []).length === 0) return null;

  return (
    <DiscoverySection
      title="Près de toi"
      icon={<CompassIcon className="h-[17px] w-[17px]" />}
      isLoading={geo.status === 'pending' || nearMeQuery.isLoading}
      events={nearMeQuery.data ?? []}
    />
  );
}
