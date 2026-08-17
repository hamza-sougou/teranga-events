'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { setToken } from '@/lib/auth';

export default function AuthCallbackPage() {
  const router = useRouter();

  useEffect(() => {
    // The backend passes the token as a URL fragment (#token=...), not a
    // query string, so it's never sent to any server or logged.
    const token = new URLSearchParams(window.location.hash.slice(1)).get('token');
    if (!token) {
      router.replace('/login');
      return;
    }
    setToken(token);
    router.replace('/dashboard');
  }, [router]);

  return <main>Connexion en cours...</main>;
}
