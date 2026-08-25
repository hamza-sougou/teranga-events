import music from '@iconify-icons/lucide/music';
import sparkles from '@iconify-icons/lucide/sparkles';
import moon from '@iconify-icons/lucide/moon';
import award from '@iconify-icons/lucide/award';
import drama from '@iconify-icons/lucide/drama';
import presentation from '@iconify-icons/lucide/presentation';
import trophy from '@iconify-icons/lucide/trophy';
import shapes from '@iconify-icons/lucide/shapes';

// Keyed by the `icon` string each event_categories row carries from the API
// (db/schema.sql §3B). One static map, not a per-call-site import, since
// Iconify icons can't be pulled in via a dynamic path (docs/DESIGN_SYSTEM.md
// "Icônes"). Shared by CategorySelect (organizer form) and PublicNavbar
// (category pills) so both render the exact same icon per category.
export const CATEGORY_ICONS: Record<string, typeof music> = {
  music,
  sparkles,
  moon,
  award,
  drama,
  presentation,
  trophy,
  shapes,
};
