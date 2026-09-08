'use client';

import { useCurrentUser } from '@/hooks/use-current-user';
import { canManageEvents } from '@/lib/rbac';
import { Kicker } from '@/components/ui/kicker';
import { EventWizard } from '@/components/events/wizard/event-wizard';

export default function NewEventPage() {
  const { activeMembership } = useCurrentUser();
  const organizationId = activeMembership?.organizationId;
  const canManage = canManageEvents(activeMembership?.role);

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

      {organizationId && <EventWizard organizationId={organizationId} eventId={null} />}
    </main>
  );
}
