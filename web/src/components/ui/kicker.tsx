import { cn } from '@/lib/utils';

type KickerTone = 'light' | 'dark' | 'onAccent';

const toneClasses: Record<KickerTone, string> = {
  light: 'bg-indigo',
  dark: 'bg-emerald',
  onAccent: 'bg-bg',
};

// The small trait above every section title — docs/DESIGN_SYSTEM.md §3.
export function Kicker({ tone = 'light', className }: { tone?: KickerTone; className?: string }) {
  return <span className={cn('mb-2.5 block h-1 w-8 rounded-sm', toneClasses[tone], className)} />;
}
