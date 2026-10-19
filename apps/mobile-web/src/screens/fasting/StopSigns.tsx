import { fasting } from '@diet/core/copy/health';
import { Card } from '@diet/ui';
import type { ReactElement } from 'react';
import { HelpRows } from './HelpRows';

/** The stop-signs on the Fasting screen (HEALTH_SAFETY.md section 3; FS-04). */
export function StopSignsCard(): ReactElement {
  const copy = fasting.stopSigns;
  return (
    <Card label={copy.label}>
      <p>{copy.intro}</p>
      <ul className="ui-plain-list">
        {copy.signs.map((sign) => (
          <li key={sign}>{sign}</li>
        ))}
      </ul>
      <StopSignsRow />
    </Card>
  );
}

/** The action sentence and the call rows: on the stop-signs card, and on Today past 24 hours. */
export function StopSignsRow(): ReactElement {
  return (
    <>
      <p className="ui-text-strong">{fasting.stopSigns.action}</p>
      <HelpRows />
    </>
  );
}
