'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useCurrentUser } from '@/hooks/use-current-user';
import { Sidebar } from '@/components/dashboard/sidebar';
import { EmailVerificationBanner } from '@/components/auth/email-verification-banner';
import { PhoneVerificationBanner } from '@/components/auth/phone-verification-banner';
import { PendingInvitationsBanner } from '@/components/dashboard/pending-invitations-banner';
import type { MemberRole } from '@/types';

const ROLE_LABELS: Record<MemberRole, string> = {
  OWNER: 'Organisateur',
  CO_ORGANIZER: 'Co-organisateur',
  SELLER: 'Vendeur',
  CONTROLLER: 'Contrôleur',
  ACCOUNTANT: 'Comptable',
};

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const { data, isLoading, isError, activeMembership } = useCurrentUser();

  useEffect(() => {
    if (isError) router.replace('/login');
  }, [isError, router]);

  if (isLoading || !data) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-bg text-sm text-text-muted">
        Chargement...
      </div>
    );
  }

  if (!activeMembership) {
    // No longer just the "extremely unlikely" case the original comment
    // described (every registered account gets an OWNER membership at
    // signup) — a freshly-activated invitee (POST /auth/activate-invitation,
    // phone-auth step 4/5, PROGRESS.md) also lands here on first redirect:
    // activation only sets a password, it deliberately never auto-accepts
    // the membership itself, so it's still PENDING. Without this, that
    // person would be stranded on a dead-end message with no way to accept.
    return (
      <div className="flex min-h-screen items-center justify-center bg-bg px-6 text-center">
        <div className="w-full max-w-[480px]">
          <PendingInvitationsBanner
            emptyFallback={
              <p className="text-sm text-text-muted">
                Aucune organisation active n&apos;est associée à ce compte.
              </p>
            }
          />
        </div>
      </div>
    );
  }

  return (
    <div className="grid min-h-screen grid-cols-1 bg-bg lg:grid-cols-[240px_1fr]">
      <Sidebar
        organizationName={activeMembership.organization.name}
        roleLabel={ROLE_LABELS[activeMembership.role] ?? activeMembership.role}
      />
      <div>
        <EmailVerificationBanner user={data} />
        <PhoneVerificationBanner user={data} />
        <PendingInvitationsBanner />
        {children}
      </div>
    </div>
  );
}
