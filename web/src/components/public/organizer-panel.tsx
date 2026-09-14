'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';
import { queryKeys } from '@/lib/query-keys';
import { Panel } from '@/components/ui/panel';
import { Avatar } from '@/components/ui/avatar';
import { buttonClasses } from '@/components/ui/button';
import { BadgeCheckIcon, MailIcon } from '@/components/ui/icons';
import { OrganizerSubscribeWidget } from '@/components/public/organizer-subscribe-widget';
import { OrganizerContactModal } from '@/components/public/organizer-contact-modal';
import type { PublicOrganizerProfile } from '@/types';

interface OrganizerPanelProps {
  organizationSlug: string;
  organizationName: string;
  isVerified: boolean;
}

// Compact summary only — this page's job is to sell the current event's
// ticket, not to become a second organizer profile. The full event
// history/subscribe form live at /organizers/[slug] (see the "Voir le
// profil complet" link below).
export function OrganizerPanel({ organizationSlug, organizationName, isVerified }: OrganizerPanelProps) {
  const [contactOpen, setContactOpen] = useState(false);

  const profileQuery = useQuery<PublicOrganizerProfile>({
    queryKey: queryKeys.publicOrganizer(organizationSlug),
    queryFn: async () => (await apiClient.get(`/organizers/${organizationSlug}`)).data,
    enabled: !!organizationSlug,
  });

  const eventCount = profileQuery.data?.publishedEventCount;

  return (
    <Panel title="Organisé par">
      <div className="flex flex-wrap items-center gap-4">
        <div className="relative shrink-0">
          <Avatar name={organizationName} tone="indigo" size={56} />
          {isVerified && (
            <span
              title="Organisateur de confiance"
              className="absolute -bottom-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full bg-emerald text-white ring-2 ring-card"
            >
              <BadgeCheckIcon className="h-3 w-3" />
            </span>
          )}
        </div>

        <div className="min-w-0 flex-1">
          <div className="font-bold text-text">{organizationName}</div>
          <div className="text-[13px] text-text-muted">
            {eventCount === undefined ? '…' : `${eventCount} évènement${eventCount === 1 ? '' : 's'} organisé${eventCount === 1 ? '' : 's'}`}
          </div>
          <Link href={`/organizers/${organizationSlug}`} className="text-[12px] font-semibold text-indigo underline">
            Voir le profil complet
          </Link>
        </div>

        <div className="flex flex-wrap items-start gap-2">
          <button type="button" className={buttonClasses('ghost')} onClick={() => setContactOpen(true)}>
            <MailIcon className="h-4 w-4" />
            Contact
          </button>
          <OrganizerSubscribeWidget organizationSlug={organizationSlug} variant="compact" />
        </div>
      </div>

      <OrganizerContactModal
        open={contactOpen}
        onClose={() => setContactOpen(false)}
        organizationSlug={organizationSlug}
        organizationName={organizationName}
      />
    </Panel>
  );
}
