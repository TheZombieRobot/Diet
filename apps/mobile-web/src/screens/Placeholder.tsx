import { Card } from '@diet/ui';
import type { ReactElement } from 'react';

export interface PlaceholderProps {
  /** What the screen will hold once it is built. */
  coming: string;
}

/**
 * An honest stand-in for a screen that a later checklist step builds. It shows no sample data:
 * nothing here may look like a real record, number or price.
 */
export function Placeholder({ coming }: PlaceholderProps): ReactElement {
  return (
    <Card label="Not built yet">
      <p className="ui-text-lead">This screen arrives at a later step of the build checklist.</p>
      <p>{coming}</p>
      <p className="ui-text-muted">Nothing is recorded here yet.</p>
    </Card>
  );
}
