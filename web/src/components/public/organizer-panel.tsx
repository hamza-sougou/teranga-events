import { Panel } from '@/components/ui/panel';
import { Avatar } from '@/components/ui/avatar';
import { buttonClasses } from '@/components/ui/button';
import { BadgeCheckIcon, MailIcon, UserPlusIcon } from '@/components/ui/icons';

// Every field here except `organizerName` is fictional placeholder data —
// no organizer profile module (avatar, verification, followers, event
// count) exists yet. This is a layout preview only; Contact/Suivre are
// deliberately inert until that module exists.
const FAKE_FOLLOWER_COUNT = '1 284 abonnés';
const FAKE_EVENT_COUNT = '23 évènements organisés';

export function OrganizerPanel({ organizerName }: { organizerName: string }) {
  return (
    <Panel title="Organisé par">
      <div className="flex flex-wrap items-center gap-4">
        <div className="relative shrink-0">
          <Avatar name={organizerName} tone="indigo" size={56} />
          <span
            title="Organisateur de confiance"
            className="absolute -bottom-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full bg-emerald text-white ring-2 ring-card"
          >
            <BadgeCheckIcon className="h-3 w-3" />
          </span>
        </div>

        <div className="min-w-0 flex-1">
          <div className="font-bold text-text">{organizerName}</div>
          <div className="text-[13px] text-text-muted">
            {FAKE_FOLLOWER_COUNT} · {FAKE_EVENT_COUNT}
          </div>
        </div>

        <div className="flex gap-2">
          <button type="button" className={buttonClasses('ghost')}>
            <MailIcon className="h-4 w-4" />
            Contact
          </button>
          <button type="button" className={buttonClasses('primary')}>
            <UserPlusIcon className="h-4 w-4" />
            Suivre
          </button>
        </div>
      </div>
    </Panel>
  );
}
