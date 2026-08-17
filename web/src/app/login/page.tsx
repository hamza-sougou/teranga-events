'use client';

import { FormEvent, useState } from 'react';
import { useRouter } from 'next/navigation';
import { apiClient } from '@/lib/api-client';
import { setToken } from '@/lib/auth';

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setIsSubmitting(true);
    try {
      const { data } = await apiClient.post('/auth/login', { email, password });
      setToken(data.accessToken);
      router.push('/dashboard');
    } catch {
      setError('Email ou mot de passe incorrect.');
    } finally {
      setIsSubmitting(false);
    }
  }

  const googleLoginUrl = `${process.env.NEXT_PUBLIC_API_URL}/auth/google`;

  return (
    <main className="mx-auto flex max-w-sm flex-col gap-6 p-8">
      <h1 className="text-xl font-semibold">Connexion</h1>

      <form onSubmit={handleSubmit} className="flex flex-col gap-3">
        <input
          type="email"
          placeholder="Email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          className="rounded border px-3 py-2"
        />
        <input
          type="password"
          placeholder="Mot de passe"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          className="rounded border px-3 py-2"
        />
        {error && <p className="text-sm text-red-600">{error}</p>}
        <button
          type="submit"
          disabled={isSubmitting}
          className="rounded bg-black px-3 py-2 text-white disabled:opacity-50"
        >
          {isSubmitting ? 'Connexion...' : 'Se connecter'}
        </button>
      </form>

      <div className="flex items-center gap-2 text-sm text-gray-500">
        <div className="h-px flex-1 bg-gray-200" />
        ou
        <div className="h-px flex-1 bg-gray-200" />
      </div>

      {/* Plain <a>, not next/link: this must be a full page navigation so
          the browser can follow Google's OAuth redirect chain. */}
      <a
        href={googleLoginUrl}
        className="rounded border px-3 py-2 text-center hover:bg-gray-50"
      >
        Se connecter avec Google
      </a>
    </main>
  );
}
