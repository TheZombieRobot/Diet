import { about, general, helpNumbers } from '@diet/core/copy/health';
import { Card } from '@diet/ui';
import type { ReactElement } from 'react';
import { offlineCopyStore, type OfflineCopy } from '../pwa/offline';
import { storageStore } from '../pwa/storage';
import { useStore } from '../store';
import { versionLabel } from '../version';
import { HelpNumberList } from './HelpNumbers';
import { storageStatusText } from './backup/storageStatus';

const OFFLINE_COPY_TEXT: Readonly<Record<OfflineCopy, string>> = {
  saving: 'Still saving the offline copy',
  ready: 'Ready to use offline',
  unavailable: 'This browser could not save an offline copy',
};

/**
 * HS-13 (About portion): not a medical device, the help numbers, privacy (with the shared-origin
 * caveat, C34), what the food-figure badges mean, and the version. It reads nothing from the
 * records, so it shows the same whether they open, are closed or failed.
 */
export function AboutScreen(): ReactElement {
  const storage = useStore(storageStore);
  const offlineCopy = useStore(offlineCopyStore);
  return (
    <>
      <Card label="About this app">
        <p className="ui-text-lead">{general.about}</p>
      </Card>

      <Card label="Help numbers">
        <p className="ui-text-muted">{helpNumbers.intro}</p>
        <HelpNumberList />
      </Card>

      <Card label="Privacy">
        <p>{general.privacy}</p>
        <p>{about.sharedOrigin}</p>
      </Card>

      {/* No database is named until item 18 records the food data's licence (C97, NU-09). */}
      <Card label="Data sources">
        <p>{about.dataSources.intro}</p>
        <ul className="ui-plain-list">
          {about.dataSources.badges.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
        <p className="ui-text-muted">{about.dataSources.now}</p>
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
              {storageStatusText(storage)}
            </dd>
          </div>
        </dl>
      </Card>
    </>
  );
}
