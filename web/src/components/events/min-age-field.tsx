'use client';

import { useState } from 'react';
import { Button, buttonClasses } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { PlusIcon, XCloseIcon } from '@/components/ui/icons';

type AgeMode = 'everyone' | 'eighteen_plus' | 'custom';

function deriveMode(value: number | null): AgeMode {
  if (value === 18) return 'eighteen_plus';
  if (value == null) return 'everyone';
  return 'custom';
}

interface MinAgeFieldProps {
  value: number | null;
  onChange: (value: number | null) => void;
  disabled?: boolean;
}

// Collapsed/expanded section for the "Âge minimum" optional setting — see
// DressCodeEditor for the sibling section and docs/DESIGN_SYSTEM.md for the
// tokens reused here (no hardcoded color/radius).
export function MinAgeField({ value, onChange, disabled }: MinAgeFieldProps) {
  const [expanded, setExpanded] = useState(value != null);
  const [mode, setMode] = useState<AgeMode>(() => deriveMode(value));

  if (!expanded) {
    return (
      <Button type="button" variant="ghost" disabled={disabled} onClick={() => setExpanded(true)}>
        <PlusIcon className="h-3.5 w-3.5" /> Âge minimum
      </Button>
    );
  }

  function selectEveryone() {
    setMode('everyone');
    onChange(null);
  }

  function selectEighteenPlus() {
    setMode('eighteen_plus');
    onChange(18);
  }

  function selectCustom() {
    setMode('custom');
    if (value === null || value === 18) {
      onChange(null);
    }
  }

  function handleCustomInput(raw: string) {
    if (raw === '') {
      onChange(null);
      return;
    }
    const parsed = Number(raw);
    if (!Number.isNaN(parsed)) onChange(parsed);
  }

  function handleRemove() {
    onChange(null);
    setMode('everyone');
    setExpanded(false);
  }

  return (
    <div>
      <div className="mb-2.5 flex items-center justify-between">
        <span className="text-[12px] font-bold text-text">Âge minimum</span>
        <button
          type="button"
          disabled={disabled}
          onClick={handleRemove}
          className="flex items-center gap-1 text-[11px] font-semibold text-text-muted hover:text-text"
        >
          <XCloseIcon className="h-3 w-3" /> Retirer
        </button>
      </div>

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          disabled={disabled}
          onClick={selectEveryone}
          className={buttonClasses(mode === 'everyone' ? 'primary' : 'ghost', 'text-[12px]')}
        >
          Tout le monde
        </button>
        <button
          type="button"
          disabled={disabled}
          onClick={selectEighteenPlus}
          className={buttonClasses(mode === 'eighteen_plus' ? 'primary' : 'ghost', 'text-[12px]')}
        >
          18+
        </button>
        <button
          type="button"
          disabled={disabled}
          onClick={selectCustom}
          className={buttonClasses(mode === 'custom' ? 'primary' : 'ghost', 'text-[12px]')}
        >
          Personnalisé
        </button>
      </div>

      {mode === 'custom' && (
        <div className="mt-2.5 max-w-[140px]">
          <Input
            type="number"
            min={0}
            max={99}
            disabled={disabled}
            value={value ?? ''}
            onChange={(e) => handleCustomInput(e.target.value)}
          />
        </div>
      )}
    </div>
  );
}
