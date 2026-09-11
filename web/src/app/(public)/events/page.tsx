'use client';

import { useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { Icon } from '@iconify/react/offline';
import { apiClient } from '@/lib/api-client';
import { queryKeys } from '@/lib/query-keys';
import { CATEGORY_ICONS } from '@/lib/category-icons';
import { cn } from '@/lib/utils';
import { Kicker } from '@/components/ui/kicker';
import { Button } from '@/components/ui/button';
import { SearchIcon } from '@/components/ui/icons';
import { EventCard, type EventCardData } from '@/components/public/event-card';
import type { EventCategory } from '@/types';

const PAGE_SIZE = 20;

interface PublicEventsListResponse {
  items: EventCardData[];
  total: number;
  page: number;
  limit: number;
}

// Listing/search page that finally backs the `/events?category=...`/`/events?q=...`
// links already emitted by PublicNavbarCategories, CategoryGrid, PublicFooter's
// "Découvrir" column and HomeHero's search bar (all pre-existing, all
// previously 404ing — see PROGRESS.md §12nonies). No change needed to any of
// them: they already point here.
export default function EventsListPage() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const category = searchParams.get('category') ?? undefined;
  const q = searchParams.get('q') ?? undefined;

  // Local page counter + accumulated items, not useInfiniteQuery — no
  // precedent for that hook anywhere in this codebase, and "Charger plus"
  // only ever appends one more page on top of what's already rendered.
  const [page, setPage] = useState(1);
  const [items, setItems] = useState<EventCardData[]>([]);

  // A category/search change starts a fresh list, never appends onto the
  // previous filter's results.
  useEffect(() => {
    setPage(1);
    setItems([]);
  }, [category, q]);

  const categoriesQuery = useQuery<EventCategory[]>({
    queryKey: queryKeys.eventCategories(),
    queryFn: async () => (await apiClient.get('/event-categories')).data,
  });
  const categories = categoriesQuery.data ?? [];
  const activeCategory = categories.find((c) => c.slug === category);

  const listQuery = useQuery<PublicEventsListResponse>({
    queryKey: queryKeys.publicEventsList({ category, q, page }),
    queryFn: async () => (await apiClient.get('/events', { params: { category, q, page, limit: PAGE_SIZE } })).data,
  });

  useEffect(() => {
    if (!listQuery.data) return;
    setItems((prev) => (listQuery.data!.page === 1 ? listQuery.data!.items : [...prev, ...listQuery.data!.items]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [listQuery.data]);

  function goToCategory(slug: string | null) {
    const params = new URLSearchParams(searchParams.toString());
    if (slug) params.set('category', slug);
    else params.delete('category');
    router.push(`/events${params.toString() ? `?${params.toString()}` : ''}`);
  }

  const total = listQuery.data?.total ?? 0;
  const hasMore = items.length < total;
  const isInitialLoading = listQuery.isLoading && page === 1;
  const hasActiveFilter = Boolean(category || q);

  const title = activeCategory ? activeCategory.label : q ? `Résultats pour « ${q} »` : 'Tous les évènements';

  return (
    <main className="mx-auto max-w-6xl px-6 py-10 sm:px-10">
      <Kicker />
      <h1 className="mb-6 text-2xl font-black uppercase tracking-[-0.01em] text-text sm:text-3xl">{title}</h1>

      {/* {categories.length > 0 && (
        <div className="mb-8 flex gap-2 overflow-x-auto pb-1">
          <CategoryChip label="Tous" active={!category} onClick={() => goToCategory(null)} />
          {categories.map((c) => (
            <CategoryChip
              key={c.id}
              label={c.label}
              icon={CATEGORY_ICONS[c.icon]}
              active={c.slug === category}
              onClick={() => goToCategory(c.slug)}
            />
          ))}
        </div>
      )} */}

      {isInitialLoading ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="h-[228px] animate-pulse rounded-card bg-card" />
          ))}
        </div>
      ) : items.length === 0 ? (
        <div className="flex flex-col items-center gap-3 py-20 text-center">
          <SearchIcon className="h-8 w-8 text-text-muted" />
          <p className="text-sm font-semibold text-text-muted">
            {hasActiveFilter ? 'Aucun évènement ne correspond à votre recherche.' : 'Aucun évènement disponible pour le moment.'}
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
              <Button variant="ghost" loading={listQuery.isFetching} onClick={() => setPage((p) => p + 1)}>
                Charger plus
              </Button>
            </div>
          )}
        </>
      )}
    </main>
  );
}

function CategoryChip({
  label,
  icon,
  active,
  onClick,
}: {
  label: string;
  icon?: Parameters<typeof Icon>[0]['icon'];
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded border-[1.5px] px-3 py-1.5 text-[13px] font-semibold transition-colors',
        active
          ? 'border-indigo bg-indigo text-white'
          : 'border-border bg-card text-text hover:border-indigo hover:text-indigo',
      )}
    >
      {icon && <Icon icon={icon} className="h-[15px] w-[15px]" />}
      {label}
    </button>
  );
}
