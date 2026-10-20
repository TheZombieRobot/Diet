import { Notice } from '@diet/ui';
import { type ReactElement, useEffect, useRef } from 'react';
import type { FastingAction } from './useAction';

/** A failure line under its control, focused when it appears (design 3.9). */
function FocusedAlert({
  message,
  focusKey,
}: {
  readonly message: string;
  readonly focusKey: unknown;
}): ReactElement {
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    box.current?.focus();
  }, [message, focusKey]);
  return (
    <div ref={box} tabIndex={-1}>
      <Notice role="alert">
        <p>{message}</p>
      </Notice>
    </div>
  );
}

/** The failure line of one action, under its control, focused when it appears. */
export function ActionError({ action }: { readonly action: FastingAction }): ReactElement | null {
  const { failure, failures } = action;
  if (failure === null) return null;
  return <FocusedAlert message={failure} focusKey={failures} />;
}

/** A form's own check (a time after now, an end before the start) above its Save, focused too. */
export function ProblemNotice({
  problem,
}: {
  readonly problem: string | null;
}): ReactElement | null {
  if (problem === null) return null;
  return <FocusedAlert message={problem} focusKey={null} />;
}
