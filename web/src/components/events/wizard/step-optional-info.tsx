'use client';

import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';
import { queryKeys } from '@/lib/query-keys';
import { getApiErrorMessage } from '@/lib/api-errors';
import { Button } from '@/components/ui/button';
import { InlineBanner } from '@/components/ui/inline-banner';
import { MinAgeField } from '@/components/events/min-age-field';
import { DressCodeEditor } from '@/components/events/dress-code-editor';
import { eventBaseSchema } from '@/components/events/event-schema';
import type { Event } from '@/types';

const stepSchema = eventBaseSchema.pick({ minAge: true, dressCodes: true });
type StepValues = z.infer<typeof stepSchema>;

interface StepOptionalInfoProps {
  organizationId: string;
  eventId: string;
  event: Event;
  onBack: () => void;
  onNext: () => void;
}

// The one step that's explicitly optional: "Suivant" is never disabled here,
// unlike every other required step — submitting empty just PATCHes
// {minAge: null, dressCodes: []}, a harmless no-op.
export function StepOptionalInfo({ organizationId, eventId, event, onBack, onNext }: StepOptionalInfoProps) {
  const queryClient = useQueryClient();
  const {
    handleSubmit,
    watch,
    setValue,
    register,
    control,
    formState: { errors },
  } = useForm<StepValues>({
    resolver: zodResolver(stepSchema),
    defaultValues: {
      minAge: event.minAge ?? null,
      dressCodes: event.dressCodes?.map((d) => ({ label: d.label, appliesTo: d.appliesTo })) ?? [],
    },
  });

  const mutation = useMutation({
    mutationFn: (values: StepValues) =>
      apiClient.patch<Event>(`/organizations/${organizationId}/events/${eventId}`, {
        minAge: values.minAge ?? null,
        dressCodes: values.dressCodes ?? [],
      }),
    onSuccess: (res) => {
      queryClient.setQueryData(queryKeys.event(organizationId, eventId), res.data);
      onNext();
    },
  });

  return (
    <form onSubmit={handleSubmit((values) => mutation.mutate(values))}>
      <InlineBanner tone="pending">
        Cette étape est facultative — vous pouvez passer à la suite sans rien remplir.
      </InlineBanner>
      {mutation.isError && <InlineBanner tone="error">{getApiErrorMessage(mutation.error)}</InlineBanner>}

      <div className="space-y-5">
        <MinAgeField value={watch('minAge') ?? null} onChange={(minAge) => setValue('minAge', minAge, { shouldDirty: true })} />
        <DressCodeEditor
          control={control}
          register={register}
          errors={errors.dressCodes}
          hasInitialEntries={!!event.dressCodes?.length}
        />
      </div>

      <div className="mt-5 flex gap-2.5">
        <Button type="button" variant="ghost" onClick={onBack}>
          Précédent
        </Button>
        <Button type="submit" loading={mutation.isPending}>
          Suivant
        </Button>
      </div>
    </form>
  );
}
