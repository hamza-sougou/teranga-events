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

// Mirrors backend/src/organizations/dto/update-payout-method.dto.ts.
const payoutMethodSchema = z.object({
  payoutPhoneNumber: z.string().regex(SENEGAL_PHONE_REGEX, SENEGAL_PHONE_MESSAGE),
});

type PayoutMethodFormValues = z.infer<typeof payoutMethodSchema>;

interface PayoutMethodFormProps {
  organizationId: string;
  payoutPhoneNumber: string | null;
  canManage: boolean;
}

export function PayoutMethodForm({ organizationId, payoutPhoneNumber, canManage }: PayoutMethodFormProps) {
  const queryClient = useQueryClient();
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<PayoutMethodFormValues>({
    resolver: zodResolver(payoutMethodSchema),
    values: { payoutPhoneNumber: payoutPhoneNumber ?? '' },
  });

  const mutation = useMutation({
    mutationFn: (values: PayoutMethodFormValues) =>
      apiClient.patch(`/organizations/${organizationId}/payout-method`, values),
    onSuccess: () => {
      setError(null);
      setSuccess(true);
      queryClient.invalidateQueries({ queryKey: queryKeys.orgProfile(organizationId) });
    },
    onError: (err) => {
      setSuccess(false);
      setError(getApiErrorMessage(err));
    },
  });

  return (
    <Panel title="Reversement">
      {error && <InlineBanner tone="error">{error}</InlineBanner>}
      {success && <InlineBanner tone="success">Numéro de reversement mis à jour.</InlineBanner>}

      <p className="mb-4 text-[13px] text-text-muted">
        Le numéro mobile money vers lequel vos reversements sont envoyés après la fin de chaque évènement.
        {!canManage && " Seul l'organisateur peut le modifier."}
      </p>

      <form
        onSubmit={handleSubmit((values) => {
          setSuccess(false);
          mutation.mutate(values);
        })}
      >
        <FormField
          label="Numéro mobile money"
          htmlFor="payout-phone-number"
          required
          hint="Format : 7XXXXXXXX ou +2217XXXXXXXX."
          error={errors.payoutPhoneNumber?.message}
        >
          <Input
            id="payout-phone-number"
            disabled={!canManage}
            invalid={!!errors.payoutPhoneNumber}
            {...register('payoutPhoneNumber')}
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
