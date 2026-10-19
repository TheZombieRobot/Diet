import { Notice } from '@diet/ui';
import { type ReactElement, useEffect, useRef } from 'react';
import type { Save } from './useSave';

/** A failed write's message, shown where the failed control is, and focused (section 3.15). */
export function SaveError({ save }: { readonly save: Save }): ReactElement | null {
  const box = useRef<HTMLDivElement>(null);
  const { error, failures } = save;
  useEffect(() => {
    if (error !== null) box.current?.focus();
  }, [error, failures]);
  if (error === null) return null;
  return (
    <div ref={box} tabIndex={-1} className="ui-step-start">
      <Notice role="alert">
        <p>{error}</p>
      </Notice>
    </div>
  );
}
