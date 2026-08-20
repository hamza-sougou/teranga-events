import { cn } from '@/lib/utils';

interface PanelProps {
  title?: string;
  action?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}

// Pixel values match the mockup's .panel/.panel-head exactly (bracket
// syntax since they fall outside Tailwind's default spacing scale).
export function Panel({ title, action, children, className }: PanelProps) {
  return (
    <div className={cn('mb-[18px] rounded-card border-[1.5px] border-border bg-card p-[22px]', className)}>
      {(title || action) && (
        <div className="mb-5 flex items-center justify-between">
          {title && <h3 className="text-[13px] font-extrabold uppercase tracking-wide">{title}</h3>}
          {action}
        </div>
      )}
      {children}
    </div>
  );
}
