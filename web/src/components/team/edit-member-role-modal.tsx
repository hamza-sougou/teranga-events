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
import { Select } from '@/components/ui/select';
import { FormField } from '@/components/ui/form-field';
import { Button } from '@/components/ui/button';
import { InlineBanner } from '@/components/ui/inline-banner';
import { INVITABLE_ROLES, TEAM_ROLE_LABELS } from './team-roles';
import type { MemberRole } from '@/types';

// Mirrors ASSIGNABLE_ROLES in backend/src/teams/dto/update-member.dto.ts —
// same set as INVITABLE_ROLES, OWNER is never reassignable through this form.
const editRoleSchema = z.object({
  role: z.enum(['CO_ORGANIZER', 'SELLER', 'CONTROLLER', 'ACCOUNTANT']),
});

type EditRoleFormValues = z.infer<typeof editRoleSchema>;

interface Member {
  id: string;
  role: MemberRole;
  user: { fullName: string };
}

interface EditMemberRoleModalProps {
  open: boolean;
  onClose: () => void;
  organizationId: string;
  member: Member;
}

export function EditMemberRoleModal({ open, onClose, organizationId, member }: EditMemberRoleModalProps) {
  const queryClient = useQueryClient();
  const [error, setError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<EditRoleFormValues>({
    resolver: zodResolver(editRoleSchema),
    values: { role: member.role as EditRoleFormValues['role'] },
  });

  const mutation = useMutation({
    mutationFn: (values: EditRoleFormValues) =>
      apiClient.patch(`/organizations/${organizationId}/members/${member.id}`, { role: values.role }),
    onSuccess: () => {
      setError(null);
      queryClient.invalidateQueries({ queryKey: queryKeys.teamMembers(organizationId) });
      onClose();
    },
    onError: (err) => setError(getApiErrorMessage(err)),
  });

  function handleClose() {
    setError(null);
    onClose();
  }

  return (
    <Modal open={open} onClose={handleClose} title={`Modifier le rôle — ${member.user.fullName}`}>
      {error && <InlineBanner tone="error">{error}</InlineBanner>}
      <form onSubmit={handleSubmit((values) => mutation.mutate(values))}>
        <FormField label="Rôle" htmlFor="edit-role" required error={errors.role?.message}>
          <Select id="edit-role" {...register('role')}>
            {INVITABLE_ROLES.map((role) => (
              <option key={role} value={role}>
                {TEAM_ROLE_LABELS[role]}
              </option>
            ))}
          </Select>
        </FormField>

        <Button type="submit" loading={mutation.isPending}>
          Enregistrer
        </Button>
      </form>
    </Modal>
  );
}
