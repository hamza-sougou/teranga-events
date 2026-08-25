import { cn } from '@/lib/utils';

function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  return parts
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('');
}

export function Avatar({
  name,
  tone = 'dark',
  size = 30,
}: {
  name: string;
  tone?: 'dark' | 'indigo';
  size?: number;
}) {
  return (
    <div
      className={cn(
        'flex shrink-0 items-center justify-center rounded-full font-extrabold',
        tone === 'indigo' ? 'bg-indigo text-white' : 'bg-ink-2 text-on-dark',
      )}
      // Scales with size (11px at the default 30px, tuned to match every
      // existing call site) rather than a fixed text-[11px] that would look
      // tiny in a larger avatar like the participant page's organizer panel.
      style={{ width: size, height: size, fontSize: Math.round(size * 0.367) }}
    >
      {initialsOf(name)}
    </div>
  );
}
