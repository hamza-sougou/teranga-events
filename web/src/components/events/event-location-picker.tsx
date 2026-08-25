'use client';

import { useEffect, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import { useMutation } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';
import { getApiErrorMessage } from '@/lib/api-errors';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { SearchIcon } from '@/components/ui/icons';
import type { NormalizedPlace } from '@/types';

// Leaflet touches window/document — must never render during SSR.
const EventLocationMap = dynamic(() => import('./event-location-map'), {
  ssr: false,
  loading: () => <div className="h-[320px] rounded border-[1.5px] border-border bg-bg" />,
});

export interface LocationSelection {
  venueName: string;
  country: string;
  city: string;
  address: string;
  latitude: number;
  longitude: number;
}

interface EventLocationPickerProps {
  id?: string;
  disabled?: boolean;
  latitude: number | null;
  longitude: number | null;
  onSelectResult: (result: LocationSelection) => void;
  onMapClick: (lat: number, lng: number) => void;
}

// Structurally mirrors CategorySelect (components/events/category-select.tsx)
// for the results dropdown — open/close state, outside-click to close, same
// <ul role="listbox"> token classes — but is a text search rather than a
// fixed-list picker, so it owns its own query state instead of a form field.
export function EventLocationPicker({
  id,
  disabled,
  latitude,
  longitude,
  onSelectResult,
  onMapClick,
}: EventLocationPickerProps) {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const searchMutation = useMutation({
    mutationFn: async (q: string) => (await apiClient.get<NormalizedPlace[]>('/geocode/search', { params: { q } })).data,
    onSuccess: () => setOpen(true),
  });

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

  function runSearch() {
    const trimmed = query.trim();
    if (trimmed.length < 2 || disabled) return;
    searchMutation.mutate(trimmed);
  }

  function selectResult(place: NormalizedPlace) {
    onSelectResult({
      // Per spec: Lieu is what the organizer typed, never a Nominatim field.
      venueName: query,
      country: place.country,
      city: place.city,
      address: place.district,
      latitude: place.latitude,
      longitude: place.longitude,
    });
    setOpen(false);
  }

  return (
    <div>
      <div ref={containerRef} className="relative">
        <div className="flex flex-col gap-2 sm:flex-row">
          <Input
            id={id}
            value={query}
            disabled={disabled}
            placeholder="Nom du lieu, quartier, ville..."
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                runSearch();
              }
            }}
          />
          <Button
            type="button"
            variant="ghost"
            disabled={disabled || query.trim().length < 2}
            loading={searchMutation.isPending}
            onClick={runSearch}
          >
            {!searchMutation.isPending && <SearchIcon className="h-4 w-4" />}
            Rechercher
          </Button>
        </div>

        {open && (
          // z-[1001]: deliberately above CategorySelect's plain z-10 — Leaflet's
          // own panes/controls sit up to z-index ~1000, so a lower value here
          // would let the map beneath render over a long results list.
          <ul
            role="listbox"
            className="absolute z-[1001] mt-1.5 max-h-64 w-full overflow-y-auto rounded border-[1.5px] border-border bg-card py-1 shadow-lg"
          >
            {searchMutation.data?.length === 0 && (
              <li className="px-3 py-2 text-[13px] text-text-muted">
                Aucun résultat — utilisez la carte pour placer le point manuellement.
              </li>
            )}
            {searchMutation.data?.map((place) => (
              <li key={place.placeId} role="option">
                <button
                  type="button"
                  onClick={() => selectResult(place)}
                  className="block w-full px-3 py-2 text-left text-[13px] hover:bg-bg"
                >
                  <div className="font-semibold">{place.name}</div>
                  <div className="text-text-muted">{place.displayName}</div>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {searchMutation.isError && (
        <p className="mt-1.5 text-[11px] font-semibold text-danger">
          {getApiErrorMessage(
            searchMutation.error,
            'Recherche indisponible. Réessayez ou placez le point manuellement sur la carte.',
          )}
        </p>
      )}

      <div className="mt-3">
        <EventLocationMap latitude={latitude} longitude={longitude} onMapClick={onMapClick} disabled={disabled} />
      </div>
    </div>
  );
}
