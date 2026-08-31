'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useMutation } from '@tanstack/react-query';
import { isAxiosError } from 'axios';
import { apiClient } from '@/lib/api-client';
import { setToken } from '@/lib/auth';
import { getApiErrorMessage } from '@/lib/api-errors';
import { Input } from '@/components/ui/input';
import { FormField } from '@/components/ui/form-field';
import { Button, buttonClasses } from '@/components/ui/button';
import { InlineBanner } from '@/components/ui/inline-banner';
import { CheckboxField } from '@/components/ui/checkbox';

// Mirrors backend/src/auth/dto/register.dto.ts.
const registerSchema = z
  .object({
    fullName: z.string().min(2, 'Le nom doit contenir au moins 2 caractères.'),
    email: z.string().min(1, 'Email requis.').email('Adresse email invalide.'),
    password: z.string().min(8, 'Le mot de passe doit contenir au moins 8 caractères.'),
    passwordConfirmation: z.string().min(8, 'Confirmation requise.'),
    marketingOptIn: z.boolean(),
    termsAccepted: z.boolean(),
  })
  .refine((data) => data.password === data.passwordConfirmation, {
    message: 'Les mots de passe ne correspondent pas.',
    path: ['passwordConfirmation'],
  })
  .refine((data) => data.termsAccepted === true, {
    message: 'Vous devez accepter les conditions générales pour continuer.',
    path: ['termsAccepted'],
  });

type RegisterFormValues = z.infer<typeof registerSchema>;

const googleLoginUrl = `${process.env.NEXT_PUBLIC_API_URL}/auth/google`;
const GOOGLE_ACCOUNT_EXISTS_MESSAGE =
  'Cette adresse email est déjà liée à un compte Google — connectez-vous avec Google.';

export function RegisterForm() {
  const router = useRouter();

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<RegisterFormValues>({
    resolver: zodResolver(registerSchema),
    defaultValues: {
      fullName: '',
      email: '',
      password: '',
      passwordConfirmation: '',
      marketingOptIn: false,
      termsAccepted: false,
    },
  });

  const mutation = useMutation({
    mutationFn: (values: RegisterFormValues) =>
      apiClient.post('/auth/register', {
        fullName: values.fullName,
        email: values.email,
        password: values.password,
        passwordConfirmation: values.passwordConfirmation,
        marketingOptIn: values.marketingOptIn,
        termsAccepted: values.termsAccepted,
      }),
    onSuccess: ({ data }) => {
      setToken(data.accessToken);
      router.push('/dashboard');
    },
  });

  // GOOGLE_ACCOUNT_EXISTS gets a dedicated, actionable message instead of
  // the backend's generic conflict text — see
  // AuthService#assertEmailAvailableForClassicRegistration.
  const isGoogleAccountConflict =
    isAxiosError(mutation.error) && mutation.error.response?.data?.error === 'GOOGLE_ACCOUNT_EXISTS';

  return (
    <>
      {mutation.isError && (
        <InlineBanner tone="error">
          {isGoogleAccountConflict ? (
            <>
              {GOOGLE_ACCOUNT_EXISTS_MESSAGE}{' '}
              <Link href="/login" className="underline">
                Se connecter
              </Link>
            </>
          ) : (
            getApiErrorMessage(mutation.error, 'Impossible de créer le compte. Réessayez.')
          )}
        </InlineBanner>
      )}

      <form onSubmit={handleSubmit((values) => mutation.mutate(values))}>
        <FormField label="Nom complet" htmlFor="register-full-name" required error={errors.fullName?.message}>
          <Input id="register-full-name" invalid={!!errors.fullName} {...register('fullName')} />
        </FormField>

        <FormField label="Email" htmlFor="register-email" required error={errors.email?.message}>
          <Input id="register-email" type="email" invalid={!!errors.email} {...register('email')} />
        </FormField>

        <FormField label="Mot de passe" htmlFor="register-password" required error={errors.password?.message}>
          <Input id="register-password" type="password" invalid={!!errors.password} {...register('password')} />
        </FormField>

        <FormField
          label="Confirmer le mot de passe"
          htmlFor="register-password-confirmation"
          required
          error={errors.passwordConfirmation?.message}
        >
          <Input
            id="register-password-confirmation"
            type="password"
            invalid={!!errors.passwordConfirmation}
            {...register('passwordConfirmation')}
          />
        </FormField>

        <CheckboxField htmlFor="register-marketing-opt-in" {...register('marketingOptIn')}>
          Je souhaite recevoir des emails sur les évènements et offres Zen Events.
        </CheckboxField>

        <CheckboxField
          htmlFor="register-terms-accepted"
          error={errors.termsAccepted?.message}
          {...register('termsAccepted')}
        >
          J&apos;accepte les{' '}
          <Link href="/terms" target="_blank" className="font-bold text-indigo hover:underline">
            Conditions générales d&apos;utilisation
          </Link>{' '}
          et la{' '}
          <Link href="/privacy" target="_blank" className="font-bold text-indigo hover:underline">
            Politique de confidentialité
          </Link>
          .
        </CheckboxField>

        <Button type="submit" loading={mutation.isPending} className="w-full justify-center">
          Créer mon compte
        </Button>
      </form>

      <div className="my-5 flex items-center gap-3 text-[11px] font-bold uppercase tracking-wide text-text-muted">
        <div className="h-px flex-1 bg-border" />
        ou
        <div className="h-px flex-1 bg-border" />
      </div>

      <a href={googleLoginUrl} className={buttonClasses('ghost', 'w-full justify-center')}>
        Continuer avec Google
      </a>

      <p className="mt-6 text-center text-[13px] text-text-muted">
        Déjà un compte ?{' '}
        <Link href="/login" className="font-bold text-indigo hover:underline">
          Se connecter
        </Link>
      </p>
    </>
  );
}
