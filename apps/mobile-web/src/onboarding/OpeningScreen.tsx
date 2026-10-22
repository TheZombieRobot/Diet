import { general, onboarding, privacy } from '@diet/core/copy/health';
import { Button, Card } from '@diet/ui';
import { type ReactElement, useEffect, useState } from 'react';
import { HelpNumberList } from '../screens/HelpNumbers';
import { TopBarPill } from '../screens/TopBarPill';

/** How long the neutral waiting screen stays bare before it offers Reload and the help numbers. */
export const OPENING_SLOW_MS = 5000;

const reload = (): void => {
  window.location.reload();
};

/** The not-a-medical-device line and the help numbers, from static copy (HS-13). */
export function SafetyBlock(): ReactElement {
  return (
    <Card label={privacy.storageFailure.helpTitle}>
      <p>{general.about}</p>
      <HelpNumberList />
    </Card>
  );
}

/**
 * While the records open and the first-run guard decides (item 13 design section 3.2; E29, E57):
 * a bare status line with nothing to tap through, under the offline pill (item 37). After 5
 * seconds it adds Reload, the not-a-medical-device line and the help numbers; when the records
 * cannot be read it shows them at once, in the layout of the storage failure screens.
 */
export function OpeningScreen({
  failed = false,
  onReload = reload,
}: {
  readonly failed?: boolean;
  readonly onReload?: () => void;
}): ReactElement {
  const [slow, setSlow] = useState(false);
  useEffect(() => {
    const timer = setTimeout(() => {
      setSlow(true);
    }, OPENING_SLOW_MS);
    return () => {
      clearTimeout(timer);
    };
  }, []);

  if (failed) {
    return (
      <div className="ui-shell">
        <header className="ui-topbar">
          <h1 className="ui-topbar__title">{privacy.storageFailure.title}</h1>
          <TopBarPill />
        </header>
        <main id="main" className="ui-shell__main" tabIndex={-1}>
          <Card label={privacy.storageFailure.cardLabel}>
            <p className="ui-text-lead" data-testid="opening-failed">
              {onboarding.frame.openingFailed}
            </p>
            <Button variant="primary" block onClick={onReload}>
              {privacy.storageFailure.reload}
            </Button>
          </Card>
          <SafetyBlock />
        </main>
      </div>
    );
  }
  return (
    <div className="ui-shell">
      <header className="ui-topbar">
        <TopBarPill />
      </header>
      <main id="main" className="ui-shell__main" tabIndex={-1}>
        <p role="status">{onboarding.frame.opening}</p>
        {slow ? (
          <>
            <p>{onboarding.frame.openingSlow}</p>
            <Button variant="primary" block onClick={onReload}>
              {privacy.storageFailure.reload}
            </Button>
            <SafetyBlock />
          </>
        ) : null}
      </main>
    </div>
  );
}
