'use client';

import { useState } from 'react';
import { useFieldArray, useWatch } from 'react-hook-form';
import { Button, buttonClasses } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { PlusIcon, TrashIcon, XCloseIcon } from '@/components/ui/icons';
import { cn } from '@/lib/utils';
import type { DressCodeAudience } from '@/types';

const AUDIENCE_GROUPS: { value: DressCodeAudience; label: string }[] = [
  { value: 'EVERYONE', label: 'Tout le monde' },
  { value: 'MEN', label: 'Homme' },
  { value: 'WOMEN', label: 'Femme' },
];

const MAX_PER_AUDIENCE = 3;
const LABEL_MAX_LENGTH = 25;

interface DressCodeEditorProps {
  // react-hook-form's Control<T>/UseFormRegister<T> don't structurally
  // narrow to a "just the dressCodes slice" type, and wrapping `any` as a
  // type argument (Control<any>) still trips their internal generics — a
  // bare `any` here (rather than a generic type param) is the pragmatic
  // escape hatch for a component with exactly one caller; the field paths
  // below are plain literals, still checked at the call site by
  // EventFormValues itself.
  control: any;
  register: any;
  errors?: any;
  disabled?: boolean;
  hasInitialEntries?: boolean;
}

// Collapsed/expanded section for the "Dress code" optional setting — see
// MinAgeField for the sibling section. Entries live in one flat field array
// (react-hook-form useFieldArray) grouped by applies_to for display; each
// entry keeps its own category Select so it can be moved between groups
// without deleting/re-adding it.
export function DressCodeEditor({ control, register, errors, disabled, hasInitialEntries }: DressCodeEditorProps) {
  const { fields, append, remove, replace } = useFieldArray({ control, name: 'dressCodes' });
  // useFieldArray's `fields` only updates on structural changes (append/
  // remove) — useWatch gives the live per-row values so the grouping and
  // per-group "3 entries reached" count stay correct as a row's category
  // Select changes.
  const watchedEntries = useWatch({ control, name: 'dressCodes' }) ?? [];
  const [expanded, setExpanded] = useState(!!hasInitialEntries);

  if (!expanded) {
    return (
      <Button type="button" variant="ghost" disabled={disabled} onClick={() => setExpanded(true)}>
        <PlusIcon className="h-3.5 w-3.5" /> Dress code
      </Button>
    );
  }

  function handleRemoveSection() {
    replace([]);
    setExpanded(false);
  }

  return (
    <div>
      <div className="mb-3 flex items-center justify-between">
        <span className="text-[12px] font-bold text-text">Dress code</span>
        <button
          type="button"
          disabled={disabled}
          onClick={handleRemoveSection}
          className="flex items-center gap-1 text-[11px] font-semibold text-text-muted hover:text-text"
        >
          <XCloseIcon className="h-3 w-3" /> Retirer
        </button>
      </div>

      <div className="space-y-4">
        {AUDIENCE_GROUPS.map((group) => {
          const indices = fields.map((_, i) => i).filter((i) => (watchedEntries[i]?.appliesTo ?? 'EVERYONE') === group.value);
          const atLimit = indices.length >= MAX_PER_AUDIENCE;

          return (
            <div key={group.value}>
              <p className="mb-1.5 text-[11px] font-bold uppercase tracking-wide text-text-muted">{group.label}</p>

              {indices.length > 0 && (
                <div className="space-y-2">
                  {indices.map((index) => {
                    const labelLength = watchedEntries[index]?.label?.length ?? 0;
                    const labelError = errors?.[index]?.label?.message;
                    return (
                      // Stacked on mobile, side-by-side from sm: — two nested
                      // Panels' padding leaves too little width at 375px for
                      // label + fixed-width select + trash button in one row
                      // (same fix pattern as EventLocationPicker's search bar).
                      <div key={fields[index].id} className="flex flex-col gap-2 sm:flex-row sm:items-start">
                        <div className="flex-1">
                          <Input
                            maxLength={LABEL_MAX_LENGTH}
                            disabled={disabled}
                            invalid={!!labelError}
                            placeholder="Ex: Costume"
                            {...register(`dressCodes.${index}.label` as const)}
                          />
                          <p className={cn('mt-1 text-[10px]', labelError ? 'font-semibold text-danger' : 'text-text-muted')}>
                            {labelError ?? `${labelLength}/${LABEL_MAX_LENGTH}`}
                          </p>
                        </div>
                        <div className="flex items-center gap-2">
                          <div className="flex-1 sm:w-[136px] sm:flex-none">
                            <Select disabled={disabled} {...register(`dressCodes.${index}.appliesTo` as const)}>
                              {AUDIENCE_GROUPS.map((g) => (
                                <option key={g.value} value={g.value}>
                                  {g.label}
                                </option>
                              ))}
                            </Select>
                          </div>
                          <button
                            type="button"
                            aria-label="Supprimer cette entrée"
                            disabled={disabled}
                            onClick={() => remove(index)}
                            className="flex h-9 w-9 shrink-0 items-center justify-center rounded text-text-muted hover:bg-bg"
                          >
                            <TrashIcon className="h-4 w-4" />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {!atLimit && (
                <button
                  type="button"
                  disabled={disabled}
                  onClick={() => append({ label: '', appliesTo: group.value })}
                  className={buttonClasses('ghost', 'mt-2 text-[12px]')}
                >
                  <PlusIcon className="h-3.5 w-3.5" /> Ajouter
                </button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
