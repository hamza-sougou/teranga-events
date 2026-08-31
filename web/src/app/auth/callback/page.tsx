'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { setToken } from '@/lib/auth';
import { setGooglePendingToken } from '@/lib/google-pending-token';
import { interpretGoogleCallback } from '@/lib/interpret-google-callback';

// login_linked gets a brief pause with a confirmation message before
// redirecting — same auto-dismiss reasoning as mobile-scan's
// ScanResultOverlay ("compte relié à Google" has real value here, avoiding
// "did this just create a new account?" confusion, but must never block).
const LOGIN_LINKED_DISPLAY_MS = 1200;

export default function AuthCallbackPage() {
  const router = useRouter();
  const [message, setMessage] = useState('Connexion en cours...');

  useEffect(() => {
    const result = interpretGoogleCallback(window.location.hash.slice(1));

    switch (result.status) {
      case 'login':
        setToken(result.token);
        router.replace('/dashboard');
        return;

      case 'login_linked':
        setToken(result.token);
        setMessage('Connexion réussie — votre compte a été relié à Google.');
        setTimeout(() => router.replace('/dashboard'), LOGIN_LINKED_DISPLAY_MS);
        return;

      case 'signup_pending':
        setGooglePendingToken(result.pendingToken);
        router.replace('/register/google');
        return;

      case 'invalid':
        router.replace('/login?error=google');
    }
  }, [router]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-bg px-6 text-center text-sm text-text-muted">
      {message}
    </div>
  );
}
