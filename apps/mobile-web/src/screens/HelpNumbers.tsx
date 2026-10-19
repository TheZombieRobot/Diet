import { helpNumbers } from '@diet/core/copy/health';
import { ActionRow, MessageIcon, PhoneIcon } from '@diet/ui';
import type { ReactElement } from 'react';
import { dial } from './dial';

/** A help service as health.ts lists it: a number to call, and perhaps one to text. */
type HelpService = { name: string; number: string } & (
  { text?: undefined } | { text: string; textName: string; textDetail: string }
);

/** The call row, and the text row when the service takes texts. All wording is from health.ts. */
function serviceRows(service: HelpService): ReactElement[] {
  const rows = [
    <li key={dial('tel', service.number)}>
      <ActionRow
        href={dial('tel', service.number)}
        title={service.name}
        detail={service.number}
        badge={<PhoneIcon />}
      />
    </li>,
  ];
  if (service.text !== undefined) {
    rows.push(
      <li key={dial('sms', service.text)}>
        <ActionRow
          href={dial('sms', service.text)}
          title={service.textName}
          detail={service.textDetail}
          badge={<MessageIcon />}
        />
      </li>,
    );
  }
  return rows;
}

/**
 * The New Zealand help numbers as tap-to-call and tap-to-text rows (HS-13), on About and on every
 * storage failure screen. Static copy from health.ts: nothing here depends on the database.
 */
export function HelpNumberList(): ReactElement {
  const { emergency, healthline, alcoholDrugHelpline, needToTalk } = helpNumbers;
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
      {serviceRows(healthline)}
      {serviceRows(alcoholDrugHelpline)}
      {serviceRows(needToTalk)}
    </ul>
  );
}
