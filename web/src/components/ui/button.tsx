import { cn } from '@/lib/utils';

export type ButtonVariant = 'primary' | 'ghost';

const base = 'inline-flex items-center gap-2 rounded px-4 py-2.5 text-[13px] font-bold transition-colors';
const variantClasses: Record<ButtonVariant, string> = {
  primary: 'bg-indigo text-white hover:opacity-90',
  ghost: 'border border-border bg-card text-text hover:bg-bg',
};

// Exported so link-styled "buttons" (next/link, <a href>) can share the
// exact same look without a second component — see the topbar actions in
// the dashboard page.
export function buttonClasses(variant: ButtonVariant = 'primary', className?: string) {
  return cn(base, variantClasses[variant], className);
}

export function Button({
  variant = 'primary',
  className,
  ...props
}: React.ComponentPropsWithoutRef<'button'> & { variant?: ButtonVariant }) {
  return <button className={buttonClasses(variant, className)} {...props} />;
}
