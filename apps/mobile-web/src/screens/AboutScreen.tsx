import { general, helpNumbers } from '@diet/core/copy/health';
import { ActionRow, Card, MessageIcon, PhoneIcon } from '@diet/ui';
import type { ReactElement } from 'react';
import { offlineCopyStore, type OfflineCopy } from '../pwa/offline';
import { storageStore, type StorageProtection } from '../pwa/storage';
import { useStore } from '../store';
import { versionLabel } from '../version';

/** A tap-to-call (or text) address for a number written with spaces. */
const dial = (scheme: 'tel' | 'sms', number: string): string =>
  `${scheme}:${number.replace(/\s/g, '')}`;

const STORAGE_TEXT: Readonly<Record<StorageProtection, string>> = {
  checking: 'Checking…',
  protected: 'Protected: the browser keeps the app’s records even when space runs low.',
  'not-protected':
    'Not protected yet: the browser may clear the app’s records if space runs low. Installing the app usually changes this.',
  unsupported: 'This browser cannot protect the app’s records from being cleared.',
};

const OFFLINE_COPY_TEXT: Readonly<Record<OfflineCopy, string>> = {
  saving: 'Still saving the offline copy',
  ready: 'Ready to use offline',
  unavailable: 'This browser could not save an offline copy',
};

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

/** HS-13 (About portion): not a medical device, the help numbers, privacy, sources and version. */
export function AboutScreen(): ReactElement {
  const storage = useStore(storageStore);
  const offlineCopy = useStore(offlineCopyStore);
  const { intro, emergency, healthline, alcoholDrugHelpline, needToTalk } = helpNumbers;
  return (
    <>
      <Card label="About this app">
        <p className="ui-text-lead">{general.about}</p>
      </Card>

      <Card label="Help numbers">
        <p className="ui-text-muted">{intro}</p>
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
      </Card>

      <Card label="Privacy">
        <p>{general.privacy}</p>
      </Card>

      <Card label="Data sources">
        <p>
          Food data sources and their attribution are listed here once the ingredient data is added,
          at a later step of the build checklist.
        </p>
      </Card>

      <Card label="This copy of the app">
        <dl className="ui-facts">
          <div>
            <dt className="ui-facts__term">Version</dt>
            <dd className="ui-facts__value" data-testid="app-version">
              {versionLabel()}
            </dd>
          </div>
          <div>
            <dt className="ui-facts__term">Offline copy</dt>
            <dd className="ui-facts__value" data-testid="offline-copy">
              {OFFLINE_COPY_TEXT[offlineCopy]}
            </dd>
          </div>
          <div>
            <dt className="ui-facts__term">Storage on this device</dt>
            <dd className="ui-facts__value" data-testid="storage-protection">
              {STORAGE_TEXT[storage]}
            </dd>
          </div>
        </dl>
      </Card>
    </>
  );
}
