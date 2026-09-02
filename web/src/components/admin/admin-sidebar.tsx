'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';
import { logout } from '@/lib/auth';
import { Avatar } from '@/components/ui/avatar';
import { RowMenu } from '@/components/ui/row-menu';
import { Wordmark } from '@/components/ui/wordmark';
import { BuildingIcon, EventsIcon, FinancesIcon } from '@/components/dashboard/nav-icons';

interface NavItem {
  href: string;
  label: string;
  icon: (props: { className?: string }) => React.ReactElement;
}

const PLATFORM_ITEMS: NavItem[] = [
  { href: '/admin/organizations', label: 'Organisations', icon: BuildingIcon },
  { href: '/admin/events', label: 'Évènements', icon: EventsIcon },
  { href: '/admin/finances', label: 'Finances', icon: FinancesIcon },
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

// Same visual pattern as components/dashboard/sidebar.tsx (Wordmark, nav
// groups, RowMenu account footer) but its own content — a Super Admin has
// no organization membership, so there's no organizationName/roleLabel here.
export function AdminSidebar({ fullName }: { fullName: string }) {
  const pathname = usePathname();

  return (
    <aside className="hidden flex-col bg-ink px-5 py-[26px] lg:flex">
      <Wordmark className="mb-10 text-on-dark" href="/admin/organizations" />

      <NavGroup label="Plateforme" items={PLATFORM_ITEMS} pathname={pathname} />

      <div className="mt-auto border-t border-white/[0.08] pt-5">
        <RowMenu
          placement="top"
          items={[{ label: 'Se déconnecter', tone: 'danger', onClick: logout }]}
          trigger={({ toggle }) => (
            <button
              type="button"
              aria-label="Menu du compte"
              aria-haspopup="menu"
              onClick={toggle}
              className="flex w-full items-center gap-2.5 rounded px-1.5 py-1.5 text-left transition-colors hover:bg-ink-2"
            >
              <Avatar name={fullName} tone="indigo" size={32} />
              <div>
                <div className="text-[13px] font-bold text-on-dark">{fullName}</div>
                <div className="text-[11px] text-on-dark-muted">Super Admin</div>
              </div>
            </button>
          )}
        />
      </div>
    </aside>
  );
}
