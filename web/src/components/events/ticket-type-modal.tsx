'use client';

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';
import { queryKeys } from '@/lib/query-keys';
import { getApiErrorMessage } from '@/lib/api-errors';
import { toDatetimeLocalValue } from '@/lib/utils';
import { Modal } from '@/components/ui/modal';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { FormField } from '@/components/ui/form-field';
import { Button } from '@/components/ui/button';
import { InlineBanner } from '@/components/ui/inline-banner';
import type { TicketAccessMode, TicketCategory, TicketType } from '@/types';

const CATEGORY_OPTIONS: { value: TicketCategory; label: string }[] = [
  { value: 'STANDARD', label: 'Standard' },
  { value: 'VIP', label: 'VIP' },
  { value: 'EARLY_BIRD', label: 'Early bird' },
  { value: 'PRESALE', label: 'Prévente' },
  { value: 'GROUP', label: 'Groupe' },
];

const ACCESS_MODE_OPTIONS: { value: TicketAccessMode; label: string }[] = [
  { value: 'PUBLIC', label: 'Public' },
  { value: 'PRESALE_WHITELIST', label: 'Liste blanche (prévente)' },
  { value: 'PRIVATE_LINK', label: 'Lien privé' },
];

// Mirrors backend/src/ticket-types/dto/{create,update}-ticket-type.dto.ts.
// minQuantityTotal comes from the currently-loaded quantitySold in edit
// mode — same guard the server applies on PATCH.
function buildTicketTypeSchema(minQuantityTotal: number) {
  return z
    .object({
      name: z.string().min(2, 'Le nom doit contenir au moins 2 caractères.'),
      category: z.enum(['STANDARD', 'VIP', 'EARLY_BIRD', 'PRESALE', 'GROUP']),
      price: z.coerce.number().min(0, 'Le prix ne peut pas être négatif.'),
      currency: z.string().min(3, 'Code devise à 3 lettres (ex. XOF).'),
      quantityTotal: z.coerce
        .number()
        .int('Nombre entier requis.')
        .positive('Doit être positif.')
        .min(minQuantityTotal, `Ne peut pas être inférieur aux ${minQuantityTotal} billets déjà vendus.`),
      maxPerOrder: z.coerce.number().int('Nombre entier requis.').positive('Doit être positif.'),
      accessMode: z.enum(['PUBLIC', 'PRESALE_WHITELIST', 'PRIVATE_LINK']),
      saleStart: z.string().min(1, 'Date de début de vente requise.'),
      saleEnd: z.string().min(1, 'Date de fin de vente requise.'),
    })
    .refine((data) => new Date(data.saleEnd) > new Date(data.saleStart), {
      message: 'La fin de vente doit être après le début.',
      path: ['saleEnd'],
    });
}

type TicketTypeFormValues = z.infer<ReturnType<typeof buildTicketTypeSchema>>;

interface TicketTypeModalProps {
  open: boolean;
  onClose: () => void;
  organizationId: string;
  eventId: string;
  ticketType?: TicketType | null; // null/undefined = create mode
}

export function TicketTypeModal({ open, onClose, organizationId, eventId, ticketType }: TicketTypeModalProps) {
  const queryClient = useQueryClient();
  const [error, setError] = useState<string | null>(null);
  const isEdit = !!ticketType;

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<TicketTypeFormValues>({
    resolver: zodResolver(buildTicketTypeSchema(isEdit ? ticketType.quantitySold : 0)),
    values: {
      name: ticketType?.name ?? '',
      category: ticketType?.category ?? 'STANDARD',
      price: ticketType ? Number(ticketType.price) : 0,
      currency: ticketType?.currency ?? 'XOF',
      quantityTotal: ticketType?.quantityTotal ?? 100,
      maxPerOrder: ticketType?.maxPerOrder ?? 10,
      accessMode: ticketType?.accessMode ?? 'PUBLIC',
      saleStart: ticketType?.saleStart ? toDatetimeLocalValue(ticketType.saleStart) : '',
      saleEnd: ticketType?.saleEnd ? toDatetimeLocalValue(ticketType.saleEnd) : '',
    },
  });

  const mutation = useMutation({
    mutationFn: (values: TicketTypeFormValues) => {
      const payload = {
        name: values.name,
        category: values.category,
        price: values.price,
        currency: values.currency,
        quantityTotal: values.quantityTotal,
        maxPerOrder: values.maxPerOrder,
        accessMode: values.accessMode,
        saleStart: new Date(values.saleStart).toISOString(),
        saleEnd: new Date(values.saleEnd).toISOString(),
      };
      return isEdit
        ? apiClient.patch(`/organizations/${organizationId}/events/${eventId}/ticket-types/${ticketType.id}`, payload)
        : apiClient.post(`/organizations/${organizationId}/events/${eventId}/ticket-types`, payload);
    },
    onSuccess: () => {
      setError(null);
      queryClient.invalidateQueries({ queryKey: queryKeys.ticketTypes(organizationId, eventId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.orgStats(organizationId) });
      onClose();
    },
    onError: (err) => setError(getApiErrorMessage(err)),
  });

  function handleClose() {
    setError(null);
    onClose();
  }

  return (
    <Modal open={open} onClose={handleClose} title={isEdit ? 'Modifier le type de billet' : 'Nouveau type de billet'}>
      {error && <InlineBanner tone="error">{error}</InlineBanner>}
      <form onSubmit={handleSubmit((values) => mutation.mutate(values))}>
        <FormField label="Nom" htmlFor="tt-name" required error={errors.name?.message}>
          <Input id="tt-name" invalid={!!errors.name} {...register('name')} />
        </FormField>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <FormField label="Catégorie" htmlFor="tt-category">
            <Select id="tt-category" {...register('category')}>
              {CATEGORY_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </Select>
          </FormField>
          <FormField label="Mode d'accès" htmlFor="tt-access-mode">
            <Select id="tt-access-mode" {...register('accessMode')}>
              {ACCESS_MODE_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </Select>
          </FormField>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <FormField label="Prix" htmlFor="tt-price" required error={errors.price?.message}>
            <Input id="tt-price" type="number" min={0} step="0.01" invalid={!!errors.price} {...register('price')} />
          </FormField>
          <FormField label="Devise" htmlFor="tt-currency" required error={errors.currency?.message}>
            <Input id="tt-currency" disabled invalid={!!errors.currency} {...register('currency')} />
          </FormField>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <FormField
            label="Quantité totale"
            htmlFor="tt-quantity-total"
            required
            hint={isEdit && ticketType.quantitySold > 0 ? `${ticketType.quantitySold} déjà vendus` : undefined}
            error={errors.quantityTotal?.message}
          >
            <Input id="tt-quantity-total" type="number" min={1} invalid={!!errors.quantityTotal} {...register('quantityTotal')} />
          </FormField>
          <FormField label="Max par commande" htmlFor="tt-max-per-order" error={errors.maxPerOrder?.message}>
            <Input id="tt-max-per-order" type="number" min={1} invalid={!!errors.maxPerOrder} {...register('maxPerOrder')} />
          </FormField>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <FormField label="Début de vente" htmlFor="tt-sale-start" required error={errors.saleStart?.message}>
            <Input id="tt-sale-start" type="datetime-local" invalid={!!errors.saleStart} {...register('saleStart')} />
          </FormField>
          <FormField label="Fin de vente" htmlFor="tt-sale-end" required error={errors.saleEnd?.message}>
            <Input id="tt-sale-end" type="datetime-local" invalid={!!errors.saleEnd} {...register('saleEnd')} />
          </FormField>
        </div>

        <Button type="submit" loading={mutation.isPending}>
          {isEdit ? 'Enregistrer' : 'Créer le type de billet'}
        </Button>
      </form>
    </Modal>
  );
}
