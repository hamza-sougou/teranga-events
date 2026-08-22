import { cn } from '@/lib/utils';

type BannerTone = 'success' | 'error';

const toneClasses: Record<BannerTone, string> = {
  success: 'bg-emerald-soft text-emerald-strong',
  error: 'bg-danger-soft text-danger-strong',
};

export function InlineBanner({ tone, children, className }: { tone: BannerTone; children: React.ReactNode; className?: string }) {
  return (
    <div className={cn('mb-4 rounded px-3.5 py-2.5 text-[13px] font-semibold', toneClasses[tone], className)}>
      {children}
    </div>
  );
}
