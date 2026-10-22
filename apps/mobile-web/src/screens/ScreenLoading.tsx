import { onboarding, privacy } from '@diet/core/copy/health';
import { Button, Card } from '@diet/ui';
import type { ReactElement } from 'react';
import { SafetyBlock } from '../onboarding/OpeningScreen';

/**
 * While a screen's code arrives (code split; lazyScreen.ts): the app's waiting line, as setup's
 * opening screen shows it, under the top bar. The top bar's heading is drawn with it, so focus
 * moves to the new screen's heading at once and stays there when the screen arrives.
 */
export function ScreenLoading(): ReactElement {
  return (
    <p role="status" className="ui-text-muted" data-testid="screen-loading">
      {onboarding.frame.opening}
    </p>
  );
}

const reload = (): void => {
  window.location.reload();
};

/**
 * In place of a screen whose code could not be fetched (an old page after an update, say): Reload,
 * and the help numbers, which are in the first chunks, as the storage failure screens show them.
 */
export function ScreenLoadFailed(): ReactElement {
  return (
    <>
      <Card label={privacy.storageFailure.cardLabel}>
        <p className="ui-text-lead" data-testid="screen-load-failed">
          This screen could not be opened. Reload the app to try again. Nothing has been changed.
        </p>
        <Button variant="primary" block onClick={reload}>
          {privacy.storageFailure.reload}
        </Button>
      </Card>
      <SafetyBlock />
    </>
  );
}
