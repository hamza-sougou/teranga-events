'use client';

import { useParams } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';
import { apiClient } from '@/lib/api-client';
import { useCurrentUser } from '@/hooks/use-current-user';
import { queryKeys } from '@/lib/query-keys';
import { canManageEvents } from '@/lib/rbac';
import { getApiErrorMessage } from '@/lib/api-errors';
import { Kicker } from '@/components/ui/kicker';
import { Panel } from '@/components/ui/panel';
import { InlineBanner } from '@/components/ui/inline-banner';
import { EventStatusBadge } from '@/components/ui/status-badge';
import { EventForm, type EventFormSubmitPayload } from '@/components/events/event-form';
import { EventStatusControl } from '@/components/events/event-status-control';
import { TicketTypesPanel } from '@/components/events/ticket-types-panel';
import { EventMediaPanel } from '@/components/events/event-media-panel';
import type { Event } from '@/types';

export default function EventDetailPage() {
  const { id: eventId } = useParams<{ id: string }>();
  const queryClient = useQueryClient();
  const { activeMembership } = useCurrentUser();
  const organizationId = activeMembership?.organizationId;
  const canManage = canManageEvents(activeMembership?.role);

  const eventQuery = useQuery<Event>({
    queryKey: queryKeys.event(organizationId, eventId),
    queryFn: async () => (await apiClient.get(`/organizations/${organizationId}/events/${eventId}`)).data,
    enabled: !!organizationId && !!eventId,
  });

  const updateMutation = useMutation({
    mutationFn: (payload: EventFormSubmitPayload) =>
      apiClient.patch<Event>(`/organizations/${organizationId}/events/${eventId}`, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.event(organizationId, eventId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.events(organizationId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.orgStats(organizationId) });
    },
  });

  if (eventQuery.isLoading) {
    return <main className="px-9 py-[30px] text-sm text-text-muted">Chargement...</main>;
  }

  if (eventQuery.isError || !eventQuery.data) {
    return <main className="px-9 py-[30px] text-sm text-text-muted">Impossible de charger cet évènement.</main>;
  }

  const event = eventQuery.data;
  const isLocked = event.status === 'CANCELLED' || event.status === 'COMPLETED';
  const canEdit = canManage && !isLocked;

  return (
    <main className="px-9 py-[30px] pb-[50px]">
      <div className="mb-[30px]">
        <Kicker />
        <div className="flex items-center gap-2.5">
          <h1 className="text-2xl font-black uppercase tracking-[-0.01em]">{event.name}</h1>
          <EventStatusBadge status={event.status} />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-[18px] lg:grid-cols-[1.6fr_1fr]">
        <div>
          <Panel title="Détails">
            {updateMutation.isError && <InlineBanner tone="error">{getApiErrorMessage(updateMutation.error)}</InlineBanner>}
            {updateMutation.isSuccess && <InlineBanner tone="success">Évènement mis à jour.</InlineBanner>}
            <EventForm
              mode="edit"
              defaultValues={event}
              disabled={!canEdit}
              submitLabel="Enregistrer"
              submitting={updateMutation.isPending}
              onSubmit={(payload) => updateMutation.mutate(payload)}
            />
          </Panel>

          <TicketTypesPanel organizationId={organizationId!} eventId={eventId} canEdit={canEdit} />

          <EventMediaPanel organizationId={organizationId!} eventId={eventId} canEdit={canEdit} />
        </div>

        <div>
          <Panel title="Statut">
            <EventStatusControl organizationId={organizationId!} eventId={eventId} status={event.status} canManage={canManage} />
          </Panel>

          <Panel title="Informations">
            <dl className="space-y-2.5 text-[13px]">
              <div className="flex justify-between">
                <dt className="text-text-muted">Slug</dt>
                <dd className="font-semibold">{event.slug}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-text-muted">Créé le</dt>
                <dd className="font-semibold">{format(new Date(event.createdAt), 'd MMM yyyy', { locale: fr })}</dd>
              </div>
            </dl>
          </Panel>
        </div>
      </div>
    </main>
  );
}
