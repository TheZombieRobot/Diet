import { ActionRow, Button, Card, ChevronIcon, InstallIcon } from '@diet/ui';
import type { ReactElement } from 'react';
import { installStore, promptInstall } from '../pwa/install';
import { routeHref } from '../routes';
import { useStore } from '../store';
import { BackupCard } from './backup/BackupCard';
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
          If the app is already on your home screen, open it from there. Otherwise use the browser
          menu and choose Install app.
        </p>
      )}
    </Card>
  );
}

export function SettingsScreen(): ReactElement {
  return (
    <>
      <InstallCard />
      <BackupCard />
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
      <Placeholder coming="Settings for the profile, eating schedule, targets, household, store and pairing arrive with the steps that use them." />
    </>
  );
}
