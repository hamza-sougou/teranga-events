'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';
import { queryKeys } from '@/lib/query-keys';
import { getApiErrorMessage } from '@/lib/api-errors';
import { Modal } from '@/components/ui/modal';
import { InlineBanner } from '@/components/ui/inline-banner';
import { Avatar } from '@/components/ui/avatar';
import { RowMenu } from '@/components/ui/row-menu';
import { MemberStatusBadge } from '@/components/ui/status-badge';
import { TEAM_ROLE_LABELS } from '@/components/team/team-roles';
import type { AdminOrgMember } from '@/types';

interface OrganizationTeamModalProps {
  open: boolean;
  onClose: () => void;
  organizationId: string;
  organizationName: string;
}

// Reuses the existing organizer-facing team endpoints as-is
// (GET/PATCH /organizations/:organizationId/members) — OrganizationRolesGuard
// already lets a Super Admin call them on any organization, so there is no
// dedicated admin mutation endpoint here, only this read/UI surface.
// The OWNER row is never shown (same filter as dashboard/team/page.tsx) —
// suspending the account owner goes through the organization-level
// suspension action instead (PATCH /admin/organizations/:id/suspension).
export function OrganizationTeamModal({ open, onClose, organizationId, organizationName }: OrganizationTeamModalProps) {
  const queryClient = useQueryClient();
  const [actionError, setActionError] = useState<string | null>(null);

  const membersQuery = useQuery<AdminOrgMember[]>({
    queryKey: queryKeys.adminOrgMembers(organizationId),
    queryFn: async () => (await apiClient.get(`/organizations/${organizationId}/members`)).data,
    enabled: open,
  });

  const statusMutation = useMutation({
    mutationFn: ({ memberId, status }: { memberId: string; status: 'ACTIVE' | 'SUSPENDED' }) =>
      apiClient.patch(`/organizations/${organizationId}/members/${memberId}`, { status }),
    onSuccess: () => {
      setActionError(null);
      queryClient.invalidateQueries({ queryKey: queryKeys.adminOrgMembers(organizationId) });
    },
    onError: (err) => setActionError(getApiErrorMessage(err)),
  });

  const members = (membersQuery.data ?? []).filter((m) => m.role !== 'OWNER');

  return (
    <Modal open={open} onClose={onClose} title={`Équipe — ${organizationName}`}>
      {actionError && <InlineBanner tone="error">{actionError}</InlineBanner>}

      {membersQuery.isLoading ? (
        <p className="text-sm text-text-muted">Chargement...</p>
      ) : membersQuery.isError ? (
        <p className="text-sm text-text-muted">Impossible de charger l&apos;équipe.</p>
      ) : members.length === 0 ? (
        <p className="py-6 text-center text-sm text-text-muted">Aucun membre d&apos;équipe pour cette organisation.</p>
      ) : (
        <div className="space-y-2">
          {members.map((member) => (
            <div key={member.id} className="flex items-center justify-between gap-2.5 rounded border border-border p-2.5">
              <div className="flex items-center gap-2.5">
                <Avatar name={member.user.fullName} />
                <div>
                  <div className="text-[13px] font-bold">{member.user.fullName}</div>
                  <div className="text-[11px] text-text-muted">
                    {member.user.email} — {TEAM_ROLE_LABELS[member.role]}
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-2.5">
                <MemberStatusBadge status={member.status} />
                <RowMenu
                  items={
                    member.status === 'SUSPENDED'
                      ? [{ label: 'Réactiver', onClick: () => statusMutation.mutate({ memberId: member.id, status: 'ACTIVE' }) }]
                      : [
                          {
                            label: 'Suspendre',
                            tone: 'danger',
                            onClick: () => statusMutation.mutate({ memberId: member.id, status: 'SUSPENDED' }),
                          },
                        ]
                  }
                />
              </div>
            </div>
          ))}
        </div>
      )}
    </Modal>
  );
}
