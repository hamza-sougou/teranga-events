import type { Event } from '@/types';

export const WIZARD_STEPS = ['details', 'location', 'media', 'tickets', 'optional', 'recap'] as const;
export type WizardStepId = (typeof WIZARD_STEPS)[number];

export interface WizardStepCompletion {
  details: boolean;
  location: boolean;
  media: boolean;
  tickets: boolean;
}

// Mirrors the publish-gate requirement in backend/src/events/events.service.ts
// (name, category, dates, address, ≥1 image, ≥1 ticket type). mediaCount and
// ticketTypeCount are passed in rather than read off `event.media` — that
// field only reflects whatever GET .../events/:eventId last returned, while
// EventMediaPanel's own upload flow updates a separate query-cache entry
// (queryKeys.media) directly without ever refetching the event itself, so
// reading event.media here would show stale "missing" state right after an
// upload until an unrelated refetch happened to occur.
export function computeStepCompletion(
  event: Pick<Event, 'name' | 'categoryId' | 'startAt' | 'endAt' | 'address'> | null,
  mediaCount: number,
  ticketTypeCount: number,
): WizardStepCompletion {
  return {
    details: !!event?.name && !!event?.categoryId && !!event?.startAt && !!event?.endAt,
    location: !!event?.address,
    media: mediaCount > 0,
    tickets: ticketTypeCount > 0,
  };
}

// Where a returning organizer lands: the first required step still
// incomplete, or the recap once everything required is done (step 5,
// "Bon à savoir", is optional and never forces a stop on its own).
export function computeStartingStep(completion: WizardStepCompletion): WizardStepId {
  if (!completion.details) return 'details';
  if (!completion.location) return 'location';
  if (!completion.media) return 'media';
  if (!completion.tickets) return 'tickets';
  return 'recap';
}

// The stepper allows free navigation back to any already-completed step, but
// forward only one step past the first incomplete one — never a full skip
// ahead. Once every required step is done, both the optional step and the
// recap unlock at once.
export function maxUnlockedStepIndex(completion: WizardStepCompletion): number {
  if (!completion.details) return 0;
  if (!completion.location) return 1;
  if (!completion.media) return 2;
  if (!completion.tickets) return 3;
  return 5;
}

export const MISSING_FIELD_LABELS: Record<string, string> = {
  name: 'Ajoutez un nom à votre évènement',
  category: 'Choisissez une catégorie',
  address: 'Renseignez une adresse',
  media: 'Ajoutez au moins une image',
  ticketTypes: 'Créez au moins un type de billet',
};
