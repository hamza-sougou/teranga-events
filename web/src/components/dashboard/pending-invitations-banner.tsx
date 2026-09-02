'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';
import { queryKeys } from '@/lib/query-keys';
import { TEAM_ROLE_LABELS } from '@/components/team/team-roles';
import { InlineBanner } from '@/components/ui/inline-banner';
import { Button } from '@/components/ui/button';
import type { MemberRole } from '@/types';

interface PendingInvitation {
  id: string;
  role: MemberRole;
  organization: { id: string; name: string; slug: string };
}

// Closes the real gap left by phone-auth step 2/5 (PROGRESS.md): an account
// that's already active elsewhere and gets invited to a second organization
// has no session-based way to know/act on it — the deferred (batch-dispatch)
// notification just says "log in to accept", but nothing in the frontend
// ever called GET/POST /users/me/invitations... before this. Deliberately
// not the full "Mes invitations" list page (still a separate backlog item,
// its own dedicated session per docs/DESIGN_SYSTEM.md §5) — mounted here
// alongside EmailVerificationBanner/PhoneVerificationBanner in
// (organizer)/dashboard/layout.tsx since it's the same category of
// cross-cutting account state that needs surfacing on every dashboard page.
interface PendingInvitationsBannerProps {
  // Shown instead of rendering nothing once the list is confirmed empty —
  // used by (organizer)/dashboard/layout.tsx's "no active membership"
  // fallback, where a blank screen with zero explanation would otherwise be
  // the norm. Omitted (default) for the normal in-dashboard mount, which is
  // meant to disappear silently when there's nothing to show.
  emptyFallback?: React.ReactNode;
}

export function PendingInvitationsBanner({ emptyFallback = null }: PendingInvitationsBannerProps) {
  const queryClient = useQueryClient();

  const invitationsQuery = useQuery<PendingInvitation[]>({
    queryKey: queryKeys.myInvitations(),
    queryFn: async () => (await apiClient.get('/users/me/invitations')).data,
  });

  const respondMutation = useMutation({
    mutationFn: ({ id, action }: { id: string; action: 'accept' | 'decline' }) =>
      apiClient.post(`/users/me/invitations/${id}/${action}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.myInvitations() });
      // A newly-accepted membership can change which organization
      // useCurrentUser() resolves as activeMembership — refetch /auth/me too.
      queryClient.invalidateQueries({ queryKey: ['me'] });
    },
  });

  if (invitationsQuery.isLoading) return null;

  const invitations = invitationsQuery.data ?? [];
  if (invitations.length === 0) return <>{emptyFallback}</>;

  return (
    <>
      {invitations.map((invitation) => (
        <InlineBanner key={invitation.id} tone="pending" className="mx-6 mt-6 flex items-center justify-between gap-3">
          <span>
            Vous avez été invité(e) à rejoindre <strong>{invitation.organization.name}</strong> en tant que{' '}
            {TEAM_ROLE_LABELS[invitation.role].toLowerCase()}.
          </span>
          <div className="flex shrink-0 items-center gap-2">
            <Button
              type="button"
              loading={respondMutation.isPending && respondMutation.variables?.id === invitation.id}
              onClick={() => respondMutation.mutate({ id: invitation.id, action: 'accept' })}
            >
              Accepter
            </Button>
            <Button
              type="button"
              variant="ghost"
              disabled={respondMutation.isPending}
              onClick={() => respondMutation.mutate({ id: invitation.id, action: 'decline' })}
            >
              Refuser
            </Button>
          </div>
        </InlineBanner>
      ))}
    </>
  );
}
