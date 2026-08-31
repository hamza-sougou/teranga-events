'use client';

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';
import { getApiErrorMessage } from '@/lib/api-errors';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { InlineBanner } from '@/components/ui/inline-banner';
import { XCloseIcon } from '@/components/ui/icons';
import type { CurrentUser } from '@/types';

const codeSchema = z.object({
  code: z.string().regex(/^\d{6}$/, 'Le code doit contenir 6 chiffres.'),
});
type CodeFormValues = z.infer<typeof codeSchema>;

// Mounted once in (organizer)/dashboard/layout.tsx — the only surface every
// organizer page shares after login/register. Non-blocking by design (see
// docs/SPEC.md — email verification never gates login): a dismissible
// notice, never a full-screen wall.
export function EmailVerificationBanner({ user }: { user: CurrentUser }) {
  const queryClient = useQueryClient();
  const [dismissed, setDismissed] = useState(false);
  const [expanded, setExpanded] = useState(false);

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<CodeFormValues>({ resolver: zodResolver(codeSchema), defaultValues: { code: '' } });

  const verifyMutation = useMutation({
    mutationFn: (values: CodeFormValues) => apiClient.post('/auth/verify-email', values),
    onSuccess: () => {
      reset();
      setExpanded(false);
      queryClient.invalidateQueries({ queryKey: ['me'] });
    },
  });

  const resendMutation = useMutation({
    mutationFn: () => apiClient.post('/auth/verify-email/resend'),
  });

  // Google accounts never get a verification code — see
  // AuthService#resendVerificationCode's passwordHash guard.
  if (user.emailVerifiedAt || !user.hasPassword || dismissed) return null;

  return (
    <InlineBanner tone="pending" className="mx-6 mt-6 flex flex-col gap-2">
      <div className="flex items-center justify-between gap-3">
        <span>Vérifiez votre adresse email pour sécuriser votre compte.</span>
        <div className="flex shrink-0 items-center gap-3">
          {!expanded && (
            <button type="button" className="font-bold text-indigo hover:underline" onClick={() => setExpanded(true)}>
              Entrer le code
            </button>
          )}
          <button type="button" aria-label="Fermer" onClick={() => setDismissed(true)}>
            <XCloseIcon className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {expanded && (
        <form
          onSubmit={handleSubmit((values) => verifyMutation.mutate(values))}
          className="flex flex-wrap items-start gap-2"
        >
          <div>
            <Input
              placeholder="123456"
              maxLength={6}
              invalid={!!errors.code || verifyMutation.isError}
              className="w-28"
              {...register('code')}
            />
            {(errors.code || verifyMutation.isError) && (
              <p className="mt-1 text-[11px] font-semibold text-danger">
                {errors.code?.message ?? getApiErrorMessage(verifyMutation.error, 'Code invalide.')}
              </p>
            )}
          </div>
          <Button type="submit" loading={verifyMutation.isPending} className="shrink-0">
            Valider
          </Button>
          <button
            type="button"
            className="mt-2.5 shrink-0 text-[12px] font-bold text-indigo hover:underline disabled:opacity-50"
            disabled={resendMutation.isPending}
            onClick={() => resendMutation.mutate()}
          >
            {resendMutation.isSuccess ? 'Code renvoyé' : 'Renvoyer le code'}
          </button>
        </form>
      )}
    </InlineBanner>
  );
}
