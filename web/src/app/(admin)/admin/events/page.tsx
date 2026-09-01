'use client';

import { useState } from 'react';
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';
import { queryKeys } from '@/lib/query-keys';
import { getApiErrorMessage } from '@/lib/api-errors';
import { Kicker } from '@/components/ui/kicker';
import { Panel } from '@/components/ui/panel';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { InlineBanner } from '@/components/ui/inline-banner';
import { Button } from '@/components/ui/button';
import { RowMenu } from '@/components/ui/row-menu';
import { EventStatusBadge } from '@/components/ui/status-badge';
import type { AdminEventListItem, EventStatus } from '@/types';

// Mirrors ALLOWED_TRANSITIONS in backend/src/events/events.service.ts —
// only a DRAFT or PUBLISHED event has an outgoing transition to CANCELLED,
// same client-side mirror already used organizer-side in event-status-control.tsx.
const CANCELLABLE_STATUSES: EventStatus[] = ['DRAFT', 'PUBLISHED'];

interface Filters {
  organizationId: string;
  status: string;
  from: string;
  to: string;
  q: string;
}

const EMPTY_FILTERS: Filters = { organizationId: '', status: '', from: '', to: '', q: '' };

export default function AdminEventsPage() {
  const queryClient = useQueryClient();
  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS);
  const [appliedFilters, setAppliedFilters] = useState<Filters>(EMPTY_FILTERS);
  const [actionError, setActionError] = useState<string | null>(null);

  const queryParams = Object.fromEntries(Object.entries(appliedFilters).filter(([, v]) => v));

  const eventsQuery = useQuery<AdminEventListItem[]>({
    queryKey: queryKeys.adminEvents(queryParams),
    queryFn: async () => (await apiClient.get('/admin/events', { params: queryParams })).data,
  });

  const cancelMutation = useMutation({
    mutationFn: ({ eventId, reason }: { eventId: string; reason?: string }) =>
      apiClient.patch(`/admin/events/${eventId}/cancel`, { reason }),
    onSuccess: () => {
      setActionError(null);
      queryClient.invalidateQueries({ queryKey: queryKeys.adminEvents() });
    },
    onError: (err) => setActionError(getApiErrorMessage(err)),
  });

  function handleCancel(event: AdminEventListItem) {
    if (!window.confirm(`Annuler "${event.name}" (${event.organization.name}) ? Les acheteurs payés seront notifiés.`)) {
      return;
    }
    const reason = window.prompt('Raison (optionnelle, journalisée pour audit) :') ?? undefined;
    cancelMutation.mutate({ eventId: event.id, reason: reason || undefined });
  }

  const events = eventsQuery.data ?? [];

  return (
    <main className="px-9 py-[30px] pb-[50px]">
      <div className="mb-[30px]">
        <Kicker />
        <h1 className="text-2xl font-black uppercase tracking-[-0.01em]">Évènements</h1>
        <p className="mt-1.5 text-[13px] text-text-muted">
          Modérez les évènements de toute la plateforme, toutes organisations confondues.
        </p>
      </div>

      <Panel className="mb-5">
        <form
          className="flex flex-wrap items-end gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            setAppliedFilters(filters);
          }}
        >
          <div className="min-w-[200px] flex-1">
            <label className="mb-1 block text-[11px] font-bold uppercase tracking-[0.04em] text-text-muted">
              Recherche
            </label>
            <Input
              placeholder="Nom d'évènement ou d'organisation"
              value={filters.q}
              onChange={(e) => setFilters((f) => ({ ...f, q: e.target.value }))}
            />
          </div>
          <div>
            <label className="mb-1 block text-[11px] font-bold uppercase tracking-[0.04em] text-text-muted">
              Statut
            </label>
            <Select value={filters.status} onChange={(e) => setFilters((f) => ({ ...f, status: e.target.value }))}>
              <option value="">Tous</option>
              <option value="DRAFT">Brouillon</option>
              <option value="PUBLISHED">Publié</option>
              <option value="CANCELLED">Annulé</option>
              <option value="COMPLETED">Terminé</option>
            </Select>
          </div>
          <div>
            <label className="mb-1 block text-[11px] font-bold uppercase tracking-[0.04em] text-text-muted">
              Du
            </label>
            <Input type="date" value={filters.from} onChange={(e) => setFilters((f) => ({ ...f, from: e.target.value }))} />
          </div>
          <div>
            <label className="mb-1 block text-[11px] font-bold uppercase tracking-[0.04em] text-text-muted">
              Au
            </label>
            <Input type="date" value={filters.to} onChange={(e) => setFilters((f) => ({ ...f, to: e.target.value }))} />
          </div>
          <Button type="submit">Filtrer</Button>
        </form>
      </Panel>

      <Panel>
        {actionError && <InlineBanner tone="error">{actionError}</InlineBanner>}

        {eventsQuery.isLoading ? (
          <p className="text-sm text-text-muted">Chargement...</p>
        ) : eventsQuery.isError ? (
          <p className="text-sm text-text-muted">Impossible de charger les évènements.</p>
        ) : events.length === 0 ? (
          <p className="py-10 text-center text-sm text-text-muted">Aucun évènement ne correspond à ces filtres.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse">
              <thead>
                <tr>
                  {['Évènement', 'Organisation', 'Catégorie', 'Statut', 'Date', ''].map((h) => (
                    <th
                      key={h}
                      className="border-b-[1.5px] border-border pb-2.5 text-left text-[11px] font-bold uppercase tracking-[0.04em] text-text-muted"
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {events.map((event) => (
                  <tr key={event.id}>
                    <td className="border-b border-border py-[13px] text-[13px] font-bold">{event.name}</td>
                    <td className="border-b border-border py-[13px] text-[13px]">{event.organization.name}</td>
                    <td className="border-b border-border py-[13px] text-[13px] text-text-muted">
                      {event.category?.label ?? '—'}
                    </td>
                    <td className="border-b border-border py-[13px] text-[13px]">
                      <EventStatusBadge status={event.status} />
                    </td>
                    <td className="border-b border-border py-[13px] text-[13px] text-text-muted">
                      {format(new Date(event.startAt), 'd MMM yyyy', { locale: fr })}
                    </td>
                    <td className="border-b border-border py-[13px] text-right text-[13px]">
                      {CANCELLABLE_STATUSES.includes(event.status) && (
                        <RowMenu
                          items={[{ label: "Annuler l'évènement", tone: 'danger', onClick: () => handleCancel(event) }]}
                        />
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
    </main>
  );
}
