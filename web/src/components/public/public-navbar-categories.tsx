'use client';

import { FormEvent, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { Icon } from '@iconify/react/offline';
import { AnimatePresence, motion } from 'motion/react';
import { apiClient } from '@/lib/api-client';
import { queryKeys } from '@/lib/query-keys';
import { CATEGORY_ICONS } from '@/lib/category-icons';
import { Input } from '@/components/ui/input';
import { SearchIcon } from '@/components/ui/icons';
import { usePublicNavbarVisibility } from './public-navbar-context';
import type { EventCategory } from '@/types';

// Visibility comes entirely from PublicNavbarVisibilityContext (see
// public-navbar-context.tsx) — this component takes no visibility prop of
// its own, so a future page can hide/reveal it via the shared hook without
// ever touching this file.
//
// Single responsive strategy at every width: categories scroll horizontally
// in their own container (never the page body) rather than wrapping or
// collapsing into a menu — per docs/DESIGN_SYSTEM.md, a category must always
// be a directly visible pill, never behind a dropdown/accordion. The search
// box keeps a fixed width so it never gets squeezed away.
export function PublicNavbarCategories() {
  const { categoriesVisible } = usePublicNavbarVisibility();
  const router = useRouter();
  const [search, setSearch] = useState('');

  const categoriesQuery = useQuery<EventCategory[]>({
    queryKey: queryKeys.eventCategories(),
    queryFn: async () => (await apiClient.get('/event-categories')).data,
  });
  const categories = categoriesQuery.data ?? [];

  function handleSearchSubmit(e: FormEvent) {
    e.preventDefault();
    const term = search.trim();
    router.push(term ? `/events?q=${encodeURIComponent(term)}` : '/events');
  }

  return (
    <AnimatePresence initial={false}>
      {categoriesVisible && (
        <motion.div
          key="categories"
          initial={{ height: 0, opacity: 0 }}
          animate={{ height: 'auto', opacity: 1 }}
          exit={{ height: 0, opacity: 0 }}
          transition={{ duration: 0.2 }}
          className="overflow-hidden"
        >
          <div className="mx-auto flex max-w-6xl items-center gap-3 px-6 py-3 sm:px-10">
            <div className="flex flex-1 gap-2 overflow-x-auto">
              {categories.map((category) => (
                <Link
                  key={category.id}
                  href={`/events?category=${category.slug}`}
                  className="flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded border-[1.5px] border-border bg-card px-3 py-1.5 text-[13px] font-semibold text-text transition-colors hover:border-indigo hover:text-indigo"
                >
                  <Icon icon={CATEGORY_ICONS[category.icon]} className="h-[15px] w-[15px]" />
                  {category.label}
                </Link>
              ))}
            </div>

            <form onSubmit={handleSearchSubmit} className="flex w-[170px] shrink-0 items-center gap-1.5 sm:w-[220px]">
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Rechercher..."
                aria-label="Rechercher un évènement"
                className="py-1.5 text-[13px]"
              />
              <button
                type="submit"
                aria-label="Rechercher"
                className="flex h-[33px] w-[33px] shrink-0 items-center justify-center rounded border-[1.5px] border-border bg-card text-text-muted transition-colors hover:border-indigo hover:text-indigo"
              >
                <SearchIcon className="h-4 w-4" />
              </button>
            </form>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
