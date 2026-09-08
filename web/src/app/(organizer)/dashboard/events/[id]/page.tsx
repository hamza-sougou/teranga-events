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
import { PanelLinkCard } from '@/components/ui/panel-link-card';
import { InlineBanner } from '@/components/ui/inline-banner';
import { EventStatusBadge } from '@/components/ui/status-badge';
import { EventForm, type EventFormSubmitPayload } from '@/components/events/event-form';
import { EventStatusControl } from '@/components/events/event-status-control';
import { TicketTypesPanel } from '@/components/events/ticket-types-panel';
import { EventMediaPanel } from '@/components/events/event-media-panel';
import { EventWizard } from '@/components/events/wizard/event-wizard';
import type { Event, Order, Scan } from '@/types';

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

  // Same query keys OrdersPanel/ScansPanel use on their own dedicated pages
  // (.../events/[id]/orders, .../scans) — fetched here only for the summary
  // cards' count + "most recent" line, so the cache is already warm if the
  // organizer clicks through.
  const ordersQuery = useQuery<Order[]>({
    queryKey: queryKeys.orders(organizationId, eventId),
    queryFn: async () => (await apiClient.get(`/organizations/${organizationId}/events/${eventId}/orders`)).data,
    enabled: !!organizationId && !!eventId,
  });

  const scansQuery = useQuery<Scan[]>({
    queryKey: queryKeys.scans(organizationId, eventId),
    queryFn: async () => (await apiClient.get(`/organizations/${organizationId}/events/${eventId}/scans`)).data,
    enabled: !!organizationId && !!eventId,
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
  const orders = ordersQuery.data ?? [];
  const scans = scansQuery.data ?? [];
  // Both endpoints already order desc by date server-side (see orders-panel.tsx
  // /scans-panel.tsx) — the first item is simply the most recent one.
  const lastOrder = orders[0];
  const lastScan = scans[0];

  // The step-by-step wizard is a first-construction tool, not a permanent
  // editing mode: only a DRAFT event an actual manager can edit goes through
  // it. A DRAFT viewed by someone without manage rights (or any non-DRAFT
  // status) falls back to this same flat view it always used, already
  // handling read-only display via canEdit/isLocked below — no separate
  // route or read-only variant of the wizard needed.
  if (event.status === 'DRAFT' && canManage) {
    return (
      <main className="px-9 py-[30px] pb-[50px]">
        <div className="mb-[30px]">
          <Kicker />
          <div className="flex items-center gap-2.5">
            <h1 className="text-2xl font-black uppercase tracking-[-0.01em]">{event.name || 'Nouvel évènement'}</h1>
            <EventStatusBadge status={event.status} />
          </div>
        </div>

        <EventWizard organizationId={organizationId!} eventId={eventId} />
      </main>
    );
  }

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
          <EventMediaPanel organizationId={organizationId!} eventId={eventId} canEdit={canEdit} />

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
        </div>

        <div>
          <Panel title="Statut">
            <EventStatusControl organizationId={organizationId!} eventId={eventId} status={event.status} canManage={canManage} />
          </Panel>

          <PanelLinkCard
            href={`/dashboard/events/${eventId}/orders`}
            title="Ventes"
            value={ordersQuery.isLoading ? '—' : orders.length}
            subLabel={lastOrder ? 'Dernière vente' : undefined}
            subValue={lastOrder ? format(new Date(lastOrder.createdAt), 'd MMM, HH:mm', { locale: fr }) : undefined}
          />

          <PanelLinkCard
            href={`/dashboard/events/${eventId}/scans`}
            title="Historique de scan"
            value={scansQuery.isLoading ? '—' : scans.length}
            subLabel={lastScan ? 'Dernier scan' : undefined}
            subValue={lastScan ? format(new Date(lastScan.scannedAt), 'd MMM, HH:mm', { locale: fr }) : undefined}
          />

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
