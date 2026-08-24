'use client';

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';
import { queryKeys } from '@/lib/query-keys';
import { getApiErrorMessage } from '@/lib/api-errors';
import { Modal } from '@/components/ui/modal';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { FormField } from '@/components/ui/form-field';
import { Button } from '@/components/ui/button';
import { InlineBanner } from '@/components/ui/inline-banner';
import { INVITABLE_ROLES, TEAM_ROLE_LABELS } from './team-roles';

// Mirrors backend/src/teams/dto/invite-member.dto.ts. fullName is optional
// here on purpose — it's only actually required when the email has no
// account yet, and that depends on a DB lookup the frontend can't do, so the
// server's own 400 message is surfaced as-is rather than guessed client-side.
const inviteSchema = z.object({
  email: z.string().email('Adresse email invalide.'),
  role: z.enum(['CO_ORGANIZER', 'SELLER', 'CONTROLLER', 'ACCOUNTANT']),
  fullName: z.string().optional(),
});

type InviteFormValues = z.infer<typeof inviteSchema>;

interface InviteMemberModalProps {
  open: boolean;
  onClose: () => void;
  organizationId: string;
}

export function InviteMemberModal({ open, onClose, organizationId }: InviteMemberModalProps) {
  const queryClient = useQueryClient();
  const [error, setError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<InviteFormValues>({
    resolver: zodResolver(inviteSchema),
    defaultValues: { email: '', role: 'CO_ORGANIZER', fullName: '' },
  });

  const mutation = useMutation({
    mutationFn: (values: InviteFormValues) =>
      apiClient.post(`/organizations/${organizationId}/members`, {
        email: values.email,
        role: values.role,
        fullName: values.fullName || undefined,
      }),
    onSuccess: () => {
      setError(null);
      queryClient.invalidateQueries({ queryKey: queryKeys.teamMembers(organizationId) });
      reset();
      onClose();
    },
    onError: (err) => setError(getApiErrorMessage(err)),
  });

  function handleClose() {
    setError(null);
    reset();
    onClose();
  }

  return (
    <Modal open={open} onClose={handleClose} title="Inviter un membre">
      {error && <InlineBanner tone="error">{error}</InlineBanner>}
      <form onSubmit={handleSubmit((values) => mutation.mutate(values))}>
        <FormField label="Email" htmlFor="invite-email" required error={errors.email?.message}>
          <Input id="invite-email" type="email" invalid={!!errors.email} {...register('email')} />
        </FormField>

        <FormField label="Rôle" htmlFor="invite-role" required>
          <Select id="invite-role" {...register('role')}>
            {INVITABLE_ROLES.map((role) => (
              <option key={role} value={role}>
                {TEAM_ROLE_LABELS[role]}
              </option>
            ))}
          </Select>
        </FormField>

        <FormField
          label="Nom complet"
          htmlFor="invite-full-name"
          hint="Requis seulement si cette personne n'a pas encore de compte Zen Events."
          error={errors.fullName?.message}
        >
          <Input id="invite-full-name" invalid={!!errors.fullName} {...register('fullName')} />
        </FormField>

        <Button type="submit" loading={mutation.isPending}>
          Envoyer l&apos;invitation
        </Button>
      </form>
    </Modal>
  );
}
