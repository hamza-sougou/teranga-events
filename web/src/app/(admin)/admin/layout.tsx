'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useCurrentUser } from '@/hooks/use-current-user';
import { AdminSidebar } from '@/components/admin/admin-sidebar';

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const { data, isLoading, isError } = useCurrentUser();

  useEffect(() => {
    if (isError) router.replace('/login');
    // Defense in depth alongside the backend SuperAdminGuard — a regular
    // organizer should never see this shell, even empty.
    else if (data && !data.isSuperAdmin) router.replace('/dashboard');
  }, [isError, data, router]);

  if (isLoading || !data || !data.isSuperAdmin) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-bg text-sm text-text-muted">
        Chargement...
      </div>
    );
  }

  return (
    <div className="grid min-h-screen grid-cols-1 bg-bg lg:grid-cols-[240px_1fr]">
      <AdminSidebar fullName={data.fullName} />
      <div>{children}</div>
    </div>
  );
}
