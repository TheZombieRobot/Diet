import { Banner, Button } from '@diet/ui';
import type { ReactElement } from 'react';
import { applyUpdate, updateStore } from '../pwa/update';
import { useStore } from '../store';

/**
 * PWA-05: shown on every screen when a new version is waiting. Reload keeps every saved record but
 * not what is typed and not yet saved, so the banner says so; during setup, where a step is saved
 * only by Continue, it says to finish the step first (full review F27).
 */
export function UpdateBanner({
  during = 'app',
}: { readonly during?: 'app' | 'setup' } = {}): ReactElement | null {
  const { waiting, applying } = useStore(updateStore);
  if (!waiting) return null;
  return (
    <Banner
      title="Update available"
      actions={
        <Button variant="primary" disabled={applying} onClick={() => void applyUpdate()}>
          {applying ? 'Reloading' : 'Reload'}
        </Button>
      }
    >
      <p>
        {during === 'setup'
          ? 'Reload after you finish this step. Anything on this step not yet saved with Continue is lost.'
          : 'Reload to start the new version. Your saved records stay on this phone; anything typed and not yet saved is lost.'}
      </p>
    </Banner>
  );
}
