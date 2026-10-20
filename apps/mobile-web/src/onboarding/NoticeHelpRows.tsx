import { alcohol, helpNumbers } from '@diet/core/copy/health';
import { ActionRow, MessageIcon, PhoneIcon } from '@diet/ui';
import type { ReactElement } from 'react';

/** A tap-to-call (or text) address for a number written with spaces. */
const dial = (scheme: 'tel' | 'sms', number: string): string =>
  `${scheme}:${number.replace(/\s/g, '')}`;

/**
 * The three help rows of the alcohol safety note and the "talk to someone" card (UX 1b; mock-up
 * Notice; E34): call the helpline, text it, and emergency. Red only on the emergency row, whose
 * detail repeats the reasons to call 111 given by the text above it: the notice's by default, the
 * card's on the card (full review F37).
 */
export function NoticeHelpRows({
  emergencyDetail = alcohol.notice.emergencyDetail,
}: {
  readonly emergencyDetail?: string;
} = {}): ReactElement {
  const { alcoholDrugHelpline, emergency } = helpNumbers;
  return (
    <ul className="ui-action-list">
      <li>
        <ActionRow
          href={dial('tel', alcoholDrugHelpline.number)}
          title={alcohol.notice.helplineTitle}
          detail={alcohol.notice.helplineDetail}
          badge={<PhoneIcon />}
        />
      </li>
      <li>
        <ActionRow
          href={dial('sms', alcoholDrugHelpline.text)}
          title={alcoholDrugHelpline.textName}
          detail={alcoholDrugHelpline.textDetail}
          badge={<MessageIcon />}
        />
      </li>
      <li>
        <ActionRow
          tone="emergency"
          href={dial('tel', emergency.number)}
          title={alcohol.notice.emergencyTitle}
          detail={emergencyDetail}
          badge={emergency.number}
        />
      </li>
    </ul>
  );
}
