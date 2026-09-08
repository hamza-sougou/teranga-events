'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';
import { queryKeys } from '@/lib/query-keys';
import { Panel } from '@/components/ui/panel';
import type { Event, EventMedia, TicketType } from '@/types';
import { WizardStepper } from './wizard-stepper';
import { StepDetails } from './step-details';
import { StepLocation } from './step-location';
import { StepMedia } from './step-media';
import { StepTickets } from './step-tickets';
import { StepOptionalInfo } from './step-optional-info';
import { StepRecap } from './step-recap';
import { CancelDraftAction } from './cancel-draft-action';
import { computeStepCompletion, computeStartingStep, type WizardStepId } from './completion';

interface EventWizardProps {
  organizationId: string;
  // null on a brand-new draft (the /new route) — set as soon as step 1's
  // create call succeeds, from then on identical to the [id] route's case.
  eventId: string | null;
}

// Orchestrates the 6-step creation flow (see docs/DESIGN_SYSTEM.md §3 and
// PROGRESS.md for the rationale) — replaces the old short create form +
// flat edit page for as long as an event stays DRAFT. Once PUBLISHED, the
// event goes back through the existing flat edit view instead (see
// app/(organizer)/dashboard/events/[id]/page.tsx), so this component is
// only ever mounted for a DRAFT event.
export function EventWizard({ organizationId, eventId: initialEventId }: EventWizardProps) {
  const router = useRouter();
  const [eventId, setEventId] = useState(initialEventId);
  const [currentStep, setCurrentStep] = useState<WizardStepId | null>(initialEventId ? null : 'details');

  const eventQuery = useQuery<Event>({
    queryKey: queryKeys.event(organizationId, eventId ?? undefined),
    queryFn: async () => (await apiClient.get(`/organizations/${organizationId}/events/${eventId}`)).data,
    enabled: !!organizationId && !!eventId,
  });

  // Same query keys StepTickets/StepRecap's TicketTypesPanel and
  // StepMedia/StepRecap's EventMediaPanel use — shared cache entries, not
  // duplicate requests — needed here just to know live counts for the
  // starting-step and stepper completion calculation. Deliberately not
  // event.media: EventMediaPanel's upload flow updates this media query's
  // cache directly without ever refetching the event, so event.media would
  // show a stale count right after an upload (see completion.ts).
  const ticketTypesQuery = useQuery<TicketType[]>({
    queryKey: queryKeys.ticketTypes(organizationId, eventId ?? undefined),
    queryFn: async () => (await apiClient.get(`/organizations/${organizationId}/events/${eventId}/ticket-types`)).data,
    enabled: !!organizationId && !!eventId,
  });

  const mediaQuery = useQuery<EventMedia[]>({
    queryKey: queryKeys.media(organizationId, eventId ?? undefined),
    queryFn: async () => (await apiClient.get(`/organizations/${organizationId}/events/${eventId}/media`)).data,
    enabled: !!organizationId && !!eventId,
  });

  const event = eventQuery.data ?? null;
  const completion = computeStepCompletion(event, mediaQuery.data?.length ?? 0, ticketTypesQuery.data?.length ?? 0);

  // Resolve the starting step exactly once, when the relevant data first
  // finishes loading — never again afterwards, so revisiting a step via the
  // stepper isn't reset by a background refetch triggered by a save.
  useEffect(() => {
    if (currentStep !== null) return;
    if (!eventId) {
      setCurrentStep('details');
      return;
    }
    if (eventQuery.isLoading || ticketTypesQuery.isLoading || mediaQuery.isLoading) return;
    setCurrentStep(computeStartingStep(completion));
    // completion is derived fresh every render from the queries already in
    // this effect's deps — including it would refire on every data change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentStep, eventId, eventQuery.isLoading, ticketTypesQuery.isLoading, mediaQuery.isLoading]);

  function handleCreated(newEventId: string) {
    setEventId(newEventId);
    setCurrentStep('location');
    // Replace (not push): a back navigation from here should return to the
    // events list, not to a /new form pointing at an event that already
    // exists.
    router.replace(`/dashboard/events/${newEventId}`);
  }

  if (currentStep === null || (eventId && eventQuery.isLoading)) {
    return <p className="text-sm text-text-muted">Chargement...</p>;
  }

  return (
    <div className="max-w-[720px]">
      {eventId && <CancelDraftAction organizationId={organizationId} eventId={eventId} />}
      <WizardStepper current={currentStep} completion={completion} onSelect={setCurrentStep} />

      <Panel>
        {currentStep === 'details' && (
          <StepDetails
            organizationId={organizationId}
            eventId={eventId}
            event={event}
            onCreated={handleCreated}
            onNext={() => setCurrentStep('location')}
          />
        )}
        {currentStep === 'location' && event && eventId && (
          <StepLocation
            organizationId={organizationId}
            eventId={eventId}
            event={event}
            onBack={() => setCurrentStep('details')}
            onNext={() => setCurrentStep('media')}
          />
        )}
        {currentStep === 'media' && eventId && (
          <StepMedia
            organizationId={organizationId}
            eventId={eventId}
            onBack={() => setCurrentStep('location')}
            onNext={() => setCurrentStep('tickets')}
          />
        )}
        {currentStep === 'tickets' && eventId && (
          <StepTickets
            organizationId={organizationId}
            eventId={eventId}
            onBack={() => setCurrentStep('media')}
            onNext={() => setCurrentStep('optional')}
          />
        )}
        {currentStep === 'optional' && event && eventId && (
          <StepOptionalInfo
            organizationId={organizationId}
            eventId={eventId}
            event={event}
            onBack={() => setCurrentStep('tickets')}
            onNext={() => setCurrentStep('recap')}
          />
        )}
        {currentStep === 'recap' && event && eventId && (
          <StepRecap
            organizationId={organizationId}
            eventId={eventId}
            event={event}
            completion={completion}
            onGoToStep={setCurrentStep}
          />
        )}
      </Panel>
    </div>
  );
}
