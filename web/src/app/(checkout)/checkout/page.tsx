'use client';

import { Suspense, useMemo } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useMutation, useQuery } from '@tanstack/react-query';
import { isAxiosError } from 'axios';
import { apiClient } from '@/lib/api-client';
import { queryKeys } from '@/lib/query-keys';
import { getApiErrorMessage } from '@/lib/api-errors';
import { parseCartItems } from '@/lib/cart';
import { SENEGAL_PHONE_MESSAGE, SENEGAL_PHONE_REGEX } from '@/lib/phone';
import { formatXof } from '@/lib/utils';
import { Panel } from '@/components/ui/panel';
import { Input } from '@/components/ui/input';
import { FormField } from '@/components/ui/form-field';
import { Button } from '@/components/ui/button';
import { InlineBanner } from '@/components/ui/inline-banner';
import { BackButton } from '@/components/checkout/back-button';
import { OrderSummaryPanel } from '@/components/checkout/order-summary-panel';
import type { PublicEvent, PublicTicketType } from '@/types';

// No payment-channel selector on this page — MOBILE_MONEY is fixed as the
// reference channel for both the preview and the real charge, same channel
// already used for displayPrice everywhere on the public site. See
// backend/src/payments/pricing/payment-channel.ts for why this is an
// accepted limitation, not an oversight.
const PAYMENT_CHANNEL = 'MOBILE_MONEY' as const;

interface CheckoutPreview {
  currency: string;
  subtotalAmount: number;
  serviceFeeAmount: number;
  totalAmount: number;
}

interface CheckoutResponse {
  orderId: string;
  paymentUrl: string;
  expiresAt: string;
  totalAmount: number;
}

interface PendingOrder {
  orderId: string;
  expiresAt: string;
}

const buyerSchema = z.object({
  buyerEmail: z.string().min(1, 'Email requis.').email('Adresse email invalide.'),
  buyerPhone: z.union([z.string().regex(SENEGAL_PHONE_REGEX, SENEGAL_PHONE_MESSAGE), z.literal('')]),
});
type BuyerFormValues = z.infer<typeof buyerSchema>;

function pendingOrderStorageKey(eventSlug: string, itemsRaw: string): string {
  return `checkout:${eventSlug}:${itemsRaw}`;
}

function readPendingOrder(key: string): PendingOrder | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.sessionStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as PendingOrder;
    if (new Date(parsed.expiresAt).getTime() < Date.now()) {
      window.sessionStorage.removeItem(key);
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

// useSearchParams() requires a Suspense boundary in the App Router — see
// the identical wrapper on checkout/confirmation/page.tsx.
export default function CheckoutPage() {
  return (
    <Suspense
      fallback={<main className="flex min-h-[60vh] items-center justify-center text-sm text-text-muted">Chargement...</main>}
    >
      <CheckoutPageContent />
    </Suspense>
  );
}

function CheckoutPageContent() {
  const searchParams = useSearchParams();
  const eventSlug = searchParams.get('event') ?? '';
  const itemsRaw = searchParams.get('items') ?? '';
  const cartItems = useMemo(() => parseCartItems(searchParams), [searchParams]);
  const storageKey = pendingOrderStorageKey(eventSlug, itemsRaw);
  const pendingOrder = readPendingOrder(storageKey);

  const eventQuery = useQuery<PublicEvent>({
    queryKey: queryKeys.publicEvent(eventSlug),
    queryFn: async () => (await apiClient.get(`/events/${eventSlug}`)).data,
    enabled: !!eventSlug,
  });

  const ticketTypesQuery = useQuery<PublicTicketType[]>({
    queryKey: queryKeys.publicTicketTypes(eventSlug),
    queryFn: async () => (await apiClient.get(`/events/${eventSlug}/ticket-types`)).data,
    enabled: !!eventSlug,
  });

  // Cross-references the URL's ticketTypeIds against the real, current
  // ticket-type list — anything no longer offered (removed, or never
  // existed) is silently dropped rather than shown as a broken line.
  const lines = useMemo(() => {
    const byId = new Map((ticketTypesQuery.data ?? []).map((tt) => [tt.id, tt]));
    return cartItems
      .map((item) => {
        const ticketType = byId.get(item.ticketTypeId);
        return ticketType ? { ticketType, quantity: item.quantity } : null;
      })
      .filter((line): line is { ticketType: PublicTicketType; quantity: number } => line !== null);
  }, [cartItems, ticketTypesQuery.data]);

  const eventId = eventQuery.data?.id;
  const previewItems = lines.map((line) => ({ ticketTypeId: line.ticketType.id, quantity: line.quantity }));

  const previewQuery = useQuery<CheckoutPreview>({
    queryKey: queryKeys.orderPreview(eventId, itemsRaw),
    queryFn: async () =>
      (
        await apiClient.post('/orders/preview', {
          eventId,
          paymentChannel: PAYMENT_CHANNEL,
          items: previewItems,
        })
      ).data,
    enabled: !!eventId && lines.length > 0,
  });

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<BuyerFormValues>({
    resolver: zodResolver(buyerSchema),
    defaultValues: { buyerEmail: '', buyerPhone: '' },
  });

  const mutation = useMutation({
    mutationFn: async (values: BuyerFormValues) =>
      (
        await apiClient.post<CheckoutResponse>('/orders', {
          eventId,
          buyerEmail: values.buyerEmail,
          buyerPhone: values.buyerPhone || undefined,
          paymentChannel: PAYMENT_CHANNEL,
          items: previewItems,
        })
      ).data,
    onSuccess: (data) => {
      try {
        window.sessionStorage.setItem(
          storageKey,
          JSON.stringify({ orderId: data.orderId, expiresAt: data.expiresAt } satisfies PendingOrder),
        );
      } catch {
        // sessionStorage unavailable (private browsing, etc.) — the
        // double-submit guard degrades to "disabled button only", which is
        // still the acceptable baseline.
      }
      window.location.href = data.paymentUrl;
    },
  });

  const soldOut = isAxiosError(mutation.error) && mutation.error.response?.status === 409;

  if (!eventSlug || (eventQuery.isSuccess && cartItems.length === 0)) {
    return (
      <main className="flex min-h-[60vh] flex-col items-center justify-center gap-3 px-6 text-center">
        <p className="text-sm text-text-muted">Votre panier est vide.</p>
        <Link href="/" className="text-sm font-bold text-indigo hover:underline">
          Découvrir des évènements
        </Link>
      </main>
    );
  }

  if (eventQuery.isLoading || ticketTypesQuery.isLoading) {
    return (
      <main className="flex min-h-[60vh] items-center justify-center text-sm text-text-muted">Chargement...</main>
    );
  }

  if (eventQuery.isError || !eventQuery.data) {
    return (
      <main className="flex min-h-[60vh] items-center justify-center text-sm text-text-muted">
        Évènement introuvable.
      </main>
    );
  }

  if (lines.length === 0) {
    return (
      <main className="flex min-h-[60vh] flex-col items-center justify-center gap-3 px-6 text-center">
        <p className="text-sm text-text-muted">
          Les billets de votre panier ne sont plus disponibles pour {eventQuery.data.name}.
        </p>
        <Link href={`/events/${eventSlug}`} className="text-sm font-bold text-indigo hover:underline">
          Retourner à la page de l&apos;évènement
        </Link>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-5xl px-6 py-6 sm:px-10">
      <BackButton href={`/events/${eventSlug}`} />

      <h1 className="mb-6 mt-6 text-2xl font-black text-text">Finaliser votre commande</h1>

      {pendingOrder && (
        <InlineBanner tone="pending">
          Vous avez déjà une commande en cours pour ce panier.{' '}
          <Link href={`/checkout/confirmation?orderId=${pendingOrder.orderId}`} className="underline">
            Voir son statut
          </Link>
          .
        </InlineBanner>
      )}

      <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-[380px_1fr]">
        <OrderSummaryPanel event={eventQuery.data} eventSlug={eventSlug} lines={lines} preview={previewQuery.data} />

        <Panel title="Vos coordonnées">
          {soldOut ? (
            <InlineBanner tone="error">
              Certains billets ne sont plus disponibles. Retournez à la page de l&apos;évènement pour recommencer.
            </InlineBanner>
          ) : mutation.isError ? (
            <InlineBanner tone="error">{getApiErrorMessage(mutation.error)}</InlineBanner>
          ) : null}

          <form
            onSubmit={handleSubmit((values) => {
              if (!pendingOrder) mutation.mutate(values);
            })}
          >
            <FormField label="Email" htmlFor="buyer-email" required error={errors.buyerEmail?.message}>
              <Input
                id="buyer-email"
                type="email"
                invalid={!!errors.buyerEmail}
                placeholder="vous@exemple.com"
                {...register('buyerEmail')}
              />
            </FormField>

            <FormField
              label="Téléphone"
              htmlFor="buyer-phone"
              hint="Optionnel. Format : 7XXXXXXXX ou +2217XXXXXXXX."
              error={errors.buyerPhone?.message}
            >
              <Input id="buyer-phone" invalid={!!errors.buyerPhone} {...register('buyerPhone')} />
            </FormField>

            <Button
              type="submit"
              loading={mutation.isPending}
              disabled={!!pendingOrder || !previewQuery.data}
              className="w-full justify-center"
            >
              Payer {previewQuery.data ? formatXof(previewQuery.data.totalAmount) : ''}
            </Button>
          </form>
        </Panel>
      </div>
    </main>
  );
}
