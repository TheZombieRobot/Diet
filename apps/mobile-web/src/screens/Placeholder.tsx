import { Card } from '@diet/ui';
import type { ReactElement } from 'react';

export interface PlaceholderProps {
  /** What the screen will hold once it is built. */
  coming: string;
  /**
   * Part of the screen is built already (item 19: Food links to the garden and pantry), so the
   * card says more of the screen arrives later and leaves out "Nothing is recorded here yet."
   */
  partial?: boolean;
}

/**
 * An honest stand-in for a screen that a later checklist step builds. It shows no sample data:
 * nothing here may look like a real record, number or price.
 */
export function Placeholder({ coming, partial = false }: PlaceholderProps): ReactElement {
  return (
    <Card label="Not built yet">
      <p className="ui-text-lead">
        {partial
          ? 'More of this screen arrives at a later step of the build checklist.'
          : 'This screen arrives at a later step of the build checklist.'}
      </p>
      <p>{coming}</p>
      {partial ? null : <p className="ui-text-muted">Nothing is recorded here yet.</p>}
    </Card>
  );
}
