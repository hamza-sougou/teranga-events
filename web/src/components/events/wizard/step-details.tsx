'use client';

import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';
import { queryKeys } from '@/lib/query-keys';
import { getApiErrorMessage } from '@/lib/api-errors';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { FormField } from '@/components/ui/form-field';
import { Button } from '@/components/ui/button';
import { InlineBanner } from '@/components/ui/inline-banner';
import { CategorySelect } from '@/components/events/category-select';
import { eventBaseSchema } from '@/components/events/event-schema';
import { slugify, toDatetimeLocalValue } from '@/lib/utils';
import type { Event } from '@/types';

// Stricter than eventBaseSchema on categoryId: the base schema keeps it
// optional (matching CreateEventDto/UpdateEventDto, which stay optional at
// the DTO level — publish-time is where the backend actually enforces it).
// The wizard funnels every organizer through filling it here regardless, so
// a real draft never reaches the recap missing it.
const stepSchema = eventBaseSchema
  .pick({ name: true, slug: true, description: true, categoryId: true, startAt: true, endAt: true })
  .extend({ categoryId: z.string().min(1, 'Catégorie requise.') })
  .refine((data) => new Date(data.endAt) > new Date(data.startAt), {
    message: 'La date de fin doit être après la date de début.',
    path: ['endAt'],
  });

type StepValues = z.infer<typeof stepSchema>;

interface StepDetailsProps {
  organizationId: string;
  eventId: string | null;
  event: Event | null;
  onCreated: (eventId: string) => void;
  onNext: () => void;
}

export function StepDetails({ organizationId, eventId, event, onCreated, onNext }: StepDetailsProps) {
  const queryClient = useQueryClient();
  const {
    register,
    handleSubmit,
    watch,
    setValue,
    formState: { errors, dirtyFields },
  } = useForm<StepValues>({
    resolver: zodResolver(stepSchema),
    defaultValues: {
      name: event?.name ?? '',
      slug: event?.slug ?? '',
      description: event?.description ?? '',
      categoryId: event?.categoryId ?? '',
      startAt: event?.startAt ? toDatetimeLocalValue(event.startAt) : '',
      endAt: event?.endAt ? toDatetimeLocalValue(event.endAt) : '',
    },
  });

  // Same auto-derive-until-touched behavior as the flat EventForm, gated on
  // "no eventId yet" instead of a mode prop — once the draft exists the slug
  // is locked, same as EventForm's mode === 'edit'.
  const name = watch('name');
  useEffect(() => {
    if (!eventId && !dirtyFields.slug) {
      setValue('slug', slugify(name || ''));
    }
  }, [name, eventId, dirtyFields.slug, setValue]);

  const mutation = useMutation({
    mutationFn: (values: StepValues) => {
      const body = {
        name: values.name,
        slug: values.slug,
        description: values.description || undefined,
        categoryId: values.categoryId,
        startAt: new Date(values.startAt).toISOString(),
        endAt: new Date(values.endAt).toISOString(),
      };
      return eventId
        ? apiClient.patch<Event>(`/organizations/${organizationId}/events/${eventId}`, body)
        : apiClient.post<Event>(`/organizations/${organizationId}/events`, body);
    },
    onSuccess: (res) => {
      queryClient.setQueryData(queryKeys.event(organizationId, res.data.id), res.data);
      queryClient.invalidateQueries({ queryKey: queryKeys.events(organizationId) });
      if (!eventId) {
        onCreated(res.data.id);
      } else {
        onNext();
      }
    },
  });

  return (
    <form onSubmit={handleSubmit((values) => mutation.mutate(values))}>
      {mutation.isError && <InlineBanner tone="error">{getApiErrorMessage(mutation.error)}</InlineBanner>}

      <FormField label="Nom de l'évènement" htmlFor="name" required error={errors.name?.message}>
        <Input id="name" invalid={!!errors.name} {...register('name')} />
      </FormField>

      <FormField
        label="Slug"
        htmlFor="slug"
        required
        hint={!eventId ? 'Dérivé automatiquement du nom — modifiable.' : 'Non modifiable après création.'}
        error={errors.slug?.message}
      >
        <Input id="slug" disabled={!!eventId} invalid={!!errors.slug} {...register('slug')} />
      </FormField>

      <FormField label="Catégorie" htmlFor="categoryId" required error={errors.categoryId?.message}>
        <CategorySelect
          id="categoryId"
          value={watch('categoryId')}
          onChange={(categoryId) => setValue('categoryId', categoryId, { shouldDirty: true, shouldValidate: true })}
          invalid={!!errors.categoryId}
        />
      </FormField>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <FormField label="Début" htmlFor="startAt" required error={errors.startAt?.message}>
          <Input id="startAt" type="datetime-local" invalid={!!errors.startAt} {...register('startAt')} />
        </FormField>
        <FormField label="Fin" htmlFor="endAt" required error={errors.endAt?.message}>
          <Input id="endAt" type="datetime-local" invalid={!!errors.endAt} {...register('endAt')} />
        </FormField>
      </div>

      <FormField label="Description" htmlFor="description">
        <Textarea id="description" rows={4} {...register('description')} />
      </FormField>

      <Button type="submit" loading={mutation.isPending}>
        Suivant
      </Button>
    </form>
  );
}
