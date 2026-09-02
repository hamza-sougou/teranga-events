import { cn } from '@/lib/utils';

export type IdentifierMode = 'email' | 'phone';

// Mirrors RegisterDto/LoginDto's email?/phone? shape (@ExactlyOneIdentifier)
// — an explicit toggle rather than a single auto-detected field, since the
// backend expects two distinct mutually-exclusive fields, not one identifier
// to be parsed. Local to auth/ rather than a new ui/ "Tabs" primitive: no
// other page in the design system needs one yet.
export function IdentifierToggle({ mode, onChange }: { mode: IdentifierMode; onChange: (mode: IdentifierMode) => void }) {
  return (
    <div className="mb-4 inline-flex rounded border border-border p-0.5" role="tablist">
      {(
        [
          ['email', 'Email'],
          ['phone', 'Téléphone'],
        ] as const
      ).map(([value, label]) => (
        <button
          key={value}
          type="button"
          role="tab"
          aria-selected={mode === value}
          onClick={() => onChange(value)}
          className={cn(
            'rounded px-3.5 py-1.5 text-[12px] font-bold transition-colors',
            mode === value ? 'bg-indigo text-white' : 'text-text-muted hover:text-text',
          )}
        >
          {label}
        </button>
      ))}
    </div>
  );
}
