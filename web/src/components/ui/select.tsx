import { forwardRef } from 'react';
import { cn } from '@/lib/utils';

// Native <select> — enum pickers here top out at 5 options, so a custom
// dropdown would add a11y scope without a real UX gain.
export const Select = forwardRef<HTMLSelectElement, React.ComponentPropsWithoutRef<'select'> & { invalid?: boolean }>(
  ({ className, invalid, children, ...props }, ref) => (
    <select
      ref={ref}
      className={cn(
        'w-full rounded border-[1.5px] border-border bg-card px-3 py-2 text-[13px] text-text outline-none transition-colors focus:border-indigo disabled:cursor-not-allowed disabled:bg-bg disabled:text-text-muted',
        invalid && 'border-danger focus:border-danger',
        className,
      )}
      {...props}
    >
      {children}
    </select>
  ),
);
Select.displayName = 'Select';
