'use client';

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';
import { queryKeys } from '@/lib/query-keys';
import { getApiErrorMessage } from '@/lib/api-errors';
import { Panel } from '@/components/ui/panel';
import { Input } from '@/components/ui/input';
import { FormField } from '@/components/ui/form-field';
import { Button } from '@/components/ui/button';
import { InlineBanner } from '@/components/ui/inline-banner';
import { SENEGAL_PHONE_MESSAGE, SENEGAL_PHONE_REGEX } from '@/lib/phone';
import type { OrganizationProfile } from '@/types';

// Mirrors backend/src/organizations/dto/update-organization.dto.ts.
const profileSchema = z.object({
  name: z.string().min(2, 'Le nom doit contenir au moins 2 caractères.'),
  contactEmail: z.union([z.string().email('Adresse email invalide.'), z.literal('')]),
  contactPhone: z.union([z.string().regex(SENEGAL_PHONE_REGEX, SENEGAL_PHONE_MESSAGE), z.literal('')]),
});

type ProfileFormValues = z.infer<typeof profileSchema>;

interface OrganizationProfileFormProps {
  organizationId: string;
  profile: OrganizationProfile;
  canManage: boolean;
}

export function OrganizationProfileForm({ organizationId, profile, canManage }: OrganizationProfileFormProps) {
  const queryClient = useQueryClient();
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<ProfileFormValues>({
    resolver: zodResolver(profileSchema),
    values: {
      name: profile.name,
      contactEmail: profile.contactEmail ?? '',
      contactPhone: profile.contactPhone ?? '',
    },
  });

  const mutation = useMutation({
    mutationFn: (values: ProfileFormValues) =>
      apiClient.patch(`/organizations/${organizationId}`, {
        name: values.name,
        contactEmail: values.contactEmail || undefined,
        contactPhone: values.contactPhone || undefined,
      }),
    onSuccess: () => {
      setError(null);
      setSuccess(true);
      queryClient.invalidateQueries({ queryKey: queryKeys.orgProfile(organizationId) });
      // Sidebar reads the organization name from GET /auth/me — refresh it
      // too so a rename shows up immediately.
      queryClient.invalidateQueries({ queryKey: ['me'] });
    },
    onError: (err) => {
      setSuccess(false);
      setError(getApiErrorMessage(err));
    },
  });

  return (
    <Panel title="Organisation">
      {error && <InlineBanner tone="error">{error}</InlineBanner>}
      {success && <InlineBanner tone="success">Organisation mise à jour.</InlineBanner>}

      <form
        onSubmit={handleSubmit((values) => {
          setSuccess(false);
          mutation.mutate(values);
        })}
      >
        <FormField label="Nom" htmlFor="org-name" required error={errors.name?.message}>
          <Input id="org-name" disabled={!canManage} invalid={!!errors.name} {...register('name')} />
        </FormField>

        <FormField label="Email de contact" htmlFor="org-contact-email" error={errors.contactEmail?.message}>
          <Input
            id="org-contact-email"
            type="email"
            disabled={!canManage}
            invalid={!!errors.contactEmail}
            {...register('contactEmail')}
          />
        </FormField>

        <FormField
          label="Téléphone de contact"
          htmlFor="org-contact-phone"
          hint="Format : 7XXXXXXXX ou +2217XXXXXXXX."
          error={errors.contactPhone?.message}
        >
          <Input
            id="org-contact-phone"
            disabled={!canManage}
            invalid={!!errors.contactPhone}
            {...register('contactPhone')}
          />
        </FormField>

        {canManage && (
          <Button type="submit" loading={mutation.isPending}>
            Enregistrer
          </Button>
        )}
      </form>
    </Panel>
  );
}
