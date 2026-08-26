// General-purpose icon set (not sidebar-nav-specific — see
// components/dashboard/nav-icons.tsx for that one). Same offline-Iconify-
// Lucide pattern: docs/DESIGN_SYSTEM.md §"Icônes".
import { Icon } from '@iconify/react/offline';
import plus from '@iconify-icons/lucide/plus';
import trash2 from '@iconify-icons/lucide/trash-2';
import mail from '@iconify-icons/lucide/mail';
import pencil from '@iconify-icons/lucide/pencil';
import x from '@iconify-icons/lucide/x';
import loader2 from '@iconify-icons/lucide/loader-2';
import chevronRight from '@iconify-icons/lucide/chevron-right';
import image from '@iconify-icons/lucide/image';
import video from '@iconify-icons/lucide/video';
import uploadCloud from '@iconify-icons/lucide/upload-cloud';
import search from '@iconify-icons/lucide/search';
import download from '@iconify-icons/lucide/download';
import moreVertical from '@iconify-icons/lucide/more-vertical';
import userPlus from '@iconify-icons/lucide/user-plus';
import share2 from '@iconify-icons/lucide/share-2';
import mapPin from '@iconify-icons/lucide/map-pin';
import minus from '@iconify-icons/lucide/minus';
import shirt from '@iconify-icons/lucide/shirt';
import userCheck from '@iconify-icons/lucide/user-check';
import ticket from '@iconify-icons/lucide/ticket';
import badgeCheck from '@iconify-icons/lucide/badge-check';
import menu from '@iconify-icons/lucide/menu';
import calendar from '@iconify-icons/lucide/calendar';
import compass from '@iconify-icons/lucide/compass';
import zap from '@iconify-icons/lucide/zap';
import history from '@iconify-icons/lucide/history';
import flame from '@iconify-icons/lucide/flame';
import gift from '@iconify-icons/lucide/gift';
import trendingUp from '@iconify-icons/lucide/trending-up';

type IconProps = { className?: string };

export function PlusIcon({ className }: IconProps) {
  return <Icon icon={plus} className={className} />;
}

export function TrashIcon({ className }: IconProps) {
  return <Icon icon={trash2} className={className} />;
}

export function MailIcon({ className }: IconProps) {
  return <Icon icon={mail} className={className} />;
}

export function PencilIcon({ className }: IconProps) {
  return <Icon icon={pencil} className={className} />;
}

export function XCloseIcon({ className }: IconProps) {
  return <Icon icon={x} className={className} />;
}

export function LoaderIcon({ className }: IconProps) {
  return <Icon icon={loader2} className={className} />;
}

export function ChevronRightIcon({ className }: IconProps) {
  return <Icon icon={chevronRight} className={className} />;
}

export function ImageIcon({ className }: IconProps) {
  return <Icon icon={image} className={className} />;
}

export function VideoIcon({ className }: IconProps) {
  return <Icon icon={video} className={className} />;
}

export function UploadCloudIcon({ className }: IconProps) {
  return <Icon icon={uploadCloud} className={className} />;
}

export function SearchIcon({ className }: IconProps) {
  return <Icon icon={search} className={className} />;
}

export function DownloadIcon({ className }: IconProps) {
  return <Icon icon={download} className={className} />;
}

export function MoreVerticalIcon({ className }: IconProps) {
  return <Icon icon={moreVertical} className={className} />;
}

export function UserPlusIcon({ className }: IconProps) {
  return <Icon icon={userPlus} className={className} />;
}

export function ShareIcon({ className }: IconProps) {
  return <Icon icon={share2} className={className} />;
}

export function MapPinIcon({ className }: IconProps) {
  return <Icon icon={mapPin} className={className} />;
}

export function MinusIcon({ className }: IconProps) {
  return <Icon icon={minus} className={className} />;
}

export function ShirtIcon({ className }: IconProps) {
  return <Icon icon={shirt} className={className} />;
}

export function UserCheckIcon({ className }: IconProps) {
  return <Icon icon={userCheck} className={className} />;
}

export function TicketIcon({ className }: IconProps) {
  return <Icon icon={ticket} className={className} />;
}

export function BadgeCheckIcon({ className }: IconProps) {
  return <Icon icon={badgeCheck} className={className} />;
}

export function MenuIcon({ className }: IconProps) {
  return <Icon icon={menu} className={className} />;
}

export function CalendarIcon({ className }: IconProps) {
  return <Icon icon={calendar} className={className} />;
}

export function CompassIcon({ className }: IconProps) {
  return <Icon icon={compass} className={className} />;
}

export function ZapIcon({ className }: IconProps) {
  return <Icon icon={zap} className={className} />;
}

export function HistoryIcon({ className }: IconProps) {
  return <Icon icon={history} className={className} />;
}

export function FlameIcon({ className }: IconProps) {
  return <Icon icon={flame} className={className} />;
}

export function GiftIcon({ className }: IconProps) {
  return <Icon icon={gift} className={className} />;
}

export function TrendingUpIcon({ className }: IconProps) {
  return <Icon icon={trendingUp} className={className} />;
}
