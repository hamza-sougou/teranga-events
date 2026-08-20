'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useCurrentUser } from '@/hooks/use-current-user';
import { Sidebar } from '@/components/dashboard/sidebar';
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
    // Extremely unlikely in practice — every registered account gets an
    // OWNER membership at signup — but fail loud rather than render a
    // dashboard with no organization to scope its data to.
    return (
      <div className="flex min-h-screen items-center justify-center bg-bg px-6 text-center text-sm text-text-muted">
        Aucune organisation active n&apos;est associée à ce compte.
      </div>
    );
  }

  return (
    <div className="grid min-h-screen grid-cols-1 bg-bg lg:grid-cols-[240px_1fr]">
      <Sidebar
        organizationName={activeMembership.organization.name}
        roleLabel={ROLE_LABELS[activeMembership.role] ?? activeMembership.role}
      />
      <div>{children}</div>
    </div>
  );
}
