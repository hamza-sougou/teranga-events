'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';
import { queryKeys } from '@/lib/query-keys';
import { cn } from '@/lib/utils';
import { Kicker } from '@/components/ui/kicker';
import { Panel } from '@/components/ui/panel';
import { Avatar } from '@/components/ui/avatar';
import { buttonClasses, Button } from '@/components/ui/button';
import { BadgeCheckIcon, MailIcon, CalendarIcon } from '@/components/ui/icons';
import { EventCard, type EventCardData } from '@/components/public/event-card';
import { OrganizerSubscribeWidget } from '@/components/public/organizer-subscribe-widget';
import { OrganizerContactModal } from '@/components/public/organizer-contact-modal';
import type { PublicOrganizerProfile } from '@/types';

type Tab = 'upcoming' | 'past';

interface PublicOrganizerEventsResponse {
  items: EventCardData[];
  total: number;
  page: number;
  limit: number;
}

export default function OrganizerProfilePage() {
  const { slug } = useParams<{ slug: string }>();
  const [tab, setTab] = useState<Tab>('upcoming');
  const [page, setPage] = useState(1);
  const [items, setItems] = useState<EventCardData[]>([]);
  const [contactOpen, setContactOpen] = useState(false);

  const profileQuery = useQuery<PublicOrganizerProfile>({
    queryKey: queryKeys.publicOrganizer(slug),
    queryFn: async () => (await apiClient.get(`/organizers/${slug}`)).data,
    enabled: !!slug,
  });

  // A tab switch (or landing on a different organizer) starts a fresh list,
  // never appends onto the previous tab's results — same reasoning as the
  // events listing page's category/search reset.
  useEffect(() => {
    setPage(1);
    setItems([]);
  }, [tab, slug]);

  const eventsQuery = useQuery<PublicOrganizerEventsResponse>({
    queryKey: queryKeys.publicOrganizerEvents(slug, tab, page),
    queryFn: async () =>
      (await apiClient.get(`/organizers/${slug}/events`, { params: { when: tab, page, limit: 20 } })).data,
    enabled: !!slug && !!profileQuery.data,
  });

  useEffect(() => {
    if (!eventsQuery.data) return;
    setItems((prev) => (eventsQuery.data!.page === 1 ? eventsQuery.data!.items : [...prev, ...eventsQuery.data!.items]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [eventsQuery.data]);

  if (profileQuery.isLoading) {
    return <main className="flex min-h-screen items-center justify-center text-sm text-text-muted">Chargement...</main>;
  }

  if (profileQuery.isError || !profileQuery.data) {
    return (
      <main className="flex min-h-screen items-center justify-center text-sm text-text-muted">
        Organisateur introuvable.
      </main>
    );
  }

  const organization = profileQuery.data;
  const total = eventsQuery.data?.total ?? 0;
  const hasMore = items.length < total;
  const isInitialLoading = eventsQuery.isLoading && page === 1;
  const hasAnyEvents = organization.publishedEventCount > 0;

  return (
    <main className="mx-auto max-w-6xl px-6 py-10 sm:px-10">
      <Kicker />

      <div className="mb-8 flex flex-wrap items-center gap-4">
        <div className="relative shrink-0">
          <Avatar name={organization.name} tone="indigo" size={72} />
          {organization.isVerified && (
            <span
              title="Organisateur de confiance"
              className="absolute -bottom-1 -right-1 flex h-6 w-6 items-center justify-center rounded-full bg-emerald text-white ring-2 ring-card"
            >
              <BadgeCheckIcon className="h-3.5 w-3.5" />
            </span>
          )}
        </div>

        <div className="min-w-0 flex-1">
          <h1 className="text-2xl font-black text-text sm:text-3xl">{organization.name}</h1>
          <div className="text-[13px] font-semibold text-text-muted">
            {organization.publishedEventCount} évènement{organization.publishedEventCount === 1 ? '' : 's'} organisé
            {organization.publishedEventCount === 1 ? '' : 's'}
          </div>
        </div>

        <button type="button" className={buttonClasses('ghost')} onClick={() => setContactOpen(true)}>
          <MailIcon className="h-4 w-4" />
          Contact
        </button>
      </div>

      <Panel title="Rester informé">
        <OrganizerSubscribeWidget organizationSlug={slug} variant="inline" />
      </Panel>

      <div className="mb-6 flex gap-2">
        <TabButton label="À venir" active={tab === 'upcoming'} onClick={() => setTab('upcoming')} />
        <TabButton label="Passés" active={tab === 'past'} onClick={() => setTab('past')} />
      </div>

      {isInitialLoading ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="h-[228px] animate-pulse rounded-card bg-card" />
          ))}
        </div>
      ) : items.length === 0 ? (
        <div className="flex flex-col items-center gap-3 py-20 text-center">
          <CalendarIcon className="h-8 w-8 text-text-muted" />
          <p className="text-sm font-semibold text-text-muted">
            {!hasAnyEvents
              ? "Cet organisateur n'a pas encore publié d'évènement."
              : tab === 'upcoming'
                ? 'Aucun évènement à venir pour le moment.'
                : 'Aucun évènement passé.'}
          </p>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {items.map((event) => (
              <EventCard key={event.id} event={event} className="w-full" />
            ))}
          </div>

          {hasMore && (
            <div className="mt-8 flex justify-center">
              <Button variant="ghost" loading={eventsQuery.isFetching} onClick={() => setPage((p) => p + 1)}>
                Charger plus
              </Button>
            </div>
          )}
        </>
      )}

      <OrganizerContactModal
        open={contactOpen}
        onClose={() => setContactOpen(false)}
        organizationSlug={slug}
        organizationName={organization.name}
      />
    </main>
  );
}

function TabButton({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'rounded border-[1.5px] px-3.5 py-1.5 text-[13px] font-semibold transition-colors',
        active ? 'border-indigo bg-indigo text-white' : 'border-border bg-card text-text hover:border-indigo hover:text-indigo',
      )}
    >
      {label}
    </button>
  );
}
