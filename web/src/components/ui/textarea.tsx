import { forwardRef } from 'react';
import { cn } from '@/lib/utils';

const baseClasses =
  'w-full rounded border-[1.5px] border-border bg-card px-3 py-2 text-[13px] text-text outline-none transition-colors placeholder:text-text-muted focus:border-indigo disabled:cursor-not-allowed disabled:bg-bg disabled:text-text-muted';

export const Textarea = forwardRef<HTMLTextAreaElement, React.ComponentPropsWithoutRef<'textarea'> & { invalid?: boolean }>(
  ({ className, invalid, rows = 3, ...props }, ref) => (
    <textarea
      ref={ref}
      rows={rows}
      className={cn(baseClasses, 'resize-none', invalid && 'border-danger focus:border-danger', className)}
      {...props}
    />
  ),
);
Textarea.displayName = 'Textarea';
