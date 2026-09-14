'use client';

import { useSearchParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { apiClient } from '@/lib/api-client';
import { CheckCircleIcon } from '@/components/ui/icons';
import { buttonClasses } from '@/components/ui/button';

// Backend GET /unsubscribe?token=... always resolves 200 { success: true },
// even for a garbage or already-used token (unsubscribe.controller.ts) — so
// there is only ever one generic confirmation to show once the call
// completes, matching the "never confirm/deny a subscription's existence"
// decision already applied to the subscribe/unsubscribe POST endpoints.
export default function UnsubscribePage() {
  const searchParams = useSearchParams();
  const token = searchParams.get('token');

  const query = useQuery({
    queryKey: ['public-unsubscribe-token', token],
    queryFn: async () => (await apiClient.get('/unsubscribe', { params: { token } })).data,
    enabled: !!token,
    retry: false,
  });

  return (
    <main className="flex min-h-[60vh] flex-col items-center justify-center gap-4 px-6 py-16 text-center">
      {!token ? (
        <p className="text-sm font-semibold text-text-muted">Lien de désabonnement invalide.</p>
      ) : query.isLoading ? (
        <p className="text-sm font-semibold text-text-muted">Désabonnement en cours...</p>
      ) : (
        <>
          <CheckCircleIcon className="h-10 w-10 text-emerald" />
          <p className="text-[15px] font-bold text-text">Vous ne recevrez plus d&apos;emails de cet organisateur.</p>
          <Link href="/" className={buttonClasses('ghost')}>
            Retour à l&apos;accueil
          </Link>
        </>
      )}
    </main>
  );
}
