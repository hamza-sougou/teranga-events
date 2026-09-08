'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';
import { queryKeys } from '@/lib/query-keys';
import { getApiErrorMessage } from '@/lib/api-errors';
import { Button } from '@/components/ui/button';
import { InlineBanner } from '@/components/ui/inline-banner';

interface CancelDraftActionProps {
  organizationId: string;
  eventId: string;
}

// Reproduces only the DRAFT -> CANCELLED branch of EventStatusControl (the
// flat edit view's status widget). A DRAFT event never reaches that
// component anymore — the wizard replaces the flat view for DRAFT — so this
// is its one remaining entry point, kept deliberately separate rather than
// embedding the full EventStatusControl here: that component also renders
// "Publier" for DRAFT, which would duplicate the recap step's own button.
export function CancelDraftAction({ organizationId, eventId }: CancelDraftActionProps) {
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: () => apiClient.patch(`/organizations/${organizationId}/events/${eventId}`, { status: 'CANCELLED' }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.event(organizationId, eventId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.events(organizationId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.orgStats(organizationId) });
    },
  });

  function handleClick() {
    if (!window.confirm('Annuler ce brouillon ? Cette action est définitive.')) return;
    mutation.mutate();
  }

  return (
    <div className="mb-3 flex items-center justify-end gap-3">
      {mutation.isError && <InlineBanner tone="error" className="mb-0 flex-1">{getApiErrorMessage(mutation.error)}</InlineBanner>}
      <Button type="button" variant="ghost" loading={mutation.isPending} onClick={handleClick}>
        Annuler ce brouillon
      </Button>
    </div>
  );
}
