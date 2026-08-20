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
        'flex shrink-0 items-center justify-center rounded-full text-[11px] font-extrabold',
        tone === 'indigo' ? 'bg-indigo text-white' : 'bg-ink-2 text-on-dark',
      )}
      style={{ width: size, height: size }}
    >
      {initialsOf(name)}
    </div>
  );
}
