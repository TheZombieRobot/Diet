/**
 * What the Diet and targets cards share (item 21 design section 2.2): one write state per card,
 * the "stored value differs" hint, the select options and the refusal messages. A notice stays
 * until the next change in its card or until the screen is left; it never times out (T30).
 */
import { fillTemplate, type TargetEditError } from '@diet/core';
import { privacy, targets as copy } from '@diet/core/copy/health';
import { useCallback, useState } from 'react';
import { mapWriteError, StorageClosedError, StorageFullError } from '../../db/errors';
import { formatWhole } from '../../format';

/** The message for a failed write: a full phone, closed records, or the card's own generic line. */
export function writeFailure(error: unknown, generic: string): string {
  const mapped = mapWriteError(error);
  if (mapped instanceof StorageFullError) return privacy.storageFull;
  if (mapped instanceof StorageClosedError) return privacy.backupCard.closed;
  return generic;
}

export type WriteState =
  | { readonly kind: 'idle' }
  | { readonly kind: 'saving' }
  | { readonly kind: 'saved' }
  | { readonly kind: 'failed'; readonly text: string };

export interface CardWrite {
  readonly state: WriteState;
  readonly busy: boolean;
  /** Runs one write; the card's controls are disabled meanwhile. */
  readonly run: (write: () => Promise<unknown>) => void;
  /** Clears "Saved." or a failure: the next change in the card. */
  readonly clear: () => void;
}

export function useCardWrite(failed: string = copy.form.failed): CardWrite {
  const [state, setState] = useState<WriteState>({ kind: 'idle' });
  const run = useCallback(
    (write: () => Promise<unknown>) => {
      setState({ kind: 'saving' });
      write().then(
        () => {
          setState({ kind: 'saved' });
        },
        (error: unknown) => {
          setState({ kind: 'failed', text: writeFailure(error, failed) });
        },
      );
    },
    [failed],
  );
  const clear = useCallback(() => {
    setState({ kind: 'idle' });
  }, []);
  return { state, busy: state.kind === 'saving', run, clear };
}

/** A hint, with the "stored value differs" sentence when the engine uses another value (T34). */
export function hintWith(hint: string, stored: number | null, used: number | null): string {
  if (stored === used || stored === null || used === null) return hint;
  return `${hint} ${fillTemplate(copy.form.storedDiffers, {
    stored: formatWhole(stored),
    used: formatWhole(used),
  })}`;
}

/** The options of a select, with an in-range value in use added in order when it is not one of them. */
export function optionsWith(
  values: readonly number[],
  used: number,
  label: (value: number) => string,
): { value: string; label: string }[] {
  const all = values.includes(used) ? [...values] : [...values, used].sort((a, b) => a - b);
  return all.map((value) => ({ value: String(value), label: label(value) }));
}

/** The message for a refused entry (refuse, never clamp; C50). */
export function editMessage(error: TargetEditError): string {
  switch (error.kind) {
    case 'whole-number':
      return copy.form.wholeNumber;
    case 'range':
      return fillTemplate(copy.form.range, {
        min: formatWhole(error.min),
        max: formatWhole(error.max),
      });
    case 'floor-too-low':
      return copy.energy.floorTooLow;
    case 'floor-too-high':
      return copy.energy.floorTooHigh;
    case 'min-above-max':
      return copy.protein.minAboveMax;
  }
}
