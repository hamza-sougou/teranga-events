import { forwardRef } from 'react';
import { cn } from '@/lib/utils';

const baseClasses =
  'w-full rounded border-[1.5px] border-border bg-card px-3 py-2 text-[13px] text-text outline-none transition-colors placeholder:text-text-muted focus:border-indigo disabled:cursor-not-allowed disabled:bg-bg disabled:text-text-muted';

export const Input = forwardRef<HTMLInputElement, React.ComponentPropsWithoutRef<'input'> & { invalid?: boolean }>(
  ({ className, invalid, ...props }, ref) => (
    <input ref={ref} className={cn(baseClasses, invalid && 'border-danger focus:border-danger', className)} {...props} />
  ),
);
Input.displayName = 'Input';
