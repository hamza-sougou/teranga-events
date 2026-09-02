'use client';

import Link from 'next/link';
import { useState } from 'react';
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';
import { queryKeys } from '@/lib/query-keys';
import { getApiErrorMessage } from '@/lib/api-errors';
import { formatXof } from '@/lib/utils';
import { Kicker } from '@/components/ui/kicker';
import { Panel } from '@/components/ui/panel';
import { MetricCard } from '@/components/ui/metric-card';
import { InlineBanner } from '@/components/ui/inline-banner';
import { Button } from '@/components/ui/button';
import type { AdminFinanceOverview } from '@/types';

const MONTH_LABELS = [
  'Jan', 'Fév', 'Mar', 'Avr', 'Mai', 'Jun', 'Jul', 'Aoû', 'Sep', 'Oct', 'Nov', 'Déc',
];

function formatMonth(month: string) {
  const [year, m] = month.split('-').map(Number);
  return `${MONTH_LABELS[m - 1]} ${year}`;
}

export default function AdminFinancesPage() {
  const queryClient = useQueryClient();
  const [actionError, setActionError] = useState<string | null>(null);

  const overviewQuery = useQuery<AdminFinanceOverview>({
    queryKey: queryKeys.adminFinanceOverview(),
    queryFn: async () => (await apiClient.get('/admin/finance/overview')).data,
  });

  const retryMutation = useMutation({
    mutationFn: (eventId: string) => apiClient.post(`/admin/events/${eventId}/payout`),
    onSuccess: () => {
      setActionError(null);
      queryClient.invalidateQueries({ queryKey: queryKeys.adminFinanceOverview() });
    },
    onError: (err) => setActionError(getApiErrorMessage(err)),
  });

  function handleRetry(eventName: string, eventId: string) {
    if (window.confirm(`Relancer le reversement pour "${eventName}" ? Ceci déclenche un vrai transfert d'argent.`)) {
      retryMutation.mutate(eventId);
    }
  }

  if (overviewQuery.isLoading) {
    return <main className="px-9 py-[30px] text-sm text-text-muted">Chargement...</main>;
  }

  if (overviewQuery.isError || !overviewQuery.data) {
    return <main className="px-9 py-[30px] text-sm text-text-muted">Impossible de charger les finances plateforme.</main>;
  }

  const overview = overviewQuery.data;

  return (
    <main className="px-9 py-[30px] pb-[50px]">
      <div className="mb-[30px]">
        <Kicker />
        <h1 className="text-2xl font-black uppercase tracking-[-0.01em]">Finances plateforme</h1>
        <p className="mt-1.5 text-[13px] text-text-muted">
          Vue d&apos;ensemble, toutes organisations confondues.{' '}
          <Link href="/admin/organizations" className="font-bold text-indigo">
            Voir la ventilation par organisateur →
          </Link>
        </p>
      </div>

      <div className="mb-[30px] grid grid-cols-2 gap-4 lg:grid-cols-4">
        <MetricCard label="Volume de ventes (GMV)" value={formatXof(overview.gmv)} sub={`${overview.paidOrdersCount} commande(s) payée(s)`} subTone="neutral" />
        <MetricCard label="Commission plateforme" value={formatXof(overview.platformCommission)} sub="5% net, tous canaux" subTone="neutral" />
        <MetricCard label="Déjà versé aux organisateurs" value={formatXof(overview.payouts.totalPaidOut)} />
        <MetricCard
          label="En attente de reversement"
          value={formatXof(overview.payouts.totalPending)}
          sub={overview.payouts.failedPayouts.length > 0 ? `${overview.payouts.failedPayouts.length} en échec` : undefined}
          subTone="neutral"
        />
      </div>

      <Panel title="Croissance — 6 derniers mois">
        {/* whitespace-nowrap: "Mois" combines month+year in one cell ("Avr
            2026") — without it, a narrowed column wraps that value onto two
            lines and collides with the adjacent count column at 375px.
            Forces real horizontal scroll (the overflow-x-auto wrapper below)
            instead of a cramped squeeze. */}
        <div className="overflow-x-auto">
          <table className="w-full border-collapse whitespace-nowrap">
            <thead>
              <tr>
                {['Mois', 'Nouveaux organisateurs', 'Nouveaux évènements', 'Billets vendus'].map((h) => (
                  <th
                    key={h}
                    className="border-b-[1.5px] border-border pb-2.5 pr-6 text-left text-[11px] font-bold uppercase tracking-[0.04em] text-text-muted"
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {overview.growth.map((row) => (
                <tr key={row.month}>
                  <td className="border-b border-border py-[13px] pr-6 text-[13px] font-bold">{formatMonth(row.month)}</td>
                  <td className="border-b border-border py-[13px] pr-6 text-[13px]">{row.newOrganizations}</td>
                  <td className="border-b border-border py-[13px] pr-6 text-[13px]">{row.newEvents}</td>
                  <td className="border-b border-border py-[13px] text-[13px]">{row.ticketsSold}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>

      <Panel title="Reversements en échec">
        {actionError && <InlineBanner tone="error">{actionError}</InlineBanner>}

        {overview.payouts.failedPayouts.length === 0 ? (
          <p className="py-6 text-center text-sm text-text-muted">Aucun reversement en échec pour l&apos;instant.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse">
              <thead>
                <tr>
                  {['Évènement', 'Organisation', 'Montant dû', 'Erreur', 'Date', ''].map((h) => (
                    <th
                      key={h}
                      className="border-b-[1.5px] border-border pb-2.5 text-left text-[11px] font-bold uppercase tracking-[0.04em] text-text-muted"
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {overview.payouts.failedPayouts.map((payout) => (
                  <tr key={payout.eventId}>
                    <td className="border-b border-border py-[13px] text-[13px] font-bold">{payout.eventName}</td>
                    <td className="border-b border-border py-[13px] text-[13px]">{payout.organizationName}</td>
                    <td className="border-b border-border py-[13px] text-[13px]">{formatXof(payout.amountDue)}</td>
                    <td className="border-b border-border py-[13px] text-[13px] text-text-muted">
                      {payout.errorMessage ?? '—'}
                    </td>
                    <td className="border-b border-border py-[13px] text-[13px] text-text-muted">
                      {payout.triggeredAt ? format(new Date(payout.triggeredAt), 'd MMM yyyy', { locale: fr }) : '—'}
                    </td>
                    <td className="border-b border-border py-[13px] text-right text-[13px]">
                      <Button
                        variant="ghost"
                        disabled={retryMutation.isPending}
                        onClick={() => handleRetry(payout.eventName, payout.eventId)}
                      >
                        Réessayer
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
    </main>
  );
}
