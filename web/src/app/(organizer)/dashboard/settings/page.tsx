'use client';

import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';
import { useCurrentUser } from '@/hooks/use-current-user';
import { queryKeys } from '@/lib/query-keys';
import { canManagePayoutMethod, canManageTeam } from '@/lib/rbac';
import { Kicker } from '@/components/ui/kicker';
import { Panel } from '@/components/ui/panel';
import { OrganizationProfileForm } from '@/components/settings/organization-profile-form';
import { PayoutMethodForm } from '@/components/settings/payout-method-form';
import { ChangePasswordForm } from '@/components/settings/change-password-form';
import type { OrganizationProfile } from '@/types';

export default function SettingsPage() {
  const { data: currentUser, activeMembership } = useCurrentUser();
  const organizationId = activeMembership?.organizationId;
  const canManageProfile = canManageTeam(activeMembership?.role);
  const canManagePayout = canManagePayoutMethod(activeMembership?.role);

  const profileQuery = useQuery<OrganizationProfile>({
    queryKey: queryKeys.orgProfile(organizationId),
    queryFn: async () => (await apiClient.get(`/organizations/${organizationId}`)).data,
    enabled: !!organizationId,
  });

  return (
    <main className="px-9 py-[30px] pb-[50px]">
      <div className="mb-[30px]">
        <Kicker />
        <h1 className="text-2xl font-black uppercase tracking-[-0.01em]">Paramètres</h1>
        <p className="mt-1.5 text-[13px] text-text-muted">
          Les informations de votre organisation et de votre compte.
        </p>
      </div>

      {profileQuery.isLoading ? (
        <p className="text-sm text-text-muted">Chargement...</p>
      ) : profileQuery.isError || !organizationId || !profileQuery.data ? (
        <p className="text-sm text-text-muted">Impossible de charger les paramètres.</p>
      ) : (
        <>
          <OrganizationProfileForm
            organizationId={organizationId}
            profile={profileQuery.data}
            canManage={canManageProfile}
          />
          <PayoutMethodForm
            organizationId={organizationId}
            payoutPhoneNumber={profileQuery.data.payoutPhoneNumber}
            canManage={canManagePayout}
          />
        </>
      )}

      {currentUser && (
        <Panel title="Mon compte">
          {currentUser.hasPassword ? (
            <ChangePasswordForm />
          ) : (
            <p className="text-[13px] text-text-muted">
              Vous êtes connecté via Google — aucun mot de passe à gérer ici.
            </p>
          )}
        </Panel>
      )}
    </main>
  );
}
