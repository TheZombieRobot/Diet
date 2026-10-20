import { fillTemplate, type Id, RATING_FIELDS, type RatingField } from '@diet/core';
import { move, moveScreen } from '@diet/core/copy/health';
import { ChoiceList } from '@diet/ui';
import type { ReactElement } from 'react';

const OPTIONS = ['1', '2', '3', '4', '5'].map((value) => ({ value, label: value }));

/**
 * Effort, soreness and energy, 1 to 5 (UX 4c), as item 13's inline radio groups (ruling 7). Each
 * stays optional until chosen; once chosen it can be changed but not cleared (N9), and a second
 * tap on the chosen value does nothing. The names carry the row id, so two sessions' groups on
 * one screen never share a radio group.
 */
export function RatingGroups({
  rowId,
  values,
  onRate,
  disabled,
}: {
  readonly rowId: Id;
  readonly values: Readonly<Record<RatingField, number | null>>;
  readonly onRate: (field: RatingField, value: number) => void;
  readonly disabled: boolean;
}): ReactElement {
  return (
    <>
      {RATING_FIELDS.map((field) => {
        const words = move.finish[field];
        const current = values[field];
        return (
          <ChoiceList
            key={field}
            layout="inline"
            legend={words.label}
            hint={fillTemplate(moveScreen.finish.scale, { low: words.low, high: words.high })}
            name={`rating-${field}-${rowId}`}
            options={OPTIONS}
            value={current === null ? null : String(current)}
            disabled={disabled}
            onChange={(value) => {
              const n = Number(value);
              if (n !== current) onRate(field, n);
            }}
          />
        );
      })}
    </>
  );
}
