'use client';

import { Suspense } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useMutation } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';
import { setToken } from '@/lib/auth';
import { Kicker } from '@/components/ui/kicker';
import { Input } from '@/components/ui/input';
import { FormField } from '@/components/ui/form-field';
import { Button, buttonClasses } from '@/components/ui/button';
import { InlineBanner } from '@/components/ui/inline-banner';

const loginSchema = z.object({
  email: z.string().min(1, 'Email requis.').email('Adresse email invalide.'),
  password: z.string().min(1, 'Mot de passe requis.'),
});
type LoginFormValues = z.infer<typeof loginSchema>;

const googleLoginUrl = `${process.env.NEXT_PUBLIC_API_URL}/auth/google`;

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginPageContent />
    </Suspense>
  );
}

function LoginPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const fragmentError = searchParams.get('error') === 'google';

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<LoginFormValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: '', password: '' },
  });

  const mutation = useMutation({
    mutationFn: (values: LoginFormValues) => apiClient.post('/auth/login', values),
    onSuccess: ({ data }) => {
      setToken(data.accessToken);
      router.push('/dashboard');
    },
  });

  return (
    <>
      <Kicker />
      <h1 className="mb-6 text-[20px] font-black text-text">Connexion</h1>

      {mutation.isError && <InlineBanner tone="error">Email ou mot de passe incorrect.</InlineBanner>}
      {fragmentError && !mutation.isError && (
        <InlineBanner tone="error">La connexion avec Google a échoué. Réessayez.</InlineBanner>
      )}

      <form onSubmit={handleSubmit((values) => mutation.mutate(values))}>
        <FormField label="Email" htmlFor="login-email" required error={errors.email?.message}>
          <Input id="login-email" type="email" invalid={!!errors.email} {...register('email')} />
        </FormField>

        <FormField label="Mot de passe" htmlFor="login-password" required error={errors.password?.message}>
          <Input id="login-password" type="password" invalid={!!errors.password} {...register('password')} />
        </FormField>

        <Button type="submit" loading={mutation.isPending} className="w-full justify-center">
          Se connecter
        </Button>
      </form>

      <div className="my-5 flex items-center gap-3 text-[11px] font-bold uppercase tracking-wide text-text-muted">
        <div className="h-px flex-1 bg-border" />
        ou
        <div className="h-px flex-1 bg-border" />
      </div>

      {/* Plain <a>, not next/link: this must be a full page navigation so
          the browser can follow Google's OAuth redirect chain. */}
      <a href={googleLoginUrl} className={buttonClasses('ghost', 'w-full justify-center')}>
        Se connecter avec Google
      </a>

      <p className="mt-6 text-center text-[13px] text-text-muted">
        Pas encore de compte ?{' '}
        <Link href="/register" className="font-bold text-indigo hover:underline">
          Créer un compte
        </Link>
      </p>
    </>
  );
}
