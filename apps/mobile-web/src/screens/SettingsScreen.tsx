import { fillTemplate } from '@diet/core';
import {
  onboarding,
  profile,
  readiness,
  schedule,
  targets,
  transfer,
} from '@diet/core/copy/health';
import { ActionRow, Button, Card, ChevronIcon, InstallIcon } from '@diet/ui';
import type { ReactElement } from 'react';
import { installStore, promptInstall } from '../pwa/install';
import { appStorageStore } from '../db/runtime';
import { formatLocalDate } from '../format';
import { routeHref } from '../routes';
import { useStore } from '../store';
import { BackupCard } from './backup/BackupCard';
import { usePairing } from './pairing/usePairing';
import { Placeholder } from './Placeholder';
import { WeightCheckInSettings } from './weight/WeightCheckInSettings';

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

/** The setup answers, the profile and the eating schedule (item 13; RD-06). */
function SetupCard(): ReactElement {
  const rows = [
    { route: 'readiness', row: readiness.settingsRow },
    { route: 'profile', row: profile.settingsRow },
    { route: 'eating-schedule', row: schedule.settingsRow },
  ] as const;
  return (
    <Card label={onboarding.settingsCardLabel}>
      <ul className="ui-action-list">
        {rows.map(({ route, row }) => (
          <li key={route}>
            <ActionRow
              href={routeHref(route)}
              title={row.title}
              detail={row.detail}
              badge={<ChevronIcon />}
            />
          </li>
        ))}
      </ul>
    </Card>
  );
}

/** The Laptop pairing row, with whether this phone is paired (item 30 design 1.3). */
function LaptopCard(): ReactElement {
  const copy = transfer.pairing;
  const storage = useStore(appStorageStore);
  const pairing = usePairing();
  const detail =
    storage === null || pairing === undefined
      ? copy.settingsRowChecking
      : pairing === null
        ? copy.settingsRowNotPaired
        : fillTemplate(copy.settingsRowPaired, {
            date: formatLocalDate(pairing.pairedAt, storage.env.timeZone()),
          });
  return (
    <Card label={copy.settingsCardLabel}>
      <ul className="ui-action-list">
        <li>
          <ActionRow
            href={routeHref('pairing')}
            title={copy.settingsRowTitle}
            detail={detail}
            badge={<ChevronIcon />}
          />
        </li>
      </ul>
    </Card>
  );
}

export function SettingsScreen(): ReactElement {
  return (
    <>
      <InstallCard />
      <SetupCard />
      <LaptopCard />
      <BackupCard />
      <WeightCheckInSettings />
      <Card label="More">
        <ul className="ui-action-list">
          {/* Item 21: diet mode and the targets (UX 7). */}
          <li>
            <ActionRow
              href={routeHref('targets')}
              title={targets.settingsRow.title}
              detail={targets.settingsRow.detail}
              badge={<ChevronIcon />}
            />
          </li>
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
      <Placeholder coming="Settings for the store arrive with the steps that use them." />
    </>
  );
}
