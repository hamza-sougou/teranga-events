'use client';

import { useQuery } from '@tanstack/react-query';
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';
import { apiClient } from '@/lib/api-client';
import { useCurrentUser } from '@/hooks/use-current-user';
import { queryKeys } from '@/lib/query-keys';
import { Kicker } from '@/components/ui/kicker';
import { Panel } from '@/components/ui/panel';
import { MetricCard } from '@/components/ui/metric-card';
import { PayoutOverviewStatusBadge } from '@/components/ui/status-badge';
import type { PayoutStatus } from '@/types';

interface PayoutOverviewRow {
  eventId: string;
  eventName: string;
  eventEndAt: string;
  amountDue: number;
  payoutStatus: PayoutStatus | null;
  amountPaid: number | null;
  triggeredAt: string | null;
}

function formatXof(amount: number) {
  return `${new Intl.NumberFormat('fr-FR').format(Math.round(amount))} FCFA`;
}

export default function PayoutsPage() {
  const { activeMembership } = useCurrentUser();
  const organizationId = activeMembership?.organizationId;

  const overviewQuery = useQuery<PayoutOverviewRow[]>({
    queryKey: queryKeys.payoutsOverview(organizationId),
    queryFn: async () => (await apiClient.get(`/organizations/${organizationId}/payouts/overview`)).data,
    enabled: !!organizationId,
  });

  const rows = overviewQuery.data ?? [];
  const totalPaid = rows
    .filter((row) => row.payoutStatus === 'PAID')
    .reduce((sum, row) => sum + (row.amountPaid ?? 0), 0);
  const totalUpcoming = rows
    .filter((row) => row.payoutStatus !== 'PAID')
    .reduce((sum, row) => sum + row.amountDue, 0);

  return (
    <main className="px-9 py-[30px] pb-[50px]">
      <div className="mb-[30px]">
        <Kicker />
        <h1 className="text-2xl font-black uppercase tracking-[-0.01em]">Reversements</h1>
        <p className="mt-1.5 text-[13px] text-text-muted">
          L&apos;état des reversements de vos évènements. Un reversement est toujours déclenché automatiquement
          après la fin de l&apos;évènement, jamais avant.
        </p>
      </div>

      {!overviewQuery.isLoading && rows.length > 0 && (
        <div className="mb-[18px] grid grid-cols-1 gap-[14px] sm:grid-cols-2">
          <MetricCard label="Total déjà versé" value={formatXof(totalPaid)} sub="Reçu par vos comptes mobile money" subTone="neutral" />
          <MetricCard label="Total à venir" value={formatXof(totalUpcoming)} sub="Après la fin de chaque évènement" subTone="neutral" />
        </div>
      )}

      <Panel>
        {overviewQuery.isLoading ? (
          <p className="text-sm text-text-muted">Chargement...</p>
        ) : overviewQuery.isError ? (
          <p className="text-sm text-text-muted">Impossible de charger les reversements.</p>
        ) : rows.length === 0 ? (
          <div className="flex flex-col items-center py-10 text-center">
            <p className="text-sm text-text-muted">
              Aucune vente pour l&apos;instant. Les reversements apparaîtront ici dès qu&apos;un évènement aura au
              moins une commande payée.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse">
              <thead>
                <tr>
                  {['Évènement', 'Fin de l’évènement', 'Montant dû', 'Statut'].map((h) => (
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
                {rows.map((row) => (
                  <tr key={row.eventId}>
                    <td className="border-b border-border py-[13px] text-[13px] font-bold">{row.eventName}</td>
                    <td className="border-b border-border py-[13px] text-[13px] text-text-muted">
                      {format(new Date(row.eventEndAt), 'd MMM yyyy, HH:mm', { locale: fr })}
                    </td>
                    <td className="border-b border-border py-[13px] text-[13px] font-extrabold">
                      {formatXof(row.amountDue)}
                    </td>
                    <td className="border-b border-border py-[13px] text-[13px]">
                      <PayoutOverviewStatusBadge
                        payoutStatus={row.payoutStatus}
                        eventEndAt={row.eventEndAt}
                        triggeredAt={row.triggeredAt}
                      />
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
