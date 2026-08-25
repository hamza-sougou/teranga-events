import { UserCheckIcon, ShirtIcon } from '@/components/ui/icons';
import type { DressCodeAudience, EventDressCode } from '@/types';

const AUDIENCE_SUFFIX: Record<DressCodeAudience, string> = {
  EVERYONE: '',
  MEN: ' (Hommes)',
  WOMEN: ' (Femmes)',
};

// Compact single-column readout — deliberately not the full organizer editor
// UI (min-age-field.tsx/dress-code-editor.tsx are edit forms, not display),
// consistent with "immersive but not overloaded" (docs/DESIGN_SYSTEM.md).
export function PracticalInfo({ minAge, dressCodes }: { minAge: number | null; dressCodes: EventDressCode[] }) {
  if (minAge == null && dressCodes.length === 0) return null;

  const dressCodeText = dressCodes.map((dc) => `${dc.label}${AUDIENCE_SUFFIX[dc.appliesTo]}`).join(', ');

  return (
    <div className="flex flex-col gap-2.5 text-[13px] font-semibold text-text">
      {minAge != null && (
        <div className="flex items-center gap-2">
          <UserCheckIcon className="h-4 w-4 shrink-0 text-indigo" />
          <span>{minAge} ans et plus uniquement</span>
        </div>
      )}
      {dressCodes.length > 0 && (
        <div className="flex items-start gap-2">
          <ShirtIcon className="mt-0.5 h-4 w-4 shrink-0 text-indigo" />
          <span>{dressCodeText}</span>
        </div>
      )}
    </div>
  );
}
