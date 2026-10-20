import { Notice } from '@diet/ui';
import type { ReactElement } from 'react';
import type { TodayWrite } from './useWrite';

/** The failure of a Today write, announced at once; focus stays on the control that was used. */
export function WriteError({ write }: { readonly write: TodayWrite }): ReactElement | null {
  if (write.error === null) return null;
  return (
    <Notice role="alert">
      <p>{write.error}</p>
    </Notice>
  );
}
