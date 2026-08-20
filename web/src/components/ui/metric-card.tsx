import { cn } from '@/lib/utils';

interface MetricCardProps {
  label: string;
  value: React.ReactNode;
  sub?: React.ReactNode;
  subTone?: 'positive' | 'neutral';
  progress?: number;
}

export function MetricCard({ label, value, sub, subTone = 'positive', progress }: MetricCardProps) {
  return (
    <div className="rounded-card border-[1.5px] border-border bg-card px-5 py-[18px]">
      <div className="mb-2.5 text-xs font-semibold text-text-muted">{label}</div>
      <div className="mb-2 text-[26px] font-black leading-none">{value}</div>
      {sub && (
        <div
          className={cn(
            'flex items-center gap-1 text-xs font-bold',
            subTone === 'positive' ? 'text-emerald' : 'text-text-muted',
          )}
        >
          {sub}
        </div>
      )}
      {progress !== undefined && (
        <div className="mt-2.5 h-[5px] overflow-hidden rounded-full bg-bg">
          <div
            className="h-full rounded-full bg-indigo"
            style={{ width: `${Math.min(100, Math.max(0, progress))}%` }}
          />
        </div>
      )}
    </div>
  );
}
