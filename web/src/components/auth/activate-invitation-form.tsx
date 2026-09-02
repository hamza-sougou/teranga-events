'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useMutation } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';
import { setToken } from '@/lib/auth';
import { getApiErrorMessage } from '@/lib/api-errors';
import { SENEGAL_PHONE_INPUT_MESSAGE, SENEGAL_PHONE_INPUT_REGEX } from '@/lib/phone';
import { Input } from '@/components/ui/input';
import { FormField } from '@/components/ui/form-field';
import { Button } from '@/components/ui/button';
import { InlineBanner } from '@/components/ui/inline-banner';
import { IdentifierToggle, type IdentifierMode } from '@/components/auth/identifier-toggle';

// Mirrors backend/src/auth/dto/activate-invitation.dto.ts's email?/phone?
// shape (@ExactlyOneIdentifier) — same toggle pattern as register-form.tsx.
// There is no token in this flow: the invitation code is a 6-digit code
// texted/emailed to the invitee (AuthService.issueInvitationActivationCode),
// never a link, so this form always asks for the identifier + code, whether
// or not the page was reached with a query param.
const activateSchema = z
  .object({
    identifierMode: z.enum(['email', 'phone']),
    email: z.string().optional(),
    phone: z.string().optional(),
    code: z.string().regex(/^\d{6}$/, 'Le code doit contenir 6 chiffres.'),
    password: z.string().min(8, 'Le mot de passe doit contenir au moins 8 caractères.'),
    passwordConfirmation: z.string().min(8, 'Confirmation requise.'),
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
  })
  .refine((data) => data.password === data.passwordConfirmation, {
    message: 'Les mots de passe ne correspondent pas.',
    path: ['passwordConfirmation'],
  });

type ActivateFormValues = z.infer<typeof activateSchema>;

export function ActivateInvitationForm() {
  const router = useRouter();
  const [identifierMode, setIdentifierMode] = useState<IdentifierMode>('email');

  const {
    register,
    handleSubmit,
    getValues,
    setValue,
    formState: { errors },
  } = useForm<ActivateFormValues>({
    resolver: zodResolver(activateSchema),
    defaultValues: {
      identifierMode: 'email',
      email: '',
      phone: '',
      code: '',
      password: '',
      passwordConfirmation: '',
    },
  });

  const handleIdentifierModeChange = (nextMode: IdentifierMode) => {
    setIdentifierMode(nextMode);
    setValue('identifierMode', nextMode);
  };

  const mutation = useMutation({
    mutationFn: (values: ActivateFormValues) =>
      apiClient.post('/auth/activate-invitation', {
        ...(values.identifierMode === 'email' ? { email: values.email } : { phone: values.phone }),
        code: values.code,
        password: values.password,
        passwordConfirmation: values.passwordConfirmation,
      }),
    onSuccess: ({ data }) => {
      setToken(data.accessToken);
      router.push('/dashboard');
    },
  });

  // Generic response either way (see ResendActivationDto's controller
  // comment) — nothing to distinguish here, just confirm it was sent.
  const resendMutation = useMutation({
    mutationFn: () => {
      const values = getValues();
      return apiClient.post('/auth/activate-invitation/resend', {
        ...(values.identifierMode === 'email' ? { email: values.email } : { phone: values.phone }),
      });
    },
  });

  return (
    <>
      {mutation.isError && (
        <InlineBanner tone="error">
          {getApiErrorMessage(mutation.error, "Impossible d'activer le compte. Réessayez.")}
        </InlineBanner>
      )}

      <form onSubmit={handleSubmit((values) => mutation.mutate(values))}>
        <IdentifierToggle mode={identifierMode} onChange={handleIdentifierModeChange} />

        {identifierMode === 'email' ? (
          <FormField label="Email" htmlFor="activate-email" required error={errors.email?.message}>
            <Input id="activate-email" type="email" invalid={!!errors.email} {...register('email')} />
          </FormField>
        ) : (
          <FormField
            label="Téléphone"
            htmlFor="activate-phone"
            required
            hint="Format : 7XXXXXXXX, 07XXXXXXXX ou +2217XXXXXXXX."
            error={errors.phone?.message}
          >
            <Input id="activate-phone" type="tel" invalid={!!errors.phone} {...register('phone')} />
          </FormField>
        )}

        <FormField
          label="Code d'activation"
          htmlFor="activate-code"
          required
          hint="Le code à 6 chiffres reçu par email ou SMS lors de l'invitation."
          error={errors.code?.message}
        >
          <Input id="activate-code" placeholder="123456" maxLength={6} invalid={!!errors.code} {...register('code')} />
        </FormField>

        <FormField label="Mot de passe" htmlFor="activate-password" required error={errors.password?.message}>
          <Input id="activate-password" type="password" invalid={!!errors.password} {...register('password')} />
        </FormField>

        <FormField
          label="Confirmer le mot de passe"
          htmlFor="activate-password-confirmation"
          required
          error={errors.passwordConfirmation?.message}
        >
          <Input
            id="activate-password-confirmation"
            type="password"
            invalid={!!errors.passwordConfirmation}
            {...register('passwordConfirmation')}
          />
        </FormField>

        <Button type="submit" loading={mutation.isPending} className="w-full justify-center">
          Activer mon compte
        </Button>
      </form>

      <p className="mt-5 text-center text-[13px] text-text-muted">
        Pas reçu de code ?{' '}
        <button
          type="button"
          className="font-bold text-indigo hover:underline disabled:opacity-50"
          disabled={resendMutation.isPending}
          onClick={() => resendMutation.mutate()}
        >
          {resendMutation.isSuccess ? 'Code renvoyé' : 'Renvoyer le code'}
        </button>
      </p>
    </>
  );
}
