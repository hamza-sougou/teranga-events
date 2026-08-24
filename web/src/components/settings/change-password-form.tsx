'use client';

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useMutation } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';
import { getApiErrorMessage } from '@/lib/api-errors';
import { Input } from '@/components/ui/input';
import { FormField } from '@/components/ui/form-field';
import { Button } from '@/components/ui/button';
import { InlineBanner } from '@/components/ui/inline-banner';

// Mirrors backend/src/auth/dto/change-password.dto.ts, plus a client-only
// confirmation field.
const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1, 'Mot de passe actuel requis.'),
    newPassword: z.string().min(8, 'Le nouveau mot de passe doit contenir au moins 8 caractères.'),
    confirmPassword: z.string(),
  })
  .refine((data) => data.newPassword === data.confirmPassword, {
    message: 'Les mots de passe ne correspondent pas.',
    path: ['confirmPassword'],
  });

type ChangePasswordFormValues = z.infer<typeof changePasswordSchema>;

export function ChangePasswordForm() {
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<ChangePasswordFormValues>({
    resolver: zodResolver(changePasswordSchema),
    defaultValues: { currentPassword: '', newPassword: '', confirmPassword: '' },
  });

  const mutation = useMutation({
    mutationFn: (values: ChangePasswordFormValues) =>
      apiClient.patch('/auth/password', {
        currentPassword: values.currentPassword,
        newPassword: values.newPassword,
      }),
    onSuccess: () => {
      setError(null);
      setSuccess(true);
      reset();
    },
    onError: (err) => {
      setSuccess(false);
      setError(getApiErrorMessage(err));
    },
  });

  return (
    <>
      {error && <InlineBanner tone="error">{error}</InlineBanner>}
      {success && <InlineBanner tone="success">Mot de passe mis à jour.</InlineBanner>}

      <form
        onSubmit={handleSubmit((values) => {
          setSuccess(false);
          mutation.mutate(values);
        })}
      >
        <FormField label="Mot de passe actuel" htmlFor="current-password" required error={errors.currentPassword?.message}>
          <Input
            id="current-password"
            type="password"
            invalid={!!errors.currentPassword}
            {...register('currentPassword')}
          />
        </FormField>

        <FormField label="Nouveau mot de passe" htmlFor="new-password" required error={errors.newPassword?.message}>
          <Input id="new-password" type="password" invalid={!!errors.newPassword} {...register('newPassword')} />
        </FormField>

        <FormField
          label="Confirmer le nouveau mot de passe"
          htmlFor="confirm-password"
          required
          error={errors.confirmPassword?.message}
        >
          <Input
            id="confirm-password"
            type="password"
            invalid={!!errors.confirmPassword}
            {...register('confirmPassword')}
          />
        </FormField>

        <Button type="submit" loading={mutation.isPending}>
          Changer le mot de passe
        </Button>
      </form>
    </>
  );
}
