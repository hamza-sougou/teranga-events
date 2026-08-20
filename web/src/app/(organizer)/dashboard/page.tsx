'use client';

import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';
import { apiClient } from '@/lib/api-client';
import { useCurrentUser } from '@/hooks/use-current-user';
import { Kicker } from '@/components/ui/kicker';
import { buttonClasses } from '@/components/ui/button';
import { MetricCard } from '@/components/ui/metric-card';
import { Panel } from '@/components/ui/panel';
import { Avatar } from '@/components/ui/avatar';
import { EventStatusBadge, PayoutStatusBadge } from '@/components/ui/status-badge';
import { SalesChart } from '@/components/dashboard/sales-chart';
import { BellIcon } from '@/components/dashboard/nav-icons';
import type { EventStatus, MemberRole, MemberStatus, PayoutStatus } from '@/types';

interface OrgStats {
  totalEvents: number;
  eventsByStatus: Record<EventStatus, number>;
  capacity: { total: number; reserved: number; available: number };
  fillRate: number;
  revenue: {
    grossRevenue: number;
    organizerRevenue: number;
    platformCommission: number;
    currency: string;
    paidOrdersCount: number;
  };
  recentEvents: {
    id: string;
    name: string;
    slug: string;
    status: EventStatus;
    startAt: string;
    venueName: string | null;
    ticketsSold: number;
    ticketsTotal: number;
    revenue: number;
  }[];
  weeklySales: { date: string; ordersCount: number }[];
}

interface Member {
  id: string;
  role: MemberRole;
  status: MemberStatus;
  user: { id: string; fullName: string; email: string };
}

interface Payout {
  id: string;
  status: PayoutStatus;
  amountDue: string;
  amountPaid: string | null;
  triggeredAt: string | null;
  createdAt: string;
  event: { id: string; name: string };
}

const ROLE_LABELS: Record<MemberRole, string> = {
  OWNER: 'Organisateur',
  CO_ORGANIZER: 'Co-organisatrice',
  SELLER: 'Vendeur',
  CONTROLLER: 'Contrôleur',
  ACCOUNTANT: 'Comptable',
};

function formatXof(amount: number) {
  return `${new Intl.NumberFormat('fr-FR').format(Math.round(amount))} FCFA`;
}

export default function DashboardPage() {
  const { activeMembership } = useCurrentUser();
  const organizationId = activeMembership?.organizationId;

  const statsQuery = useQuery<OrgStats>({
    queryKey: ['org-stats', organizationId],
    queryFn: async () => (await apiClient.get(`/organizations/${organizationId}/stats`)).data,
    enabled: !!organizationId,
  });

  const membersQuery = useQuery<Member[]>({
    queryKey: ['org-members', organizationId],
    queryFn: async () => (await apiClient.get(`/organizations/${organizationId}/members`)).data,
    enabled: !!organizationId,
  });

  const payoutsQuery = useQuery<Payout[]>({
    queryKey: ['org-payouts', organizationId],
    queryFn: async () => (await apiClient.get(`/organizations/${organizationId}/payouts`)).data,
    enabled: !!organizationId,
  });

  const stats = statsQuery.data;
  const members = (membersQuery.data ?? []).filter((m) => m.status === 'ACTIVE').slice(0, 5);
  const payouts = (payoutsQuery.data ?? []).slice(0, 5);

  // The system only creates a payout row once an event has actually ended
  // (CLAUDE.md — never on a fixed schedule). There is no "scheduled future
  // payout date" to show as-is, so this is adapted from the mockup: the
  // soonest upcoming published event's end date, which is genuinely when a
  // payout would next be triggered for it.
  const nextUpcomingEvent = stats?.recentEvents
    .filter((e) => e.status === 'PUBLISHED' && new Date(e.startAt) > new Date())
    .sort((a, b) => new Date(a.startAt).getTime() - new Date(b.startAt).getTime())[0];

  if (statsQuery.isLoading) {
    return <main className="px-9 py-[30px] text-sm text-text-muted">Chargement...</main>;
  }

  if (statsQuery.isError || !stats) {
    return <main className="px-9 py-[30px] text-sm text-text-muted">Impossible de charger le tableau de bord.</main>;
  }

  return (
    <main className="px-9 py-[30px] pb-[50px]">
      <div className="mb-[30px] flex items-center justify-between">
        <div>
          <Kicker />
          <h1 className="text-2xl font-black uppercase tracking-[-0.01em]">Tableau de bord</h1>
        </div>
        <div className="flex items-center gap-3.5">
          <button
            type="button"
            aria-label="Notifications"
            className="relative flex h-[38px] w-[38px] items-center justify-center rounded border-[1.5px] border-border bg-card text-text-muted"
          >
            <BellIcon className="h-[17px] w-[17px]" />
          </button>
          <Link href="/dashboard/events" className={buttonClasses('ghost')}>
            Voir tout
          </Link>
          <Link href="/dashboard/events/new" className={buttonClasses('primary')}>
            Créer un évènement
          </Link>
        </div>
      </div>

      <div className="mb-[30px] grid grid-cols-2 gap-4 lg:grid-cols-4">
        <MetricCard
          label="Billets vendus"
          value={
            <>
              {stats.capacity.reserved}{' '}
              <span className="text-sm font-bold text-text-muted">/ {stats.capacity.total}</span>
            </>
          }
          progress={stats.fillRate * 100}
        />
        <MetricCard label="Revenus nets" value={formatXof(stats.revenue.organizerRevenue)} sub="Part organisateur" subTone="neutral" />
        <MetricCard
          label="Taux de remplissage"
          value={`${Math.round(stats.fillRate * 100)}%`}
          sub={`${stats.eventsByStatus.PUBLISHED} évènement(s) publié(s)`}
          subTone="neutral"
        />
        <MetricCard
          label="Prochain reversement"
          value={nextUpcomingEvent ? format(new Date(nextUpcomingEvent.startAt), 'd MMM', { locale: fr }) : '—'}
          sub="Déclenché après la fin de l'évènement"
          subTone="neutral"
        />
      </div>

      <div className="grid grid-cols-1 gap-[18px] lg:grid-cols-[1.6fr_1fr]">
        <div>
          <Panel title="Ventes — 7 derniers jours">
            <SalesChart data={stats.weeklySales} />
          </Panel>

          <Panel
            title="Vos évènements"
            action={
              <Link href="/dashboard/events" className="text-xs font-bold text-indigo">
                Voir tout
              </Link>
            }
          >
            {stats.recentEvents.length === 0 ? (
              <p className="text-sm text-text-muted">Aucun évènement pour l&apos;instant.</p>
            ) : (
              <table className="w-full border-collapse">
                <thead>
                  <tr>
                    {['Évènement', 'Statut', 'Billets', 'Revenus'].map((h) => (
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
                  {stats.recentEvents.map((event) => (
                    <tr key={event.id}>
                      <td className="border-b border-border py-[13px] text-[13px]">
                        <div className="font-bold">{event.name}</div>
                        <div className="text-xs text-text-muted">
                          {format(new Date(event.startAt), 'd MMM', { locale: fr })}
                          {event.venueName ? ` · ${event.venueName}` : ''}
                        </div>
                      </td>
                      <td className="border-b border-border py-[13px] text-[13px]">
                        <EventStatusBadge status={event.status} />
                      </td>
                      <td className="border-b border-border py-[13px] text-[13px]">
                        {event.ticketsSold} / {event.ticketsTotal}
                      </td>
                      <td className="border-b border-border py-[13px] text-[13px]">
                        {event.revenue > 0 ? formatXof(event.revenue) : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </Panel>
        </div>

        <div>
          <Panel
            title="Équipe active"
            action={
              <Link href="/dashboard/team" className="text-xs font-bold text-indigo">
                Gérer
              </Link>
            }
          >
            {members.length === 0 ? (
              <p className="text-sm text-text-muted">Aucun membre pour l&apos;instant.</p>
            ) : (
              members.map((member) => (
                <div key={member.id} className="flex items-center gap-2.5 border-b border-border py-2.5 last:border-none">
                  <Avatar name={member.user.fullName} />
                  <div>
                    <div className="text-[13px] font-bold">{member.user.fullName}</div>
                    <div className="text-[11px] text-text-muted">{ROLE_LABELS[member.role]}</div>
                  </div>
                </div>
              ))
            )}
          </Panel>

          <Panel title="Reversements">
            {payouts.length === 0 ? (
              <p className="text-sm text-text-muted">Aucun reversement pour l&apos;instant.</p>
            ) : (
              payouts.map((payout) => (
                <div key={payout.id} className="border-b border-border py-3 last:border-none">
                  <div className="mb-1 flex items-center justify-between">
                    <span className="text-[13px] font-bold">{payout.event.name}</span>
                    <span className="text-[13px] font-extrabold">{formatXof(Number(payout.amountDue))}</span>
                  </div>
                  <div className="flex items-center gap-1.5 text-[11px] text-text-muted">
                    <PayoutStatusBadge status={payout.status} />
                    {payout.triggeredAt && <span>le {format(new Date(payout.triggeredAt), 'd MMM', { locale: fr })}</span>}
                  </div>
                </div>
              ))
            )}
          </Panel>
        </div>
      </div>
    </main>
  );
}
