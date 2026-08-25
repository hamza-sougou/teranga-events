import Link from 'next/link';
import { cn } from '@/lib/utils';

// The "zen[events]" wordmark, extracted from the dashboard sidebar so the
// public navbar can reuse it verbatim instead of a third hand-copied string.
export function Wordmark({ className, href = '/' }: { className?: string; href?: string }) {
  return (
    <Link href={href} className={cn('text-[17px] font-black', className)}>
      zen<span className="text-indigo">events</span>
    </Link>
  );
}
