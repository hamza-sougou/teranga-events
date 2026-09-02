'use client';

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';
import { queryKeys } from '@/lib/query-keys';
import { getApiErrorMessage } from '@/lib/api-errors';
import { SENEGAL_PHONE_INPUT_MESSAGE, SENEGAL_PHONE_INPUT_REGEX } from '@/lib/phone';
import { Modal } from '@/components/ui/modal';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { FormField } from '@/components/ui/form-field';
import { Button } from '@/components/ui/button';
import { InlineBanner } from '@/components/ui/inline-banner';
import { IdentifierToggle, type IdentifierMode } from '@/components/auth/identifier-toggle';
import { INVITABLE_ROLES, TEAM_ROLE_LABELS } from './team-roles';

// Mirrors backend/src/teams/dto/invite-member.dto.ts's email?/phone? shape
// (@ExactlyOneIdentifier, same contract as RegisterDto/LoginDto — phone-auth
// step 4/5, PROGRESS.md). fullName stays optional here on purpose — it's
// only actually required when the identifier has no account yet, and that
// depends on a DB lookup the frontend can't do, so the server's own 400
// message is surfaced as-is rather than guessed client-side.
const inviteSchema = z
  .object({
    identifierMode: z.enum(['email', 'phone']),
    email: z.string().optional(),
    phone: z.string().optional(),
    role: z.enum(['CO_ORGANIZER', 'SELLER', 'CONTROLLER', 'ACCOUNTANT']),
    fullName: z.string().optional(),
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

type InviteFormValues = z.infer<typeof inviteSchema>;

interface InviteMemberModalProps {
  open: boolean;
  onClose: () => void;
  organizationId: string;
}

export function InviteMemberModal({ open, onClose, organizationId }: InviteMemberModalProps) {
  const queryClient = useQueryClient();
  const [error, setError] = useState<string | null>(null);
  const [identifierMode, setIdentifierMode] = useState<IdentifierMode>('email');

  const {
    register,
    handleSubmit,
    reset,
    setValue,
    formState: { errors },
  } = useForm<InviteFormValues>({
    resolver: zodResolver(inviteSchema),
    defaultValues: { identifierMode: 'email', email: '', phone: '', role: 'CO_ORGANIZER', fullName: '' },
  });

  const handleIdentifierModeChange = (nextMode: IdentifierMode) => {
    setIdentifierMode(nextMode);
    setValue('identifierMode', nextMode);
  };

  const mutation = useMutation({
    mutationFn: (values: InviteFormValues) =>
      apiClient.post(`/organizations/${organizationId}/members`, {
        ...(values.identifierMode === 'email' ? { email: values.email } : { phone: values.phone }),
        role: values.role,
        fullName: values.fullName || undefined,
      }),
    onSuccess: () => {
      setError(null);
      queryClient.invalidateQueries({ queryKey: queryKeys.teamMembers(organizationId) });
      reset();
      setIdentifierMode('email');
      onClose();
    },
    onError: (err) => setError(getApiErrorMessage(err)),
  });

  function handleClose() {
    setError(null);
    reset();
    setIdentifierMode('email');
    onClose();
  }

  return (
    <Modal open={open} onClose={handleClose} title="Inviter un membre">
      {error && <InlineBanner tone="error">{error}</InlineBanner>}
      <form onSubmit={handleSubmit((values) => mutation.mutate(values))}>
        <IdentifierToggle mode={identifierMode} onChange={handleIdentifierModeChange} />

        {identifierMode === 'email' ? (
          <FormField label="Email" htmlFor="invite-email" required error={errors.email?.message}>
            <Input id="invite-email" type="email" invalid={!!errors.email} {...register('email')} />
          </FormField>
        ) : (
          <FormField
            label="Téléphone"
            htmlFor="invite-phone"
            required
            hint="Format : 7XXXXXXXX, 07XXXXXXXX ou +2217XXXXXXXX."
            error={errors.phone?.message}
          >
            <Input id="invite-phone" type="tel" invalid={!!errors.phone} {...register('phone')} />
          </FormField>
        )}

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
