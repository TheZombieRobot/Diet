/**
 * The browser features the Laptop pairing screen uses (checklist item 30 design 1.4.8), injectable
 * for tests as appStorageStore is: nothing else in the screen touches navigator, BarcodeDetector or
 * location.
 */
import { RELAY_ORIGIN } from '@diet/core';
import { reloadApplyingUpdate } from '../../pwa/update';
import { createStore, type Store } from '../../store';
import { createQrDecoder, type QrDecoder } from './qrDecoders';

export interface PairingDevices {
  /** navigator.mediaDevices, or undefined where the browser has none (an insecure page). */
  readonly media: () => Pick<MediaDevices, 'getUserMedia'> | undefined;
  /** The QR reader for this browser. */
  readonly createDecoder: () => Promise<QrDecoder | null>;
  /** Reloads on this screen, applying a waiting update first. */
  readonly reload: () => void;
  /** The site name Chrome lists under Site settings, Camera. */
  readonly siteName: () => string;
  /** The relay address this build sends to (item 31 switches it to its BUILD_RELAY_ORIGIN). */
  readonly relayOrigin: () => string | null;
}

export const browserPairingDevices: PairingDevices = {
  // Undefined at run time on a page that is not a secure context.
  media: () => navigator.mediaDevices,
  createDecoder: () => createQrDecoder(),
  reload: reloadApplyingUpdate,
  siteName: () => window.location.host,
  relayOrigin: () => RELAY_ORIGIN,
};

export const pairingDevicesStore: Store<PairingDevices> = createStore(browserPairingDevices);
