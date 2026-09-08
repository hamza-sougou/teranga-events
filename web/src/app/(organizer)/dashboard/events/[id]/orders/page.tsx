'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';
import { useCurrentUser } from '@/hooks/use-current-user';
import { queryKeys } from '@/lib/query-keys';
import { Kicker } from '@/components/ui/kicker';
import { ArrowLeftIcon } from '@/components/ui/icons';
import { OrdersPanel } from '@/components/events/orders-panel';
import type { Event } from '@/types';

export default function EventOrdersPage() {
  const { id: eventId } = useParams<{ id: string }>();
  const { activeMembership } = useCurrentUser();
  const organizationId = activeMembership?.organizationId;

  const eventQuery = useQuery<Event>({
    queryKey: queryKeys.event(organizationId, eventId),
    queryFn: async () => (await apiClient.get(`/organizations/${organizationId}/events/${eventId}`)).data,
    enabled: !!organizationId && !!eventId,
  });

  if (eventQuery.isLoading) {
    return <main className="px-9 py-[30px] text-sm text-text-muted">Chargement...</main>;
  }

  if (eventQuery.isError || !eventQuery.data) {
    return <main className="px-9 py-[30px] text-sm text-text-muted">Impossible de charger cet évènement.</main>;
  }

  const event = eventQuery.data;

  return (
    <main className="px-9 py-[30px] pb-[50px]">
      <div className="mb-[30px]">
        <Link
          href={`/dashboard/events/${eventId}`}
          className="mb-3 inline-flex items-center gap-1.5 text-[12px] font-bold text-text-muted hover:text-text"
        >
          <ArrowLeftIcon className="h-3.5 w-3.5" /> {event.name}
        </Link>
        <Kicker />
        <h1 className="text-2xl font-black uppercase tracking-[-0.01em]">Ventes</h1>
      </div>

      <OrdersPanel organizationId={organizationId!} eventId={eventId} eventSlug={event.slug} />
    </main>
  );
}
