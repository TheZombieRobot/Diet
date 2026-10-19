import { Banner, Button } from '@diet/ui';
import type { ReactElement } from 'react';
import { applyUpdate, updateStore } from '../pwa/update';
import { useStore } from '../store';

/** PWA-05: shown on every screen when a new version is waiting. */
export function UpdateBanner(): ReactElement | null {
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
      <p>Reload to start the new version. Your records stay on this phone.</p>
    </Banner>
  );
}
