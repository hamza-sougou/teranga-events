'use client';

import { useEffect, useRef, useState } from 'react';
import { useParams } from 'next/navigation';
import dynamic from 'next/dynamic';
import { useQuery } from '@tanstack/react-query';
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';
import { apiClient } from '@/lib/api-client';
import { queryKeys } from '@/lib/query-keys';
import { Kicker } from '@/components/ui/kicker';
import { Panel } from '@/components/ui/panel';
import { EventCategoryBadge } from '@/components/events/category-badge';
import { EventHero } from '@/components/public/event-hero';
import { StickyBuyBar } from '@/components/public/sticky-buy-bar';
import { ShareButton } from '@/components/public/share-button';
import { PracticalInfo } from '@/components/public/practical-info';
import { ExpandableText } from '@/components/public/expandable-text';
import { BuyPanel } from '@/components/public/buy-panel';
import { OrganizerPanel } from '@/components/public/organizer-panel';
import { TicketSidesheet } from '@/components/public/ticket-sidesheet';
import type { PublicEvent, PublicTicketType } from '@/types';

// Leaflet touches window/document — must never render during SSR (same
// constraint as the organizer edit page's location picker).
const EventLocationMap = dynamic(() => import('@/components/events/event-location-map'), {
  ssr: false,
  loading: () => <div className="h-[320px] rounded border-[1.5px] border-border bg-bg" />,
});

export default function EventPage() {
  const { slug } = useParams<{ slug: string }>();
  const [sidesheetOpen, setSidesheetOpen] = useState(false);
  const [pastHero, setPastHero] = useState(false);
  const heroSentinelRef = useRef<HTMLDivElement>(null);

  const eventQuery = useQuery<PublicEvent>({
    queryKey: queryKeys.publicEvent(slug),
    queryFn: async () => (await apiClient.get(`/events/${slug}`)).data,
    enabled: !!slug,
  });

  const ticketTypesQuery = useQuery<PublicTicketType[]>({
    queryKey: queryKeys.publicTicketTypes(slug),
    queryFn: async () => (await apiClient.get(`/events/${slug}/ticket-types`)).data,
    enabled: !!slug,
  });

  // IntersectionObserver rather than a scroll listener — toggles the sticky
  // buy bar once the hero has scrolled out of view. Checked via the
  // sentinel's own boundingClientRect (top < 0 => scrolled above the
  // viewport), not `!entry.isIntersecting` — that flag is also true when the
  // sentinel simply hasn't entered the viewport yet, which happens on short
  // viewports now that the shared public navbar sits above the hero and can
  // push the sentinel below the fold even at scrollY 0.
  useEffect(() => {
    const el = heroSentinelRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(([entry]) => setPastHero(entry.boundingClientRect.top < 0), {
      threshold: 0,
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, [eventQuery.data]);

  if (eventQuery.isLoading) {
    return (
      <main className="flex min-h-screen items-center justify-center text-sm text-text-muted">Chargement...</main>
    );
  }

  if (eventQuery.isError || !eventQuery.data) {
    return (
      <main className="flex min-h-screen items-center justify-center text-sm text-text-muted">
        Évènement introuvable.
      </main>
    );
  }

  const event = eventQuery.data;
  const ticketTypes = ticketTypesQuery.data ?? [];
  const coverUrl = event.media.find((item) => item.type === 'IMAGE')?.url ?? null;
  const purchasable = ticketTypes.filter((tt) => tt.isOnSale && tt.available > 0);
  const fromPrice = purchasable.length > 0 ? Math.min(...purchasable.map((tt) => tt.displayPrice)) : null;
  const hasCoordinates = event.latitude != null && event.longitude != null;
  const hasPracticalInfo = event.minAge != null || event.dressCodes.length > 0;
  // "Lieu, Quartier • Ville" — short, no map, country never shown (Senegal-
  // only for now). Reused both under the title and in the Adresse section.
  const venueAndDistrict = [event.venueName, event.address].filter(Boolean).join(', ');
  const shortLocation = [venueAndDistrict, event.city].filter(Boolean).join(' • ');
  const formattedDate = format(new Date(event.startAt), "d MMMM yyyy 'à' HH:mm", { locale: fr });

  return (
    <main>
      <EventHero event={event} coverUrl={coverUrl} />
      <div ref={heroSentinelRef} />

      <StickyBuyBar
        visible={pastHero}
        eventName={event.name}
        fromPrice={fromPrice}
        onBuyClick={() => setSidesheetOpen(true)}
      />

      <div className="mx-auto max-w-6xl px-6 pt-8 sm:px-10">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            {event.category && <EventCategoryBadge category={event.category} />}
            <h1 className="mt-3 text-3xl font-black leading-tight text-text sm:text-5xl">{event.name}</h1>
            <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm font-semibold text-text-muted">
              {shortLocation && <span>{shortLocation}</span>}
              <span>{formattedDate}</span>
            </div>
          </div>
          <ShareButton title={event.name} />
        </div>
      </div>

      <div className="mx-auto max-w-6xl px-6 py-10 sm:px-10">
        {/* Right column already carries real content (buy panel/infos
            pratiques) today — "Sponsorisé" slots above/below it later
            without recutting this grid; "Évènements similaires" would be a
            new full-width section appended after this grid, same reasoning. */}
        <div className="grid grid-cols-1 gap-8 lg:grid-cols-[1.6fr_1fr]">
          <div>
            {event.description && (
              <div className="mb-8">
                <Kicker />
                <h2 className="mb-3 text-lg font-black uppercase tracking-[-0.01em]">À propos</h2>
                <ExpandableText text={event.description} />
              </div>
            )}

            <Panel title="Adresse">
              <div className="mb-4">
                <div className="font-bold text-text">{event.venueName || 'Lieu à confirmer'}</div>
                {(event.address || event.city) && (
                  <div className="text-[13px] font-semibold text-text-muted">
                    {[event.address, event.city].filter(Boolean).join(', ')}
                  </div>
                )}
              </div>
              {hasCoordinates && (
                <EventLocationMap
                  latitude={Number(event.latitude)}
                  longitude={Number(event.longitude)}
                  onMapClick={() => {}}
                  disabled
                />
              )}
            </Panel>

            <OrganizerPanel organizerName={event.organization.name} />
          </div>

          <div className="order-first lg:order-none">
            <BuyPanel fromPrice={fromPrice} onBuyClick={() => setSidesheetOpen(true)} />
            {hasPracticalInfo && (
              <Panel title="Infos pratiques">
                <PracticalInfo minAge={event.minAge} dressCodes={event.dressCodes} />
              </Panel>
            )}
          </div>
        </div>
      </div>

      <TicketSidesheet open={sidesheetOpen} onClose={() => setSidesheetOpen(false)} ticketTypes={ticketTypes} />
    </main>
  );
}
