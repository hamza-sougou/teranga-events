'use client';

import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { FormField } from '@/components/ui/form-field';
import { Button } from '@/components/ui/button';
import { CategorySelect } from '@/components/events/category-select';
import { slugify, toDatetimeLocalValue } from '@/lib/utils';
import type { Event } from '@/types';

// Mirrors backend/src/events/dto/create-event.dto.ts's validation rules
// client-side for earlier feedback — the server still re-validates, this is
// UX only, not a trust boundary change.
const eventSchema = z
  .object({
    name: z.string().min(2, 'Le nom doit contenir au moins 2 caractères.'),
    slug: z.string().regex(/^[a-z0-9-]+$/, 'Lettres minuscules, chiffres et tirets uniquement.'),
    description: z.string().optional(),
    venueName: z.string().optional(),
    address: z.string().optional(),
    categoryId: z.string().optional(),
    startAt: z.string().min(1, 'Date de début requise.'),
    endAt: z.string().min(1, 'Date de fin requise.'),
  })
  .refine((data) => new Date(data.endAt) > new Date(data.startAt), {
    message: 'La date de fin doit être après la date de début.',
    path: ['endAt'],
  });

type EventFormValues = z.infer<typeof eventSchema>;

export interface EventFormSubmitPayload {
  name: string;
  slug: string;
  description?: string;
  venueName?: string;
  address?: string;
  categoryId?: string;
  startAt: string;
  endAt: string;
}

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
    formState: { errors, dirtyFields },
  } = useForm<EventFormValues>({
    resolver: zodResolver(eventSchema),
    defaultValues: {
      name: defaultValues?.name ?? '',
      slug: defaultValues?.slug ?? '',
      description: defaultValues?.description ?? '',
      venueName: defaultValues?.venueName ?? '',
      address: defaultValues?.address ?? '',
      categoryId: defaultValues?.categoryId ?? '',
      startAt: defaultValues?.startAt ? toDatetimeLocalValue(defaultValues.startAt) : '',
      endAt: defaultValues?.endAt ? toDatetimeLocalValue(defaultValues.endAt) : '',
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
      categoryId: values.categoryId || undefined,
      startAt: new Date(values.startAt).toISOString(),
      endAt: new Date(values.endAt).toISOString(),
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

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <FormField label="Catégorie" htmlFor="categoryId">
          <CategorySelect
            id="categoryId"
            value={watch('categoryId')}
            onChange={(categoryId) => setValue('categoryId', categoryId, { shouldDirty: true })}
            disabled={disabled}
          />
        </FormField>
        <FormField label="Lieu" htmlFor="venueName">
          <Input id="venueName" disabled={disabled} {...register('venueName')} />
        </FormField>
      </div>

      <FormField label="Adresse" htmlFor="address">
        <Input id="address" disabled={disabled} {...register('address')} />
      </FormField>

      <FormField label="Description" htmlFor="description">
        <Textarea id="description" disabled={disabled} rows={4} {...register('description')} />
      </FormField>

      {!disabled && (
        <Button type="submit" loading={submitting}>
          {submitLabel}
        </Button>
      )}
    </form>
  );
}
