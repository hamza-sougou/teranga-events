'use client';

import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';
import { queryKeys } from '@/lib/query-keys';
import { getApiErrorMessage } from '@/lib/api-errors';
import { Input } from '@/components/ui/input';
import { FormField } from '@/components/ui/form-field';
import { Button } from '@/components/ui/button';
import { InlineBanner } from '@/components/ui/inline-banner';
import { EventLocationPicker } from '@/components/events/event-location-picker';
import type { Event } from '@/types';

interface StepLocationProps {
  organizationId: string;
  eventId: string;
  event: Event;
  onBack: () => void;
  onNext: () => void;
}

interface LocationState {
  venueName: string;
  country: string;
  city: string;
  address: string;
  latitude: number | null;
  longitude: number | null;
}

// Plain local state rather than react-hook-form: EventLocationPicker already
// reports fully-formed values via callbacks (see event-form.tsx for the
// same pattern), and the only validation this step needs — address
// non-empty — doesn't warrant pulling in a form library.
export function StepLocation({ organizationId, eventId, event, onBack, onNext }: StepLocationProps) {
  const queryClient = useQueryClient();
  const [values, setValues] = useState<LocationState>({
    venueName: event.venueName ?? '',
    country: event.country ?? '',
    city: event.city ?? '',
    address: event.address ?? '',
    latitude: event.latitude != null ? Number(event.latitude) : null,
    longitude: event.longitude != null ? Number(event.longitude) : null,
  });

  const mutation = useMutation({
    mutationFn: () =>
      apiClient.patch<Event>(`/organizations/${organizationId}/events/${eventId}`, {
        venueName: values.venueName || undefined,
        country: values.country || undefined,
        city: values.city || undefined,
        address: values.address || undefined,
        latitude: values.latitude ?? undefined,
        longitude: values.longitude ?? undefined,
      }),
    onSuccess: (res) => {
      queryClient.setQueryData(queryKeys.event(organizationId, eventId), res.data);
      onNext();
    },
  });

  const canProceed = values.address.trim().length > 0;

  return (
    <div>
      {mutation.isError && <InlineBanner tone="error">{getApiErrorMessage(mutation.error)}</InlineBanner>}

      <FormField
        label="Localisation"
        htmlFor="locationSearch"
        hint="Recherchez un lieu (OpenStreetMap) ou cliquez sur la carte pour placer le point manuellement."
      >
        <EventLocationPicker
          id="locationSearch"
          latitude={values.latitude}
          longitude={values.longitude}
          onSelectResult={(result) =>
            setValues((v) => ({
              ...v,
              country: result.country,
              city: result.city,
              address: result.address,
              venueName: result.venueName,
              latitude: result.latitude,
              longitude: result.longitude,
            }))
          }
          onMapClick={(lat, lng) => setValues((v) => ({ ...v, latitude: lat, longitude: lng }))}
        />
      </FormField>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <FormField label="Pays" htmlFor="country">
          <Input id="country" value={values.country} onChange={(e) => setValues((v) => ({ ...v, country: e.target.value }))} />
        </FormField>
        <FormField label="Ville" htmlFor="city">
          <Input id="city" value={values.city} onChange={(e) => setValues((v) => ({ ...v, city: e.target.value }))} />
        </FormField>
      </div>

      <FormField label="Quartier / Adresse" htmlFor="address" required hint="Requis pour publier l'évènement.">
        <Input id="address" value={values.address} onChange={(e) => setValues((v) => ({ ...v, address: e.target.value }))} />
      </FormField>

      <FormField label="Lieu" htmlFor="venueName">
        <Input id="venueName" value={values.venueName} onChange={(e) => setValues((v) => ({ ...v, venueName: e.target.value }))} />
      </FormField>

      <div className="flex gap-2.5">
        <Button type="button" variant="ghost" onClick={onBack}>
          Précédent
        </Button>
        <Button type="button" disabled={!canProceed} loading={mutation.isPending} onClick={() => mutation.mutate()}>
          Suivant
        </Button>
      </div>
    </div>
  );
}
