import { z } from 'zod';
import type { DressCodeAudience } from '@/types';

// Mirrors backend/src/events/dto/create-event.dto.ts's validation rules
// client-side for earlier feedback — the server still re-validates, this is
// UX only, not a trust boundary change. Kept as the pre-refine base object
// (rather than baking the endAt>startAt check in here) so the wizard's
// per-step schemas (event-wizard/*) can .pick() a subset of fields and only
// re-apply .refine() where that specific step actually needs it.
export const eventBaseSchema = z.object({
  name: z.string().min(2, 'Le nom doit contenir au moins 2 caractères.'),
  slug: z.string().regex(/^[a-z0-9-]+$/, 'Lettres minuscules, chiffres et tirets uniquement.'),
  description: z.string().optional(),
  venueName: z.string().optional(),
  address: z.string().optional(),
  country: z.string().optional(),
  city: z.string().optional(),
  latitude: z.number().nullable().optional(),
  longitude: z.number().nullable().optional(),
  categoryId: z.string().optional(),
  startAt: z.string().min(1, 'Date de début requise.'),
  endAt: z.string().min(1, 'Date de fin requise.'),
  minAge: z.number().int().min(0).max(99).nullable().optional(),
  dressCodes: z
    .array(
      z.object({
        label: z.string().min(1, 'Libellé requis.').max(25, '25 caractères maximum.'),
        appliesTo: z.enum(['EVERYONE', 'MEN', 'WOMEN']),
      }),
    )
    .optional(),
});

export const eventSchema = eventBaseSchema.refine((data) => new Date(data.endAt) > new Date(data.startAt), {
  message: 'La date de fin doit être après la date de début.',
  path: ['endAt'],
});

export type EventFormValues = z.infer<typeof eventSchema>;

export interface EventFormSubmitPayload {
  name: string;
  slug: string;
  description?: string;
  venueName?: string;
  address?: string;
  country?: string;
  city?: string;
  latitude?: number;
  longitude?: number;
  categoryId?: string;
  startAt: string;
  endAt: string;
  // Paramètres optionnels — always sent explicitly (never omitted) so an
  // organizer can clear a previously-set value: minAge: null must reach the
  // server as null, not as an absent field the backend would leave untouched.
  minAge: number | null;
  dressCodes: { label: string; appliesTo: DressCodeAudience }[];
}
