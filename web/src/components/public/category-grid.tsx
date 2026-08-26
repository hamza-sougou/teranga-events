'use client';

import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { Icon } from '@iconify/react/offline';
import { apiClient } from '@/lib/api-client';
import { queryKeys } from '@/lib/query-keys';
import { Kicker } from '@/components/ui/kicker';
import { CATEGORY_ICONS } from '@/lib/category-icons';
import type { EventCategory } from '@/types';

// GET /discover/by-category/:slug returns one category at a time — it's not
// a homepage aggregate, so this section is a grid of links out to
// /events?category=..., not another EventCard row. Reuses the same
// GET /event-categories query PublicNavbarCategories already caches, so this
// never fires a second network request in the same session.
export function CategoryGrid() {
  const categoriesQuery = useQuery<EventCategory[]>({
    queryKey: queryKeys.eventCategories(),
    queryFn: async () => (await apiClient.get('/event-categories')).data,
  });
  const categories = categoriesQuery.data ?? [];

  if (categories.length === 0) return null;

  return (
    <section className="bg-bg py-10">
      <div className="mx-auto max-w-6xl px-6 sm:px-10">
        <Kicker tone="light" />
        <h2 className="mb-4 text-lg font-black uppercase tracking-[-0.01em] text-text">Par catégorie</h2>

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {categories.map((category) => (
            <Link
              key={category.id}
              href={`/events?category=${category.slug}`}
              className="flex flex-col items-center gap-2 rounded-card border-[1.5px] border-border bg-card px-4 py-5 text-center transition-colors hover:border-indigo hover:text-indigo"
            >
              <Icon icon={CATEGORY_ICONS[category.icon]} className="h-6 w-6" />
              <span className="text-[13px] font-bold">{category.label}</span>
            </Link>
          ))}
        </div>
      </div>
    </section>
  );
}
