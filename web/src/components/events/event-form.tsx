'use client';

import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { FormField } from '@/components/ui/form-field';
import { Button } from '@/components/ui/button';
import { Panel } from '@/components/ui/panel';
import { CategorySelect } from '@/components/events/category-select';
import { EventLocationPicker } from '@/components/events/event-location-picker';
import { MinAgeField } from '@/components/events/min-age-field';
import { DressCodeEditor } from '@/components/events/dress-code-editor';
import { eventSchema, type EventFormValues, type EventFormSubmitPayload } from '@/components/events/event-schema';
import { slugify, toDatetimeLocalValue } from '@/lib/utils';
import type { Event } from '@/types';

export type { EventFormSubmitPayload };

interface EventFormProps {
  mode: 'create' | 'edit';
  defaultValues?: Partial<Event>;
  disabled?: boolean;
  submitLabel: string;
  submitting?: boolean;
  onSubmit: (payload: EventFormSubmitPayload) => void;
}

export function EventForm({ mode, defaultValues, disabled, submitLabel, submitting, onSubmit }: EventFormProps) {
  const {
    register,
    handleSubmit,
    watch,
    setValue,
    control,
    formState: { errors, dirtyFields },
  } = useForm<EventFormValues>({
    resolver: zodResolver(eventSchema),
    defaultValues: {
      name: defaultValues?.name ?? '',
      slug: defaultValues?.slug ?? '',
      description: defaultValues?.description ?? '',
      venueName: defaultValues?.venueName ?? '',
      address: defaultValues?.address ?? '',
      country: defaultValues?.country ?? '',
      city: defaultValues?.city ?? '',
      // Event.latitude/longitude arrive as strings (Decimal serialized over
      // JSON, same as TicketType.price) — convert once here.
      latitude: defaultValues?.latitude != null ? Number(defaultValues.latitude) : null,
      longitude: defaultValues?.longitude != null ? Number(defaultValues.longitude) : null,
      categoryId: defaultValues?.categoryId ?? '',
      startAt: defaultValues?.startAt ? toDatetimeLocalValue(defaultValues.startAt) : '',
      endAt: defaultValues?.endAt ? toDatetimeLocalValue(defaultValues.endAt) : '',
      minAge: defaultValues?.minAge ?? null,
      dressCodes: defaultValues?.dressCodes?.map((d) => ({ label: d.label, appliesTo: d.appliesTo })) ?? [],
    },
  });

  // Auto-derive the slug from the name in create mode, until the user
  // touches the slug field themselves — then it stops overriding their edit.
  const name = watch('name');
  useEffect(() => {
    if (mode === 'create' && !dirtyFields.slug) {
      setValue('slug', slugify(name || ''));
    }
  }, [name, mode, dirtyFields.slug, setValue]);

  function submit(values: EventFormValues) {
    onSubmit({
      name: values.name,
      slug: values.slug,
      description: values.description || undefined,
      venueName: values.venueName || undefined,
      address: values.address || undefined,
      country: values.country || undefined,
      city: values.city || undefined,
      latitude: values.latitude ?? undefined,
      longitude: values.longitude ?? undefined,
      categoryId: values.categoryId || undefined,
      startAt: new Date(values.startAt).toISOString(),
      endAt: new Date(values.endAt).toISOString(),
      minAge: values.minAge ?? null,
      dressCodes: values.dressCodes ?? [],
    });
  }

  return (
    <form onSubmit={handleSubmit(submit)}>
      <FormField label="Nom de l'évènement" htmlFor="name" required error={errors.name?.message}>
        <Input id="name" disabled={disabled} invalid={!!errors.name} {...register('name')} />
      </FormField>

      <FormField
        label="Slug"
        htmlFor="slug"
        required
        hint={mode === 'create' ? 'Dérivé automatiquement du nom — modifiable.' : "Non modifiable après création."}
        error={errors.slug?.message}
      >
        <Input id="slug" disabled={disabled || mode === 'edit'} invalid={!!errors.slug} {...register('slug')} />
      </FormField>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <FormField label="Début" htmlFor="startAt" required error={errors.startAt?.message}>
          <Input id="startAt" type="datetime-local" disabled={disabled} invalid={!!errors.startAt} {...register('startAt')} />
        </FormField>
        <FormField label="Fin" htmlFor="endAt" required error={errors.endAt?.message}>
          <Input id="endAt" type="datetime-local" disabled={disabled} invalid={!!errors.endAt} {...register('endAt')} />
        </FormField>
      </div>

      <FormField label="Catégorie" htmlFor="categoryId">
        <CategorySelect
          id="categoryId"
          value={watch('categoryId')}
          onChange={(categoryId) => setValue('categoryId', categoryId, { shouldDirty: true })}
          disabled={disabled}
        />
      </FormField>

      <FormField
        label="Localisation"
        htmlFor="locationSearch"
        hint="Recherchez un lieu (OpenStreetMap) ou cliquez sur la carte pour placer le point manuellement."
      >
        <EventLocationPicker
          id="locationSearch"
          disabled={disabled}
          latitude={watch('latitude') ?? null}
          longitude={watch('longitude') ?? null}
          onSelectResult={(result) => {
            setValue('country', result.country, { shouldDirty: true });
            setValue('city', result.city, { shouldDirty: true });
            setValue('address', result.address, { shouldDirty: true });
            setValue('venueName', result.venueName, { shouldDirty: true });
            setValue('latitude', result.latitude, { shouldDirty: true });
            setValue('longitude', result.longitude, { shouldDirty: true });
          }}
          onMapClick={(lat, lng) => {
            setValue('latitude', lat, { shouldDirty: true });
            setValue('longitude', lng, { shouldDirty: true });
          }}
        />
      </FormField>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <FormField label="Pays" htmlFor="country">
          <Input id="country" disabled={disabled} {...register('country')} />
        </FormField>
        <FormField label="Ville" htmlFor="city">
          <Input id="city" disabled={disabled} {...register('city')} />
        </FormField>
      </div>

      <FormField label="Quartier" htmlFor="address">
        <Input id="address" disabled={disabled} {...register('address')} />
      </FormField>

      <FormField label="Lieu" htmlFor="venueName">
        <Input id="venueName" disabled={disabled} {...register('venueName')} />
      </FormField>

      <FormField label="Description" htmlFor="description">
        <Textarea id="description" disabled={disabled} rows={4} {...register('description')} />
      </FormField>

      <Panel title="Paramètres optionnels">
        <div className="space-y-5">
          <MinAgeField
            value={watch('minAge') ?? null}
            onChange={(minAge) => setValue('minAge', minAge, { shouldDirty: true })}
            disabled={disabled}
          />
          <DressCodeEditor
            control={control}
            register={register}
            errors={errors.dressCodes}
            disabled={disabled}
            hasInitialEntries={!!defaultValues?.dressCodes?.length}
          />
        </div>
      </Panel>

      {!disabled && (
        <Button type="submit" loading={submitting}>
          {submitLabel}
        </Button>
      )}
    </form>
  );
}
