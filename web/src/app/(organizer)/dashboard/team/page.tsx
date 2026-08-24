'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';
import { useCurrentUser } from '@/hooks/use-current-user';
import { queryKeys } from '@/lib/query-keys';
import { canManageTeam } from '@/lib/rbac';
import { getApiErrorMessage } from '@/lib/api-errors';
import { Kicker } from '@/components/ui/kicker';
import { Panel } from '@/components/ui/panel';
import { InlineBanner } from '@/components/ui/inline-banner';
import { Avatar } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { RowMenu } from '@/components/ui/row-menu';
import { MemberStatusBadge } from '@/components/ui/status-badge';
import { UserPlusIcon } from '@/components/ui/icons';
import { InviteMemberModal } from '@/components/team/invite-member-modal';
import { EditMemberRoleModal } from '@/components/team/edit-member-role-modal';
import { TEAM_ROLE_LABELS } from '@/components/team/team-roles';
import type { MemberRole, MemberStatus } from '@/types';

interface Member {
  id: string;
  role: MemberRole;
  status: MemberStatus;
  user: { id: string; fullName: string; email: string };
}

export default function TeamPage() {
  const queryClient = useQueryClient();
  const { activeMembership } = useCurrentUser();
  const organizationId = activeMembership?.organizationId;
  const canManage = canManageTeam(activeMembership?.role);

  const [showInviteModal, setShowInviteModal] = useState(false);
  const [editingMember, setEditingMember] = useState<Member | null>(null);
  const [removeError, setRemoveError] = useState<string | null>(null);

  const membersQuery = useQuery<Member[]>({
    queryKey: queryKeys.teamMembers(organizationId),
    queryFn: async () => (await apiClient.get(`/organizations/${organizationId}/members`)).data,
    enabled: !!organizationId,
  });

  const removeMutation = useMutation({
    mutationFn: (memberId: string) => apiClient.delete(`/organizations/${organizationId}/members/${memberId}`),
    onSuccess: () => {
      setRemoveError(null);
      queryClient.invalidateQueries({ queryKey: queryKeys.teamMembers(organizationId) });
    },
    onError: (err) => setRemoveError(getApiErrorMessage(err)),
  });

  function handleRemove(member: Member) {
    if (window.confirm(`Retirer ${member.user.fullName} de l'équipe ?`)) {
      removeMutation.mutate(member.id);
    }
  }

  // The owner's own membership row is never shown here — they're the account
  // holder, not an "invited" teammate (docs given for this page, §1).
  const members = (membersQuery.data ?? []).filter((m) => m.role !== 'OWNER');

  return (
    <main className="px-9 py-[30px] pb-[50px]">
      <div className="mb-[30px] flex items-start justify-between gap-4">
        <div>
          <Kicker />
          <h1 className="text-2xl font-black uppercase tracking-[-0.01em]">Équipe</h1>
          <p className="mt-1.5 text-[13px] text-text-muted">
            Les personnes qui ont accès à la gestion de vos évènements.
          </p>
        </div>
        {canManage && (
          <Button type="button" onClick={() => setShowInviteModal(true)}>
            <UserPlusIcon className="h-3.5 w-3.5" /> Inviter un membre
          </Button>
        )}
      </div>

      <Panel>
        {removeError && <InlineBanner tone="error">{removeError}</InlineBanner>}

        {membersQuery.isLoading ? (
          <p className="text-sm text-text-muted">Chargement...</p>
        ) : membersQuery.isError ? (
          <p className="text-sm text-text-muted">Impossible de charger l&apos;équipe.</p>
        ) : members.length === 0 ? (
          <div className="flex flex-col items-center py-10 text-center">
            <p className="mb-4 text-sm text-text-muted">
              Aucun membre pour l&apos;instant. Invitez un co-organisateur, un vendeur, un contrôleur ou un comptable
              pour partager la gestion de votre compte.
            </p>
            {canManage && (
              <Button type="button" onClick={() => setShowInviteModal(true)}>
                <UserPlusIcon className="h-3.5 w-3.5" /> Inviter le premier membre
              </Button>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse">
              <thead>
                <tr>
                  {['Membre', 'Rôle', 'Statut', ''].map((h) => (
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
                {members.map((member) => (
                  <tr key={member.id}>
                    <td className="border-b border-border py-[13px] text-[13px]">
                      <div className="flex items-center gap-2.5">
                        <Avatar name={member.user.fullName} />
                        <div>
                          <div className="font-bold">{member.user.fullName}</div>
                          <div className="text-[11px] text-text-muted">{member.user.email}</div>
                        </div>
                      </div>
                    </td>
                    <td className="border-b border-border py-[13px] text-[13px]">{TEAM_ROLE_LABELS[member.role]}</td>
                    <td className="border-b border-border py-[13px] text-[13px]">
                      <MemberStatusBadge status={member.status} />
                    </td>
                    <td className="border-b border-border py-[13px] text-right text-[13px]">
                      {canManage && (
                        <RowMenu
                          items={[
                            { label: 'Modifier le rôle', onClick: () => setEditingMember(member) },
                            { label: "Retirer de l'équipe", tone: 'danger', onClick: () => handleRemove(member) },
                          ]}
                        />
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>

      {showInviteModal && organizationId && (
        <InviteMemberModal open={showInviteModal} onClose={() => setShowInviteModal(false)} organizationId={organizationId} />
      )}
      {editingMember && organizationId && (
        <EditMemberRoleModal
          open={!!editingMember}
          onClose={() => setEditingMember(null)}
          organizationId={organizationId}
          member={editingMember}
        />
      )}
    </main>
  );
}
