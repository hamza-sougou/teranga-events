'use client';

import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';
import { queryKeys } from '@/lib/query-keys';
import { Button } from '@/components/ui/button';
import { TicketTypesPanel } from '@/components/events/ticket-types-panel';
import type { TicketType } from '@/types';

interface StepTicketsProps {
  organizationId: string;
  eventId: string;
  onBack: () => void;
  onNext: () => void;
}

export function StepTickets({ organizationId, eventId, onBack, onNext }: StepTicketsProps) {
  // Same query key TicketTypesPanel uses internally — see StepMedia for why
  // this doesn't duplicate the request, just reads the count for gating.
  const ticketTypesQuery = useQuery<TicketType[]>({
    queryKey: queryKeys.ticketTypes(organizationId, eventId),
    queryFn: async () => (await apiClient.get(`/organizations/${organizationId}/events/${eventId}/ticket-types`)).data,
    enabled: !!organizationId && !!eventId,
  });
  const hasTicketType = (ticketTypesQuery.data?.length ?? 0) > 0;

  return (
    <div>
      <TicketTypesPanel organizationId={organizationId} eventId={eventId} canEdit />

      <div className="flex gap-2.5">
        <Button type="button" variant="ghost" onClick={onBack}>
          Précédent
        </Button>
        <Button type="button" disabled={!hasTicketType} onClick={onNext}>
          Suivant
        </Button>
      </div>
    </div>
  );
}
