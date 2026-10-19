import { general, helpNumbers } from '@diet/core/copy/health';
import { ActionRow, Card, MessageIcon, PhoneIcon } from '@diet/ui';
import type { ReactElement } from 'react';
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

/** HS-13 (About portion): not a medical device, the help numbers, data sources and version. */
export function AboutScreen(): ReactElement {
  const storage = useStore(storageStore);
  const { emergency, healthline, alcoholDrugHelpline, needToTalk } = helpNumbers;
  return (
    <>
      <Card label="About this app">
        <p className="ui-text-lead">{general.about}</p>
      </Card>

      <Card label="Help numbers">
        <p className="ui-text-muted">Tap a number to call or text it.</p>
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
          <li>
            <ActionRow
              href={dial('tel', alcoholDrugHelpline.number)}
              title={alcoholDrugHelpline.name}
              detail={alcoholDrugHelpline.number}
              badge={<PhoneIcon />}
            />
          </li>
          <li>
            <ActionRow
              href={dial('sms', alcoholDrugHelpline.text)}
              title="Alcohol Drug Helpline by text"
              detail={`Text ${alcoholDrugHelpline.text}`}
              badge={<MessageIcon />}
            />
          </li>
          <li>
            <ActionRow
              href={dial('tel', needToTalk.number)}
              title={needToTalk.name}
              detail={needToTalk.number}
              badge={<PhoneIcon />}
            />
          </li>
        </ul>
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
