import { Notice } from '@diet/ui';
import { type ReactElement, useEffect, useRef } from 'react';
import type { FastingAction } from './useAction';

/** The failure line of one action, under its control, focused when it appears. */
export function ActionError({ action }: { readonly action: FastingAction }): ReactElement | null {
  const box = useRef<HTMLDivElement>(null);
  const { failure, failures } = action;
  useEffect(() => {
    if (failure !== null) box.current?.focus();
  }, [failure, failures]);
  if (failure === null) return null;
  return (
    <div ref={box} tabIndex={-1}>
      <Notice role="alert">
        <p>{failure}</p>
      </Notice>
    </div>
  );
}
