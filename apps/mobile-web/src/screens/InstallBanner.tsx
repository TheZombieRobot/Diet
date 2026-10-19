import { Banner, Button } from '@diet/ui';
import type { ReactElement } from 'react';
import { installBannerDismissedStore, installStore, promptInstall } from '../pwa/install';
import { useStore } from '../store';

/** Offered on Today while Chrome says the app can be installed; "Not now" hides it until restart. */
export function InstallBanner(): ReactElement | null {
  const { canPrompt } = useStore(installStore);
  const dismissed = useStore(installBannerDismissedStore);
  if (!canPrompt || dismissed) return null;
  return (
    <Banner
      tone="neutral"
      title="Install this app"
      actions={
        <>
          <Button variant="primary" onClick={() => void promptInstall()}>
            Install app
          </Button>
          <Button
            variant="quiet"
            onClick={() => {
              installBannerDismissedStore.set(true);
            }}
          >
            Not now
          </Button>
        </>
      }
    >
      <p>Add it to the home screen: it opens like any other app and works offline.</p>
    </Banner>
  );
}
