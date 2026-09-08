'use client';

import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';
import { queryKeys } from '@/lib/query-keys';
import { Button } from '@/components/ui/button';
import { EventMediaPanel } from '@/components/events/event-media-panel';
import type { EventMedia } from '@/types';

interface StepMediaProps {
  organizationId: string;
  eventId: string;
  onBack: () => void;
  onNext: () => void;
}

export function StepMedia({ organizationId, eventId, onBack, onNext }: StepMediaProps) {
  // Same query key EventMediaPanel uses internally — this doesn't duplicate
  // the network request (react-query dedupes/shares the cache entry), it
  // just lets the wizard read the count to gate "Suivant".
  const mediaQuery = useQuery<EventMedia[]>({
    queryKey: queryKeys.media(organizationId, eventId),
    queryFn: async () => (await apiClient.get(`/organizations/${organizationId}/events/${eventId}/media`)).data,
    enabled: !!organizationId && !!eventId,
  });
  const hasMedia = (mediaQuery.data?.length ?? 0) > 0;

  return (
    <div>
      <EventMediaPanel organizationId={organizationId} eventId={eventId} canEdit />

      <div className="flex gap-2.5">
        <Button type="button" variant="ghost" onClick={onBack}>
          Précédent
        </Button>
        <Button type="button" disabled={!hasMedia} onClick={onNext}>
          Suivant
        </Button>
      </div>
    </div>
  );
}
