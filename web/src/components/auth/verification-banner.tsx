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

const codeSchema = z.object({
  code: z.string().regex(/^\d{6}$/, 'Le code doit contenir 6 chiffres.'),
});
type CodeFormValues = z.infer<typeof codeSchema>;

interface VerificationBannerProps {
  // Whether this channel even applies to the account — false hides the
  // banner entirely (e.g. no phoneNumber set, or an email-verified account).
  visible: boolean;
  message: string;
  verifyPath: string;
  resendPath: string;
}

// Shared shell for EmailVerificationBanner/PhoneVerificationBanner below —
// same repled/expanded/dismissed states and 6-digit single-field code entry
// for both channels, parameterized only by copy and the two endpoints. Two
// independent instances (one per channel) rather than one banner juggling
// both channels' state internally: an account can have both email and phone
// unverified at once (db/schema.sql's chk_users_auth_method tolerates both,
// even though no flow produces it today), and each instance already
// self-hides via `visible` when its channel doesn't apply — no shared state
// needed between them.
export function VerificationBanner({ visible, message, verifyPath, resendPath }: VerificationBannerProps) {
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
    mutationFn: (values: CodeFormValues) => apiClient.post(verifyPath, values),
    onSuccess: () => {
      reset();
      setExpanded(false);
      queryClient.invalidateQueries({ queryKey: ['me'] });
    },
  });

  const resendMutation = useMutation({
    mutationFn: () => apiClient.post(resendPath),
  });

  if (!visible || dismissed) return null;

  return (
    <InlineBanner tone="pending" className="mx-6 mt-6 flex flex-col gap-2">
      <div className="flex items-center justify-between gap-3">
        <span>{message}</span>
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
