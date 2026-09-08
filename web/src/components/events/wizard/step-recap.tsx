'use client';

import dynamic from 'next/dynamic';
import { isAxiosError } from 'axios';
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';
import { queryKeys } from '@/lib/query-keys';
import { getApiErrorMessage } from '@/lib/api-errors';
import { Button } from '@/components/ui/button';
import { InlineBanner } from '@/components/ui/inline-banner';
import { EventCategoryBadge } from '@/components/events/category-badge';
import { EventMediaPanel } from '@/components/events/event-media-panel';
import { TicketTypesPanel } from '@/components/events/ticket-types-panel';
import type { Event } from '@/types';
import { MISSING_FIELD_LABELS, type WizardStepCompletion, type WizardStepId } from './completion';

const EventLocationMap = dynamic(() => import('@/components/events/event-location-map'), {
  ssr: false,
  loading: () => <div className="h-[220px] rounded border-[1.5px] border-border bg-bg" />,
});

interface StepRecapProps {
  organizationId: string;
  eventId: string;
  event: Event;
  completion: WizardStepCompletion;
  onGoToStep: (step: WizardStepId) => void;
}

const MISSING_FIELD_TO_STEP: Record<string, WizardStepId> = {
  name: 'details',
  category: 'details',
  address: 'location',
  media: 'media',
  ticketTypes: 'tickets',
};

export function StepRecap({ organizationId, eventId, event, completion, onGoToStep }: StepRecapProps) {
  const queryClient = useQueryClient();

  const publishMutation = useMutation({
    mutationFn: () => apiClient.patch<Event>(`/organizations/${organizationId}/events/${eventId}`, { status: 'PUBLISHED' }),
    onSuccess: (res) => {
      // [id]/page.tsx shares this exact query key — once it refetches with
      // status PUBLISHED, it stops rendering EventWizard entirely in favor
      // of the flat edit view, no explicit navigation needed here.
      queryClient.setQueryData(queryKeys.event(organizationId, eventId), res.data);
      queryClient.invalidateQueries({ queryKey: queryKeys.events(organizationId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.orgStats(organizationId) });
    },
  });

  // The client's own completion state drives the checklist proactively —
  // clicking "Publier" isn't even needed to see what's missing. The
  // backend's structured missingFields (from events.service.ts's publish
  // gate) is only consulted as a fallback if a publish attempt fails anyway,
  // e.g. a client/server drift or a race with another tab.
  const clientMissing: string[] = [];
  if (!completion.details) clientMissing.push(!event.name ? 'name' : 'category');
  if (!completion.location) clientMissing.push('address');
  if (!completion.media) clientMissing.push('media');
  if (!completion.tickets) clientMissing.push('ticketTypes');

  const serverMissing =
    publishMutation.isError && isAxiosError(publishMutation.error)
      ? ((publishMutation.error.response?.data as { missingFields?: string[] } | undefined)?.missingFields ?? null)
      : null;

  const missingFields = serverMissing ?? clientMissing;
  const canPublish = missingFields.length === 0;

  const latitude = event.latitude != null ? Number(event.latitude) : null;
  const longitude = event.longitude != null ? Number(event.longitude) : null;

  return (
    <div>
      {missingFields.length > 0 && (
        <InlineBanner tone="pending">
          <p className="mb-1.5">Encore quelques éléments avant de publier :</p>
          <ul className="list-inside list-disc space-y-1">
            {missingFields.map((field) => (
              <li key={field}>
                <button
                  type="button"
                  onClick={() => onGoToStep(MISSING_FIELD_TO_STEP[field] ?? 'details')}
                  className="underline underline-offset-2 hover:no-underline"
                >
                  {MISSING_FIELD_LABELS[field] ?? field}
                </button>
              </li>
            ))}
          </ul>
        </InlineBanner>
      )}
      {publishMutation.isError && !serverMissing && (
        <InlineBanner tone="error">{getApiErrorMessage(publishMutation.error)}</InlineBanner>
      )}

      <div className="mb-5">
        <div className="mb-2 flex flex-wrap items-center gap-2">
          <h2 className="text-lg font-black">{event.name || 'Sans nom'}</h2>
          {event.category && <EventCategoryBadge category={event.category} />}
        </div>
        <p className="text-[13px] text-text-muted">
          {format(new Date(event.startAt), "d MMM yyyy 'à' HH:mm", { locale: fr })} —{' '}
          {format(new Date(event.endAt), "d MMM yyyy 'à' HH:mm", { locale: fr })}
        </p>
        {event.description && <p className="mt-2.5 text-[13px] text-text">{event.description}</p>}
      </div>

      {event.address ? (
        <div className="mb-5">
          <p className="mb-1.5 text-[12px] font-bold text-text">
            {event.venueName ? `${event.venueName} — ` : ''}
            {event.address}
            {event.city ? `, ${event.city}` : ''}
          </p>
          <EventLocationMap latitude={latitude} longitude={longitude} onMapClick={() => {}} disabled />
        </div>
      ) : (
        <p className="mb-5 text-[13px] text-text-muted">Aucune adresse renseignée.</p>
      )}

      {(event.minAge != null || (event.dressCodes?.length ?? 0) > 0) && (
        <div className="mb-5 space-y-1 text-[13px]">
          {event.minAge != null && (
            <p>
              <span className="font-bold">Âge minimum : </span>
              {event.minAge} ans
            </p>
          )}
          {(event.dressCodes?.length ?? 0) > 0 && (
            <p>
              <span className="font-bold">Dress code : </span>
              {event.dressCodes!.map((d) => d.label).join(', ')}
            </p>
          )}
        </div>
      )}

      <EventMediaPanel organizationId={organizationId} eventId={eventId} canEdit={false} />
      <TicketTypesPanel organizationId={organizationId} eventId={eventId} canEdit={false} />

      <div className="flex gap-2.5">
        <Button type="button" variant="ghost" onClick={() => onGoToStep('optional')}>
          Précédent
        </Button>
        <Button type="button" disabled={!canPublish} loading={publishMutation.isPending} onClick={() => publishMutation.mutate()}>
          Publier
        </Button>
      </div>
    </div>
  );
}
