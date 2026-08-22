import { Icon } from '@iconify/react/offline';
import music from '@iconify-icons/lucide/music';
import sparkles from '@iconify-icons/lucide/sparkles';
import moon from '@iconify-icons/lucide/moon';
import award from '@iconify-icons/lucide/award';
import drama from '@iconify-icons/lucide/drama';
import presentation from '@iconify-icons/lucide/presentation';
import trophy from '@iconify-icons/lucide/trophy';
import shapes from '@iconify-icons/lucide/shapes';
import { cn } from '@/lib/utils';
import type { EventCategory } from '@/types';

const CATEGORY_ICONS: Record<string, typeof music> = {
  music,
  sparkles,
  moon,
  award,
  drama,
  presentation,
  trophy,
  shapes,
};

// Same "one static map of literal Tailwind classes" reasoning as
// TicketCategoryTag in ui/category-tag.tsx — the cat-* tokens are plain hex
// custom properties, and Tailwind needs the class strings to be literal
// (not interpolated) to pick them up at build time.
const COLOR_CLASSES: Record<string, string> = {
  indigo: 'bg-cat-indigo text-white',
  amber: 'bg-cat-amber text-ink',
  emerald: 'bg-cat-emerald text-white',
  rose: 'bg-cat-rose text-white',
  orange: 'bg-cat-orange text-white',
  teal: 'bg-cat-teal text-white',
};

export function EventCategoryBadge({ category }: { category: EventCategory }) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded px-[9px] py-1 text-[11px] font-bold',
        COLOR_CLASSES[category.colorToken],
      )}
    >
      <Icon icon={CATEGORY_ICONS[category.icon]} className="h-3 w-3" />
      {category.label}
    </span>
  );
}
