// Icons from the Iconify Lucide set (docs/DESIGN_SYSTEM.md §"Icônes") —
// offline, no runtime call to the Iconify API: icon data is imported
// directly and passed to @iconify/react's offline Icon component.
import { Icon } from '@iconify/react/offline';
import layoutGrid from '@iconify-icons/lucide/layout-grid';
import calendar from '@iconify-icons/lucide/calendar';
import ticket from '@iconify-icons/lucide/ticket';
import users from '@iconify-icons/lucide/users';
import wallet from '@iconify-icons/lucide/wallet';
import settings from '@iconify-icons/lucide/settings';
import bell from '@iconify-icons/lucide/bell';
import building2 from '@iconify-icons/lucide/building-2';
import trendingUp from '@iconify-icons/lucide/trending-up';

type IconProps = { className?: string };

export function GridIcon({ className }: IconProps) {
  return <Icon icon={layoutGrid} className={className} />;
}

export function EventsIcon({ className }: IconProps) {
  return <Icon icon={calendar} className={className} />;
}

export function TicketsIcon({ className }: IconProps) {
  return <Icon icon={ticket} className={className} />;
}

export function TeamIcon({ className }: IconProps) {
  return <Icon icon={users} className={className} />;
}

export function PayoutsIcon({ className }: IconProps) {
  return <Icon icon={wallet} className={className} />;
}

export function SettingsIcon({ className }: IconProps) {
  return <Icon icon={settings} className={className} />;
}

export function BellIcon({ className }: IconProps) {
  return <Icon icon={bell} className={className} />;
}

export function BuildingIcon({ className }: IconProps) {
  return <Icon icon={building2} className={className} />;
}

export function FinancesIcon({ className }: IconProps) {
  return <Icon icon={trendingUp} className={className} />;
}
