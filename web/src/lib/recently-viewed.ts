import type { EventCardData } from '@/components/public/event-card';

const STORAGE_KEY = 'zen-events:recently-viewed';
const MAX_ENTRIES = 16;

// docs/SPEC.md §9.1 — "Vus récemment" is 100% client-side, no backend list-
// by-ids endpoint exists (nor should one, per the spec). So the full card
// snapshot is stored here at view time, not just an id — the event detail
// page already has everything needed (fromPrice/currency it already
// computes for BuyPanel/StickyBuyBar) to build one without a second fetch.
export function pushRecentlyViewed(event: EventCardData): void {
  if (typeof window === 'undefined') return;
  try {
    const existing = getRecentlyViewed().filter((e) => e.id !== event.id);
    const next = [event, ...existing].slice(0, MAX_ENTRIES);
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    // Private browsing / storage disabled — recently-viewed is a nicety, never fatal.
  }
}

export function getRecentlyViewed(): EventCardData[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}
