import { onboarding } from '@diet/core/copy/health';
import { Button } from '@diet/ui';
import { type ReactElement, useMemo, useState } from 'react';
import type { AppStorage } from '../../db/runtime';
import { ExportPanel } from '../../screens/backup/ExportPanel';
import { RestorePanel } from '../../screens/backup/RestorePanel';
import { type FlowFrame, FlowStepFrame } from '../FlowFrame';
import { restoreReloadTarget } from '../navigation';

/**
 * Restore during setup (C53; storage spec section 10.6), reachable only after the notice. It
 * reuses the restore panel; the file replaces everything entered during setup, and the reload
 * lands on Settings, Readiness answers (or back in setup, when the file needs it).
 */
export function RestoreInFlow({
  frame,
  storage,
  onBack,
}: {
  readonly frame: FlowFrame;
  readonly storage: AppStorage;
  readonly onBack: () => void;
}): ReactElement {
  const [exportOpen, setExportOpen] = useState(false);
  const inFlow = useMemo<AppStorage>(
    () => ({
      ...storage,
      platform: {
        ...storage.platform,
        // A change of the hash alone does not load the page again, so the address is replaced
        // first and the page then reloaded.
        reload: () => {
          window.history.replaceState(null, '', restoreReloadTarget(window.location));
          window.location.reload();
        },
      },
    }),
    [storage],
  );
  return (
    <FlowStepFrame
      frame={frame}
      heading={onboarding.frame.restoreTitle}
      footer={
        <Button variant="quiet" onClick={onBack}>
          {onboarding.frame.backToSetup}
        </Button>
      }
    >
      <p>{onboarding.frame.restoreIntro}</p>
      <RestorePanel
        storage={inFlow}
        onExportFirst={() => {
          setExportOpen(true);
        }}
        onCancel={onBack}
      />
      {exportOpen ? (
        <ExportPanel
          storage={storage}
          onDone={() => {
            setExportOpen(false);
          }}
        />
      ) : null}
    </FlowStepFrame>
  );
}
