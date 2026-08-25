'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';
import { Avatar } from '@/components/ui/avatar';
import { Wordmark } from '@/components/ui/wordmark';
import {
  EventsIcon,
  GridIcon,
  PayoutsIcon,
  SettingsIcon,
  TeamIcon,
  TicketsIcon,
} from './nav-icons';

interface NavItem {
  href: string;
  label: string;
  icon: (props: { className?: string }) => React.ReactElement;
}

const GENERAL_ITEMS: NavItem[] = [
  { href: '/dashboard', label: 'Tableau de bord', icon: GridIcon },
  { href: '/dashboard/events', label: 'Évènements', icon: EventsIcon },
  { href: '/dashboard/tickets', label: 'Billets', icon: TicketsIcon },
];

const MANAGEMENT_ITEMS: NavItem[] = [
  { href: '/dashboard/team', label: 'Équipe', icon: TeamIcon },
  { href: '/dashboard/payouts', label: 'Reversements', icon: PayoutsIcon },
  { href: '/dashboard/settings', label: 'Paramètres', icon: SettingsIcon },
];

function NavGroup({ label, items, pathname }: { label: string; items: NavItem[]; pathname: string }) {
  return (
    <div className="mb-7">
      <div className="mb-2.5 px-2.5 text-[11px] font-bold uppercase tracking-[0.08em] text-on-dark-muted">
        {label}
      </div>
      {items.map((item) => {
        const active = pathname === item.href;
        return (
          <Link
            key={item.href}
            href={item.href}
            className={cn(
              'mb-0.5 flex items-center gap-[11px] rounded px-2.5 py-2.5 text-sm font-semibold text-on-dark-muted transition-colors',
              active ? 'bg-ink-2 text-on-dark' : 'hover:text-on-dark',
            )}
          >
            <item.icon className="h-[17px] w-[17px] shrink-0" />
            {item.label}
          </Link>
        );
      })}
    </div>
  );
}

export function Sidebar({ organizationName, roleLabel }: { organizationName: string; roleLabel: string }) {
  const pathname = usePathname();

  return (
    <aside className="hidden flex-col bg-ink px-5 py-[26px] lg:flex">
      <Wordmark className="mb-10 text-on-dark" />

      <NavGroup label="Général" items={GENERAL_ITEMS} pathname={pathname} />
      <NavGroup label="Gestion" items={MANAGEMENT_ITEMS} pathname={pathname} />

      <div className="mt-auto border-t border-white/[0.08] pt-5">
        <div className="flex items-center gap-2.5">
          <Avatar name={organizationName} tone="indigo" size={32} />
          <div>
            <div className="text-[13px] font-bold text-on-dark">{organizationName}</div>
            <div className="text-[11px] text-on-dark-muted">{roleLabel}</div>
          </div>
        </div>
      </div>
    </aside>
  );
}
