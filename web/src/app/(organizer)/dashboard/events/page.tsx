'use client';

import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';
import { apiClient } from '@/lib/api-client';
import { useCurrentUser } from '@/hooks/use-current-user';
import { queryKeys } from '@/lib/query-keys';
import { canManageEvents } from '@/lib/rbac';
import { Kicker } from '@/components/ui/kicker';
import { buttonClasses } from '@/components/ui/button';
import { EventStatusBadge } from '@/components/ui/status-badge';
import { EventCategoryBadge } from '@/components/events/category-badge';
import { ChevronRightIcon } from '@/components/ui/icons';
import type { Event } from '@/types';

export default function OrganizerEventsPage() {
  const { activeMembership } = useCurrentUser();
  const organizationId = activeMembership?.organizationId;
  const canManage = canManageEvents(activeMembership?.role);

  const eventsQuery = useQuery<Event[]>({
    queryKey: queryKeys.events(organizationId),
    queryFn: async () => (await apiClient.get(`/organizations/${organizationId}/events`)).data,
    enabled: !!organizationId,
  });

  if (eventsQuery.isLoading) {
    return <main className="px-9 py-[30px] text-sm text-text-muted">Chargement...</main>;
  }

  if (eventsQuery.isError) {
    return <main className="px-9 py-[30px] text-sm text-text-muted">Impossible de charger les évènements.</main>;
  }

  const events = eventsQuery.data ?? [];

  return (
    <main className="px-9 py-[30px] pb-[50px]">
      <div className="mb-[30px] flex items-center justify-between">
        <div>
          <Kicker />
          <h1 className="text-2xl font-black uppercase tracking-[-0.01em]">Évènements</h1>
        </div>
        {canManage && (
          <Link href="/dashboard/events/new" className={buttonClasses('primary')}>
            Nouvel évènement
          </Link>
        )}
      </div>

      {events.length === 0 ? (
        <p className="text-sm text-text-muted">Aucun évènement pour l&apos;instant.</p>
      ) : (
        <div className="overflow-x-auto rounded-card border-[1.5px] border-border bg-card">
          <table className="w-full min-w-[640px] border-collapse">
            <thead>
              <tr>
                {['Évènement', 'Catégorie', 'Lieu', 'Dates', 'Statut', ''].map((h) => (
                  <th
                    key={h}
                    className="border-b-[1.5px] border-border px-5 py-3 text-left text-[11px] font-bold uppercase tracking-[0.04em] text-text-muted"
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {events.map((event) => (
                <tr key={event.id}>
                  <td className="border-b border-border px-5 py-[13px] text-[13px]">
                    <div className="font-bold">{event.name}</div>
                    <div className="text-xs text-text-muted">{event.slug}</div>
                  </td>
                  <td className="border-b border-border px-5 py-[13px] text-[13px] text-text-muted">
                    {event.category ? <EventCategoryBadge category={event.category} /> : '—'}
                  </td>
                  <td className="border-b border-border px-5 py-[13px] text-[13px] text-text-muted">{event.venueName || '—'}</td>
                  <td className="border-b border-border px-5 py-[13px] text-[13px] text-text-muted">
                    {format(new Date(event.startAt), 'd MMM yyyy', { locale: fr })}
                  </td>
                  <td className="border-b border-border px-5 py-[13px] text-[13px]">
                    <EventStatusBadge status={event.status} />
                  </td>
                  <td className="border-b border-border px-5 py-[13px] text-right text-[13px]">
                    <Link
                      href={`/dashboard/events/${event.id}`}
                      className="inline-flex items-center gap-1 font-bold text-indigo"
                    >
                      Ouvrir <ChevronRightIcon className="h-3.5 w-3.5" />
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </main>
  );
}
