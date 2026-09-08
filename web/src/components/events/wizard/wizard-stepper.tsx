'use client';

import { cn } from '@/lib/utils';
import { CheckCircleIcon } from '@/components/ui/icons';
import { WIZARD_STEPS, maxUnlockedStepIndex, type WizardStepCompletion, type WizardStepId } from './completion';

const STEP_LABELS: Record<WizardStepId, string> = {
  details: 'Détails',
  location: 'Lieu',
  media: 'Médias',
  tickets: 'Billets',
  optional: 'Bon à savoir',
  recap: 'Récapitulatif',
};

// Steps that carry a hard completion requirement — the other two (optional
// settings, recap) never show a checkmark of their own, just current/locked.
const REQUIRED_STEPS: WizardStepId[] = ['details', 'location', 'media', 'tickets'];

interface WizardStepperProps {
  current: WizardStepId;
  completion: WizardStepCompletion;
  onSelect: (step: WizardStepId) => void;
}

// New pattern for this project — no stepper/wizard convention existed in
// docs/DESIGN_SYSTEM.md before this. A horizontal numbered bar rather than a
// second sidebar: the dark sidebar already owns the app's main navigation,
// and a second vertical rail next to it would read as two competing navs.
export function WizardStepper({ current, completion, onSelect }: WizardStepperProps) {
  const maxUnlocked = maxUnlockedStepIndex(completion);
  const currentIndex = WIZARD_STEPS.indexOf(current);

  return (
    <ol className="mb-[22px] flex items-center gap-1.5 overflow-x-auto rounded-card border-[1.5px] border-border bg-card p-3">
      {WIZARD_STEPS.map((step, index) => {
        const isCurrent = step === current;
        const isComplete = REQUIRED_STEPS.includes(step) && completion[step as keyof WizardStepCompletion];
        const isUnlocked = index <= maxUnlocked;

        return (
          <li key={step} className="flex flex-1 items-center gap-1.5">
            <button
              type="button"
              disabled={!isUnlocked}
              onClick={() => onSelect(step)}
              className={cn(
                'flex w-full items-center gap-2 rounded px-2.5 py-2 text-left text-[12px] font-bold transition-colors',
                isCurrent && 'bg-indigo text-white',
                !isCurrent && isUnlocked && 'text-text hover:bg-bg',
                !isUnlocked && 'cursor-not-allowed text-text-muted',
              )}
            >
              {isComplete ? (
                <CheckCircleIcon className={cn('h-[18px] w-[18px] shrink-0', isCurrent ? 'text-white' : 'text-emerald-strong')} />
              ) : (
                <span
                  className={cn(
                    'flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-full text-[10px] font-extrabold',
                    isCurrent ? 'bg-white text-indigo' : 'border border-border text-text-muted',
                  )}
                >
                  {index + 1}
                </span>
              )}
              <span className="hidden truncate sm:inline">{STEP_LABELS[step]}</span>
            </button>
            {index < WIZARD_STEPS.length - 1 && (
              <span className={cn('h-px w-2 shrink-0', index < currentIndex ? 'bg-emerald-strong' : 'bg-border')} />
            )}
          </li>
        );
      })}
    </ol>
  );
}
