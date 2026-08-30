'use client';

import { Suspense, useEffect, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { isAxiosError } from 'axios';
import { apiClient } from '@/lib/api-client';
import { queryKeys } from '@/lib/query-keys';
import { interpretOrderStatus } from '@/lib/interpret-order-status';
import { formatXof } from '@/lib/utils';
import { Panel } from '@/components/ui/panel';
import { Button } from '@/components/ui/button';
import { BackButton } from '@/components/checkout/back-button';
import { CheckCircleIcon, LoaderIcon, XCircleIcon } from '@/components/ui/icons';
import type { PublicOrder } from '@/types';

const ORDER_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const POLL_INTERVAL_MS = 2500;
// ~60s of auto-polling before falling back to "check your email" — an
// arbitrary but reasonable cap, same spirit as MAX_CHARS in
// components/public/expandable-text.tsx. Never an indefinite silent wait.
const MAX_POLLS = 24;

// GET /orders/:orderId (PublicOrder) carries no eventId/slug — "/" is the
// only destination that's always valid from this page.
function ConfirmationPageShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen">
      <div className="px-6 pt-6 sm:px-10">
        <BackButton href="/" />
      </div>
      {children}
    </div>
  );
}

function CenteredMessage({ children }: { children: React.ReactNode }) {
  return (
    <main className="flex min-h-[50vh] flex-col items-center justify-center gap-3 px-6 text-center">{children}</main>
  );
}

// useSearchParams() requires a Suspense boundary in the App Router — see
// the identical wrapper on checkout/page.tsx.
export default function CheckoutConfirmationPage() {
  return (
    <Suspense
      fallback={
        <ConfirmationPageShell>
          <CenteredMessage>Chargement...</CenteredMessage>
        </ConfirmationPageShell>
      }
    >
      <CheckoutConfirmationPageContent />
    </Suspense>
  );
}

function CheckoutConfirmationPageContent() {
  const searchParams = useSearchParams();
  const orderId = searchParams.get('orderId') ?? '';
  const isValidOrderId = ORDER_ID_PATTERN.test(orderId);
  const [pollCount, setPollCount] = useState(0);

  const orderQuery = useQuery<PublicOrder>({
    queryKey: queryKeys.publicOrder(orderId),
    queryFn: async () => (await apiClient.get(`/orders/${orderId}`)).data,
    enabled: isValidOrderId,
    retry: false,
    refetchInterval: (query) => {
      const data = query.state.data;
      if (!data || interpretOrderStatus(data.status) !== 'pending') return false;
      return pollCount >= MAX_POLLS ? false : POLL_INTERVAL_MS;
    },
  });

  // Counts one tick per successful fetch while still PENDING — separate from
  // refetchInterval's own decision above, since that callback is re-created
  // (and re-evaluated) every render and isn't a reliable place to mutate
  // state exactly once per actual fetch.
  useEffect(() => {
    if (orderQuery.data && interpretOrderStatus(orderQuery.data.status) === 'pending') {
      setPollCount((count) => count + 1);
    }
  }, [orderQuery.dataUpdatedAt]);

  if (!orderId || !isValidOrderId) {
    return (
      <ConfirmationPageShell>
        <CenteredMessage>
          <XCircleIcon className="h-10 w-10 text-danger" />
          <p className="text-sm font-semibold text-text">Lien de confirmation invalide.</p>
          <Link href="/" className="text-sm font-bold text-indigo hover:underline">
            Retourner à l&apos;accueil
          </Link>
        </CenteredMessage>
      </ConfirmationPageShell>
    );
  }

  if (orderQuery.isLoading) {
    return (
      <ConfirmationPageShell>
        <CenteredMessage>Chargement...</CenteredMessage>
      </ConfirmationPageShell>
    );
  }

  if (isAxiosError(orderQuery.error) && orderQuery.error.response?.status === 404) {
    return (
      <ConfirmationPageShell>
        <CenteredMessage>
          <XCircleIcon className="h-10 w-10 text-danger" />
          <p className="text-sm font-semibold text-text">Commande introuvable.</p>
          <Link href="/" className="text-sm font-bold text-indigo hover:underline">
            Retourner à l&apos;accueil
          </Link>
        </CenteredMessage>
      </ConfirmationPageShell>
    );
  }

  if (orderQuery.isError || !orderQuery.data) {
    return (
      <ConfirmationPageShell>
        <CenteredMessage>
          <p className="text-sm text-text-muted">Une erreur est survenue. Réessayez plus tard.</p>
        </CenteredMessage>
      </ConfirmationPageShell>
    );
  }

  const order = orderQuery.data;
  const state = interpretOrderStatus(order.status);
  const timedOut = state === 'pending' && pollCount >= MAX_POLLS;

  if (state === 'pending') {
    return (
      <ConfirmationPageShell>
        <CenteredMessage>
          <LoaderIcon className="h-8 w-8 animate-spin text-text-muted" />
          <p className="text-sm font-semibold text-text">Vérification du paiement en cours...</p>
          {timedOut ? (
            <>
              <p className="max-w-sm text-[13px] text-text-muted">
                Ça prend plus de temps que prévu. Vous recevrez un email de confirmation dès que le paiement sera
                validé — vous pouvez aussi réessayer maintenant.
              </p>
              <Button
                variant="ghost"
                onClick={() => {
                  setPollCount(0);
                  orderQuery.refetch();
                }}
              >
                Réessayer
              </Button>
            </>
          ) : (
            <p className="text-[13px] text-text-muted">Cela ne prend généralement que quelques secondes.</p>
          )}
        </CenteredMessage>
      </ConfirmationPageShell>
    );
  }

  if (state === 'expired') {
    return (
      <ConfirmationPageShell>
        <CenteredMessage>
          <XCircleIcon className="h-10 w-10 text-danger" />
          <p className="text-sm font-semibold text-text">
            Le paiement n&apos;a pas été confirmé à temps, la réservation a expiré.
          </p>
          <p className="max-w-sm text-[13px] text-text-muted">Vos billets ont été libérés. Vous pouvez recommencer.</p>
          <Link href="/" className="text-sm font-bold text-indigo hover:underline">
            Retourner à l&apos;accueil
          </Link>
        </CenteredMessage>
      </ConfirmationPageShell>
    );
  }

  if (state === 'failed') {
    return (
      <ConfirmationPageShell>
        <CenteredMessage>
          <XCircleIcon className="h-10 w-10 text-danger" />
          <p className="text-sm font-semibold text-text">Paiement annulé ou refusé.</p>
          <Link href="/" className="text-sm font-bold text-indigo hover:underline">
            Retourner à l&apos;accueil
          </Link>
        </CenteredMessage>
      </ConfirmationPageShell>
    );
  }

  // state === 'paid'
  return (
    <ConfirmationPageShell>
      <main className="mx-auto max-w-xl px-6 py-10 sm:px-10">
        <div className="mb-6 flex flex-col items-center gap-2 text-center">
          <CheckCircleIcon className="h-10 w-10 text-emerald" />
          <h1 className="text-2xl font-black text-text">Paiement confirmé</h1>
          <p className="text-[13px] text-text-muted">Un email de confirmation a été envoyé.</p>
        </div>

        <Panel title="Récapitulatif">
          {order.items.map((item) => (
            <div key={item.ticketTypeId} className="flex items-center justify-between py-2 text-[13px]">
              <span className="font-semibold text-text">
                {item.quantity}× {item.ticketTypeName}
              </span>
              <span className="font-semibold text-text-muted">
                {formatXof(Number(item.unitPrice) * item.quantity)}
              </span>
            </div>
          ))}
          <div className="mt-3 flex items-center justify-between border-t border-border pt-3 text-[15px] font-extrabold text-text">
            <span>Total</span>
            <span>{formatXof(Number(order.totalAmount))}</span>
          </div>
        </Panel>

        <Panel title="Vos billets">
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
            {order.items.flatMap((item) =>
              item.tickets.map((ticket) => (
                <div key={ticket.id} className="flex flex-col items-center gap-1.5 text-center">
                  {/* eslint-disable-next-line @next/next/no-img-element -- backend-rendered data-URL, not a static/remote asset Next can optimize */}
                  <img
                    src={ticket.qrCode}
                    alt={`Billet ${item.ticketTypeName}`}
                    className="w-full rounded border-[1.5px] border-border"
                  />
                  <span className="text-[11px] font-semibold text-text-muted">{item.ticketTypeName}</span>
                </div>
              )),
            )}
          </div>
        </Panel>
      </main>
    </ConfirmationPageShell>
  );
}
