'use client';

import { useEffect, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Icon } from '@iconify/react/offline';
import music from '@iconify-icons/lucide/music';
import sparkles from '@iconify-icons/lucide/sparkles';
import moon from '@iconify-icons/lucide/moon';
import award from '@iconify-icons/lucide/award';
import drama from '@iconify-icons/lucide/drama';
import presentation from '@iconify-icons/lucide/presentation';
import trophy from '@iconify-icons/lucide/trophy';
import shapes from '@iconify-icons/lucide/shapes';
import chevronDown from '@iconify-icons/lucide/chevron-down';
import { apiClient } from '@/lib/api-client';
import { queryKeys } from '@/lib/query-keys';
import { cn } from '@/lib/utils';
import type { EventCategory } from '@/types';

// Keyed by the `icon` string each event_categories row carries from the API
// (db/schema.sql §3B) — one static map, not a per-call-site import, since
// Iconify icons can't be pulled in via a dynamic path (docs/DESIGN_SYSTEM.md
// "Icônes").
const CATEGORY_ICONS: Record<string, typeof music> = {
  music,
  sparkles,
  moon,
  award,
  drama,
  presentation,
  trophy,
  shapes,
};

interface CategorySelectProps {
  id?: string;
  value?: string;
  onChange: (categoryId: string) => void;
  disabled?: boolean;
  invalid?: boolean;
}

// Custom dropdown rather than the native `Select` primitive: this is the one
// picker in the app that needs to show an icon per option, which a native
// <option> (plain text only) can't render. Inline-positioned, not a portal —
// it's a form field, not a page-level overlay like Modal.
export function CategorySelect({ id, value, onChange, disabled, invalid }: CategorySelectProps) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const categoriesQuery = useQuery<EventCategory[]>({
    queryKey: queryKeys.eventCategories(),
    queryFn: async () => (await apiClient.get('/event-categories')).data,
  });
  const categories = categoriesQuery.data ?? [];
  const selected = categories.find((category) => category.id === value);

  useEffect(() => {
    if (!open) return;
    function onPointerDown(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }
    document.addEventListener('mousedown', onPointerDown);
    window.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        id={id}
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className={cn(
          'flex w-full items-center justify-between rounded border-[1.5px] border-border bg-card px-3 py-2 text-left text-[13px] text-text outline-none transition-colors focus:border-indigo disabled:cursor-not-allowed disabled:bg-bg disabled:text-text-muted',
          invalid && 'border-danger focus:border-danger',
        )}
      >
        {selected ? (
          <span className="flex items-center gap-2">
            <Icon icon={CATEGORY_ICONS[selected.icon]} className="h-4 w-4 text-text-muted" />
            {selected.label}
          </span>
        ) : (
          <span className="text-text-muted">Sélectionner une catégorie</span>
        )}
        <Icon icon={chevronDown} className="h-4 w-4 text-text-muted" />
      </button>

      {open && (
        <ul
          role="listbox"
          className="absolute z-10 mt-1.5 max-h-64 w-full overflow-y-auto rounded border-[1.5px] border-border bg-card py-1 shadow-lg"
        >
          {categories.map((category) => (
            <li key={category.id} role="option" aria-selected={category.id === value}>
              <button
                type="button"
                onClick={() => {
                  onChange(category.id);
                  setOpen(false);
                }}
                className={cn(
                  'flex w-full items-center gap-2 px-3 py-2 text-left text-[13px] hover:bg-bg',
                  category.id === value && 'bg-bg font-bold',
                )}
              >
                <Icon icon={CATEGORY_ICONS[category.icon]} className="h-4 w-4 text-text-muted" />
                {category.label}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
