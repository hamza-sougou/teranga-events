import { forwardRef } from 'react';
import { cn } from '@/lib/utils';

// Native <input type="checkbox"> styled via accent-color — same reasoning
// as Select: a hand-drawn box+icon widget would add a11y scope without a
// real UX gain for a plain opt-in/consent checkbox.
export const Checkbox = forwardRef<HTMLInputElement, React.ComponentPropsWithoutRef<'input'> & { invalid?: boolean }>(
  ({ className, invalid, ...props }, ref) => (
    <input
      ref={ref}
      type="checkbox"
      className={cn(
        'mt-0.5 h-4 w-4 shrink-0 rounded border-[1.5px] border-border bg-card accent-indigo outline-none focus-visible:ring-2 focus-visible:ring-indigo disabled:cursor-not-allowed',
        invalid && 'border-danger',
        className,
      )}
      {...props}
    />
  ),
);
Checkbox.displayName = 'Checkbox';

interface CheckboxFieldOwnProps {
  htmlFor: string;
  error?: string;
  children: React.ReactNode;
}

// Label-beside-input row, the checkbox counterpart to FormField's
// label-above layout — reused as-is by the register form and the Google
// signup-completion form (same two checkboxes, same copy). forwardRef (not
// a plain function) so `{...register('x')}` — which includes a `ref` — can
// be spread directly and still reach the real <input>, same reason Input/
// Select are forwardRef.
export const CheckboxField = forwardRef<
  HTMLInputElement,
  CheckboxFieldOwnProps & React.ComponentPropsWithoutRef<typeof Checkbox>
>(({ htmlFor, error, children, className, invalid, ...checkboxProps }, ref) => (
  <div className="mb-4">
    <label htmlFor={htmlFor} className="flex cursor-pointer items-start gap-2.5">
      <Checkbox ref={ref} id={htmlFor} invalid={invalid || !!error} className={className} {...checkboxProps} />
      <span className="text-[13px] leading-snug text-text">{children}</span>
    </label>
    {error && <p className="mt-1.5 pl-[26px] text-[11px] font-semibold text-danger">{error}</p>}
  </div>
));
CheckboxField.displayName = 'CheckboxField';
