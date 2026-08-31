'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useMutation, useQuery } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';
import { setToken } from '@/lib/auth';
import { getApiErrorMessage } from '@/lib/api-errors';
import { getGooglePendingToken, clearGooglePendingToken } from '@/lib/google-pending-token';
import { Input } from '@/components/ui/input';
import { FormField } from '@/components/ui/form-field';
import { Button } from '@/components/ui/button';
import { InlineBanner } from '@/components/ui/inline-banner';
import { CheckboxField } from '@/components/ui/checkbox';

// Mirrors backend/src/auth/dto/complete-google-signup.dto.ts (minus
// pendingToken, carried separately — see GoogleCompleteForm below).
const completeSchema = z
  .object({
    fullName: z.string().min(2, 'Le nom doit contenir au moins 2 caractères.'),
    marketingOptIn: z.boolean(),
    termsAccepted: z.boolean(),
  })
  .refine((data) => data.termsAccepted === true, {
    message: 'Vous devez accepter les conditions générales pour continuer.',
    path: ['termsAccepted'],
  });

type CompleteFormValues = z.infer<typeof completeSchema>;

interface PendingSignupInfo {
  email: string;
  suggestedFullName: string;
}

export function GoogleCompleteForm() {
  const router = useRouter();

  // Read sessionStorage only after mount (undefined = "not checked yet"),
  // same reasoning as RecentlyViewedSection's localStorage read — reading
  // client storage during the render itself would differ between the
  // server pass (no window) and the client's first pass, a hydration
  // mismatch.
  const [pendingToken, setPendingToken] = useState<string | null | undefined>(undefined);

  useEffect(() => {
    const token = getGooglePendingToken();
    setPendingToken(token);
    if (!token) router.replace('/register');
  }, [router]);

  const pendingQuery = useQuery<PendingSignupInfo>({
    queryKey: ['google-pending-signup', pendingToken],
    queryFn: async () => {
      const { data } = await apiClient.post<PendingSignupInfo>('/auth/google/pending', { token: pendingToken });
      return data;
    },
    enabled: typeof pendingToken === 'string',
    retry: false,
  });

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<CompleteFormValues>({
    resolver: zodResolver(completeSchema),
    values: pendingQuery.data
      ? { fullName: pendingQuery.data.suggestedFullName, marketingOptIn: false, termsAccepted: false }
      : undefined,
  });

  const mutation = useMutation({
    mutationFn: (values: CompleteFormValues) =>
      apiClient.post('/auth/google/complete', {
        pendingToken,
        fullName: values.fullName,
        marketingOptIn: values.marketingOptIn,
        termsAccepted: values.termsAccepted,
      }),
    onSuccess: ({ data }) => {
      setToken(data.accessToken);
      clearGooglePendingToken();
      router.push('/dashboard');
    },
  });

  // Nothing to render yet (still checking storage) or nothing to redirect
  // away from (no token — the effect above already kicked off the
  // replace('/register')).
  if (pendingToken === undefined || pendingToken === null) return null;

  if (pendingQuery.isLoading) {
    return <p className="text-[13px] text-text-muted">Chargement...</p>;
  }

  if (pendingQuery.isError) {
    return (
      <>
        <InlineBanner tone="error">
          Cette demande d&apos;inscription a expiré ou n&apos;est plus valide.
        </InlineBanner>
        <Link href="/register" className="text-[13px] font-bold text-indigo hover:underline">
          Retourner à l&apos;inscription
        </Link>
      </>
    );
  }

  return (
    <>
      {mutation.isError && (
        <InlineBanner tone="error">
          {getApiErrorMessage(mutation.error, 'Impossible de finaliser l’inscription. Réessayez.')}
        </InlineBanner>
      )}

      <form onSubmit={handleSubmit((values) => mutation.mutate(values))}>
        <FormField label="Nom complet" htmlFor="google-full-name" required error={errors.fullName?.message}>
          <Input id="google-full-name" invalid={!!errors.fullName} {...register('fullName')} />
        </FormField>

        <FormField label="Email" htmlFor="google-email">
          <Input id="google-email" value={pendingQuery.data?.email ?? ''} disabled readOnly />
        </FormField>

        <CheckboxField htmlFor="google-marketing-opt-in" {...register('marketingOptIn')}>
          Je souhaite recevoir des emails sur les évènements et offres Zen Events.
        </CheckboxField>

        <CheckboxField
          htmlFor="google-terms-accepted"
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
          Terminer l&apos;inscription
        </Button>
      </form>
    </>
  );
}
