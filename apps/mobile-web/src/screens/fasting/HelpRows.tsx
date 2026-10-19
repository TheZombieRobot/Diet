import { helpNumbers } from '@diet/core/copy/health';
import { ActionRow, PhoneIcon } from '@diet/ui';
import type { ReactElement } from 'react';
import { dial } from '../dial';

/**
 * Emergency 111 and Healthline as tap-to-call rows, for the fasting stop-signs, the reflux
 * chest-pain line and the read-failure card (HS-13; FS-04). Red only on the 111 row.
 */
export function HelpRows(): ReactElement {
  const { emergency, healthline } = helpNumbers;
  return (
    <ul className="ui-action-list">
      <li>
        <ActionRow
          tone="emergency"
          href={dial('tel', emergency.number)}
          title={emergency.name}
          detail={emergency.number}
          badge={emergency.number}
        />
      </li>
      <li>
        <ActionRow
          href={dial('tel', healthline.number)}
          title={healthline.name}
          detail={healthline.number}
          badge={<PhoneIcon />}
        />
      </li>
    </ul>
  );
}
