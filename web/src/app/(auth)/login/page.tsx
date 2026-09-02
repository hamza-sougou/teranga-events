'use client';

import { Suspense, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useMutation } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';
import { setToken } from '@/lib/auth';
import { SENEGAL_PHONE_INPUT_MESSAGE, SENEGAL_PHONE_INPUT_REGEX } from '@/lib/phone';
import { Kicker } from '@/components/ui/kicker';
import { Input } from '@/components/ui/input';
import { FormField } from '@/components/ui/form-field';
import { Button, buttonClasses } from '@/components/ui/button';
import { InlineBanner } from '@/components/ui/inline-banner';
import { IdentifierToggle, type IdentifierMode } from '@/components/auth/identifier-toggle';

// Mirrors backend/src/auth/dto/login.dto.ts — same email?/phone? shape as
// RegisterDto, see register-form.tsx.
const loginSchema = z
  .object({
    identifierMode: z.enum(['email', 'phone']),
    email: z.string().optional(),
    phone: z.string().optional(),
    password: z.string().min(1, 'Mot de passe requis.'),
  })
  .superRefine((data, ctx) => {
    if (data.identifierMode === 'email') {
      if (!data.email) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Email requis.', path: ['email'] });
      } else if (!z.string().email().safeParse(data.email).success) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Adresse email invalide.', path: ['email'] });
      }
    } else {
      if (!data.phone) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Numéro requis.', path: ['phone'] });
      } else if (!SENEGAL_PHONE_INPUT_REGEX.test(data.phone)) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: SENEGAL_PHONE_INPUT_MESSAGE, path: ['phone'] });
      }
    }
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

  const [identifierMode, setIdentifierMode] = useState<IdentifierMode>('email');

  const {
    register,
    handleSubmit,
    setValue,
    formState: { errors },
  } = useForm<LoginFormValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: { identifierMode: 'email', email: '', phone: '', password: '' },
  });

  const handleIdentifierModeChange = (nextMode: IdentifierMode) => {
    setIdentifierMode(nextMode);
    setValue('identifierMode', nextMode);
  };

  const mutation = useMutation({
    mutationFn: (values: LoginFormValues) =>
      apiClient.post('/auth/login', {
        ...(values.identifierMode === 'email' ? { email: values.email } : { phone: values.phone }),
        password: values.password,
      }),
    onSuccess: ({ data }) => {
      setToken(data.accessToken);
      router.push('/dashboard');
    },
  });

  return (
    <>
      <Kicker />
      <h1 className="mb-6 text-[20px] font-black text-text">Connexion</h1>

      {/* Never reveals whether it was the identifier or the password that was
          wrong, regardless of channel — same generic text the backend itself
          returns (UnauthorizedException('Invalid credentials')) for both. */}
      {mutation.isError && <InlineBanner tone="error">Identifiant ou mot de passe incorrect.</InlineBanner>}
      {fragmentError && !mutation.isError && (
        <InlineBanner tone="error">La connexion avec Google a échoué. Réessayez.</InlineBanner>
      )}

      <form onSubmit={handleSubmit((values) => mutation.mutate(values))}>
        <IdentifierToggle mode={identifierMode} onChange={handleIdentifierModeChange} />

        {identifierMode === 'email' ? (
          <FormField label="Email" htmlFor="login-email" required error={errors.email?.message}>
            <Input id="login-email" type="email" invalid={!!errors.email} {...register('email')} />
          </FormField>
        ) : (
          <FormField label="Téléphone" htmlFor="login-phone" required error={errors.phone?.message}>
            <Input id="login-phone" type="tel" invalid={!!errors.phone} {...register('phone')} />
          </FormField>
        )}

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
