'use client';

import { useRouter } from 'next/navigation';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';
import { useCurrentUser } from '@/hooks/use-current-user';
import { queryKeys } from '@/lib/query-keys';
import { canManageEvents } from '@/lib/rbac';
import { getApiErrorMessage } from '@/lib/api-errors';
import { Kicker } from '@/components/ui/kicker';
import { Panel } from '@/components/ui/panel';
import { InlineBanner } from '@/components/ui/inline-banner';
import { EventForm, type EventFormSubmitPayload } from '@/components/events/event-form';
import type { Event } from '@/types';

export default function NewEventPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { activeMembership } = useCurrentUser();
  const organizationId = activeMembership?.organizationId;
  const canManage = canManageEvents(activeMembership?.role);

  const mutation = useMutation({
    mutationFn: (payload: EventFormSubmitPayload) =>
      apiClient.post<Event>(`/organizations/${organizationId}/events`, payload),
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.events(organizationId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.orgStats(organizationId) });
      router.push(`/dashboard/events/${res.data.id}`);
    },
  });

  if (activeMembership && !canManage) {
    return (
      <main className="px-9 py-[30px]">
        <p className="text-sm text-text-muted">
          Accès non autorisé — seuls les organisateurs et co-organisateurs peuvent créer un évènement.
        </p>
      </main>
    );
  }

  return (
    <main className="px-9 py-[30px] pb-[50px]">
      <div className="mb-[30px]">
        <Kicker />
        <h1 className="text-2xl font-black uppercase tracking-[-0.01em]">Nouvel évènement</h1>
      </div>

      <div className="max-w-[640px]">
        <Panel>
          {mutation.isError && <InlineBanner tone="error">{getApiErrorMessage(mutation.error)}</InlineBanner>}
          <EventForm
            mode="create"
            submitLabel="Créer l'évènement"
            submitting={mutation.isPending}
            onSubmit={(payload) => mutation.mutate(payload)}
          />
        </Panel>
      </div>
    </main>
  );
}
