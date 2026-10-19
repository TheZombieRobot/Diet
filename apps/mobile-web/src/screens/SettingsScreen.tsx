import { ActionRow, Button, Card, ChevronIcon, InstallIcon } from '@diet/ui';
import type { ReactElement } from 'react';
import { installStore, promptInstall } from '../pwa/install';
import { routeHref } from '../routes';
import { useStore } from '../store';
import { Placeholder } from './Placeholder';

function InstallCard(): ReactElement {
  const { canPrompt, installed } = useStore(installStore);
  return (
    <Card label="Install">
      {installed ? (
        <p>The app is installed on this device.</p>
      ) : canPrompt ? (
        <>
          <p>
            Install the app to open it from the home screen like any other app. It works offline.
          </p>
          <Button variant="primary" block onClick={() => void promptInstall()}>
            <InstallIcon />
            Install app
          </Button>
        </>
      ) : (
        <p>
          To install, open the browser menu and choose Install app or Add to Home screen. Chrome
          offers this once the app has fully loaded.
        </p>
      )}
    </Card>
  );
}

export function SettingsScreen(): ReactElement {
  return (
    <>
      <InstallCard />
      <Card label="More">
        <ul className="ui-action-list">
          <li>
            <ActionRow
              href={routeHref('about')}
              title="About this app"
              detail="Help numbers, data sources and version"
              badge={<ChevronIcon />}
            />
          </li>
        </ul>
      </Card>
      <Placeholder coming="Settings for the profile, eating schedule, targets, household, store, pairing and backup arrive with the steps that use them." />
    </>
  );
}
