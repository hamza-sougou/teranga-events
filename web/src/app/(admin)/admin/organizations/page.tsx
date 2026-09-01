'use client';

import { useState } from 'react';
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';
import { queryKeys } from '@/lib/query-keys';
import { getApiErrorMessage } from '@/lib/api-errors';
import { Kicker } from '@/components/ui/kicker';
import { Panel } from '@/components/ui/panel';
import { InlineBanner } from '@/components/ui/inline-banner';
import { RowMenu } from '@/components/ui/row-menu';
import { OrganizationVerificationBadge, OrganizationSuspensionBadge } from '@/components/ui/status-badge';
import { OrganizationTeamModal } from '@/components/admin/organization-team-modal';
import type { AdminOrganizationListItem } from '@/types';

function formatXof(amount: number) {
  return `${new Intl.NumberFormat('fr-FR').format(Math.round(amount))} FCFA`;
}

export default function AdminOrganizationsPage() {
  const queryClient = useQueryClient();
  const [actionError, setActionError] = useState<string | null>(null);
  const [teamModalOrg, setTeamModalOrg] = useState<AdminOrganizationListItem | null>(null);

  const organizationsQuery = useQuery<AdminOrganizationListItem[]>({
    queryKey: queryKeys.adminOrganizations(),
    queryFn: async () => (await apiClient.get('/admin/organizations')).data,
  });

  const verificationMutation = useMutation({
    mutationFn: ({ organizationId, isVerified }: { organizationId: string; isVerified: boolean }) =>
      apiClient.patch(`/admin/organizations/${organizationId}/verification`, { isVerified }),
    onSuccess: () => {
      setActionError(null);
      queryClient.invalidateQueries({ queryKey: queryKeys.adminOrganizations() });
    },
    onError: (err) => setActionError(getApiErrorMessage(err)),
  });

  const suspensionMutation = useMutation({
    mutationFn: ({ organizationId, suspended }: { organizationId: string; suspended: boolean }) =>
      apiClient.patch(`/admin/organizations/${organizationId}/suspension`, { suspended }),
    onSuccess: () => {
      setActionError(null);
      queryClient.invalidateQueries({ queryKey: queryKeys.adminOrganizations() });
    },
    onError: (err) => setActionError(getApiErrorMessage(err)),
  });

  function handleSuspend(org: AdminOrganizationListItem) {
    if (window.confirm(`Suspendre le compte de ${org.name} ? Toute action de l'équipe sera bloquée, les évènements masqués du public et l'achat de billets bloqué.`)) {
      suspensionMutation.mutate({ organizationId: org.id, suspended: true });
    }
  }

  const organizations = organizationsQuery.data ?? [];

  return (
    <main className="px-9 py-[30px] pb-[50px]">
      <div className="mb-[30px]">
        <Kicker />
        <h1 className="text-2xl font-black uppercase tracking-[-0.01em]">Organisations</h1>
        <p className="mt-1.5 text-[13px] text-text-muted">
          Validez ou rejetez les organisateurs de la plateforme.
        </p>
      </div>

      <Panel>
        {actionError && <InlineBanner tone="error">{actionError}</InlineBanner>}

        {organizationsQuery.isLoading ? (
          <p className="text-sm text-text-muted">Chargement...</p>
        ) : organizationsQuery.isError ? (
          <p className="text-sm text-text-muted">Impossible de charger les organisations.</p>
        ) : organizations.length === 0 ? (
          <p className="py-10 text-center text-sm text-text-muted">Aucune organisation pour l&apos;instant.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse">
              <thead>
                <tr>
                  {['Organisation', 'Contact', 'Évènements', 'Volume de ventes', 'Statut', 'Compte', ''].map((h) => (
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
                {organizations.map((org) => (
                  <tr key={org.id}>
                    <td className="border-b border-border py-[13px] text-[13px]">
                      <div className="font-bold">{org.name}</div>
                      <div className="text-[11px] text-text-muted">
                        Créée le {format(new Date(org.createdAt), 'd MMM yyyy', { locale: fr })}
                      </div>
                    </td>
                    <td className="border-b border-border py-[13px] text-[13px]">
                      <div className="font-semibold">{org.contactEmail ?? org.owner.email}</div>
                      {org.contactPhone && <div className="text-[11px] text-text-muted">{org.contactPhone}</div>}
                    </td>
                    <td className="border-b border-border py-[13px] text-[13px]">{org.eventsCount}</td>
                    <td className="border-b border-border py-[13px] text-[13px]">{formatXof(org.salesVolume)}</td>
                    <td className="border-b border-border py-[13px] text-[13px]">
                      <OrganizationVerificationBadge isVerified={org.isVerified} />
                    </td>
                    <td className="border-b border-border py-[13px] text-[13px]">
                      <OrganizationSuspensionBadge suspendedAt={org.suspendedAt} />
                    </td>
                    <td className="border-b border-border py-[13px] text-right text-[13px]">
                      <RowMenu
                        items={[
                          ...(org.isVerified
                            ? [
                                {
                                  label: 'Rejeter',
                                  tone: 'danger' as const,
                                  onClick: () =>
                                    verificationMutation.mutate({ organizationId: org.id, isVerified: false }),
                                },
                              ]
                            : [
                                {
                                  label: 'Valider',
                                  onClick: () =>
                                    verificationMutation.mutate({ organizationId: org.id, isVerified: true }),
                                },
                              ]),
                          { label: "Voir l'équipe", onClick: () => setTeamModalOrg(org) },
                          org.suspendedAt
                            ? {
                                label: 'Réactiver le compte',
                                onClick: () =>
                                  suspensionMutation.mutate({ organizationId: org.id, suspended: false }),
                              }
                            : {
                                label: 'Suspendre le compte',
                                tone: 'danger' as const,
                                onClick: () => handleSuspend(org),
                              },
                        ]}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>

      {teamModalOrg && (
        <OrganizationTeamModal
          open={!!teamModalOrg}
          onClose={() => setTeamModalOrg(null)}
          organizationId={teamModalOrg.id}
          organizationName={teamModalOrg.name}
        />
      )}
    </main>
  );
}
