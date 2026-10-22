import { foodLog } from '@diet/core/copy/health';
import { TextField } from '@diet/ui';
import type { ReactElement, Ref } from 'react';
import type { LogContext } from './logContext';

const copy = foodLog;

/**
 * The time field of the food log's forms. A file of its own because Today's water card shares it:
 * the rest of Add food then stays in the food log's lazily loaded chunk (code split).
 */
export function TimeField({
  ctx,
  value,
  onChange,
  error,
  label = copy.amount.time,
  hint,
  fieldRef,
}: {
  readonly ctx: Pick<LogContext, 'date' | 'today'>;
  readonly value: string;
  readonly onChange: (v: string) => void;
  readonly error: string | null;
  readonly label?: string;
  /** Left out: the hints for food eaten; null: none (water today). */
  readonly hint?: string | null;
  readonly fieldRef?: Ref<HTMLInputElement>;
}): ReactElement {
  return (
    <TextField
      ref={fieldRef}
      type="time"
      label={label}
      hint={
        hint === null
          ? undefined
          : (hint ??
            (ctx.date === ctx.today ? copy.amount.timeHintToday : copy.amount.timeHintPast))
      }
      autoComplete="off"
      value={value}
      error={error ?? undefined}
      onChange={(e) => {
        onChange(e.currentTarget.value);
      }}
    />
  );
}
