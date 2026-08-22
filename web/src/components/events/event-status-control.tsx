'use client';

import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';
import { queryKeys } from '@/lib/query-keys';
import { getApiErrorMessage } from '@/lib/api-errors';
import { Button } from '@/components/ui/button';
import { InlineBanner } from '@/components/ui/inline-banner';
import type { EventStatus } from '@/types';

// Mirrors ALLOWED_TRANSITIONS in backend/src/events/events.service.ts.
const ALLOWED_TRANSITIONS: Record<EventStatus, EventStatus[]> = {
  DRAFT: ['PUBLISHED', 'CANCELLED'],
  PUBLISHED: ['CANCELLED', 'COMPLETED'],
  CANCELLED: [],
  COMPLETED: [],
};

const ACTION_LABELS: Record<EventStatus, string> = {
  DRAFT: 'Repasser en brouillon',
  PUBLISHED: 'Publier',
  CANCELLED: "Annuler l'évènement",
  COMPLETED: 'Marquer comme terminé',
};

interface EventStatusControlProps {
  organizationId: string;
  eventId: string;
  status: EventStatus;
  canManage: boolean;
}

export function EventStatusControl({ organizationId, eventId, status, canManage }: EventStatusControlProps) {
  const queryClient = useQueryClient();
  const [error, setError] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: (nextStatus: EventStatus) =>
      apiClient.patch(`/organizations/${organizationId}/events/${eventId}`, { status: nextStatus }),
    onSuccess: () => {
      setError(null);
      queryClient.invalidateQueries({ queryKey: queryKeys.event(organizationId, eventId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.events(organizationId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.orgStats(organizationId) });
    },
    onError: (err) => setError(getApiErrorMessage(err)),
  });

  if (!canManage) return null;

  function handleTransition(next: EventStatus) {
    // CANCELLED triggers a notification to every buyer with a paid order on
    // this event server-side — worth a deliberate pause before firing.
    if (next === 'CANCELLED' && !window.confirm('Annuler cet évènement notifiera tous les acheteurs ayant déjà payé. Continuer ?')) {
      return;
    }
    mutation.mutate(next);
  }

  const nextStatuses = ALLOWED_TRANSITIONS[status];

  return (
    <div>
      {error && <InlineBanner tone="error">{error}</InlineBanner>}
      {nextStatuses.length === 0 ? (
        <p className="text-sm text-text-muted">Statut définitif — aucune transition possible.</p>
      ) : (
        <div className="flex flex-wrap gap-2.5">
          {nextStatuses.map((next) => (
            <Button
              key={next}
              type="button"
              variant={next === 'CANCELLED' ? 'ghost' : 'primary'}
              loading={mutation.isPending && mutation.variables === next}
              disabled={mutation.isPending}
              onClick={() => handleTransition(next)}
            >
              {ACTION_LABELS[next]}
            </Button>
          ))}
        </div>
      )}
    </div>
  );
}
