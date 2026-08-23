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
