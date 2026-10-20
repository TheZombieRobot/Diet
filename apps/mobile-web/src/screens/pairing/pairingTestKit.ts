/**
 * Fakes for the Laptop pairing tests only (item 30 design 1.4.8): a camera that hands out streams
 * whose tracks record stop(), and the real bundled reader built over a fake canvas and a fake jsQR
 * that "sees" whatever text the test puts in front of the camera. jsdom has no camera, no
 * BarcodeDetector and no video frames.
 */
import { vi } from 'vitest';
import type { PairingDevices } from './devices';
import { createQrDecoder, type JsQr, type QrDecoder } from './qrDecoders';

export interface FakeTrack {
  readyState: 'live' | 'ended';
  readonly stop: () => void;
  readonly addEventListener: (type: string, listener: () => void) => void;
  readonly removeEventListener: (type: string, listener: () => void) => void;
  /** The browser ending the track (another app took the camera). */
  readonly end: () => void;
}

export function fakeStream(): { readonly stream: MediaStream; readonly track: FakeTrack } {
  const listeners = new Set<() => void>();
  const track: FakeTrack = {
    readyState: 'live',
    stop: vi.fn(() => {
      track.readyState = 'ended';
    }),
    addEventListener: (type, listener) => {
      if (type === 'ended') listeners.add(listener);
    },
    removeEventListener: (_type, listener) => {
      listeners.delete(listener);
    },
    end: () => {
      track.readyState = 'ended';
      for (const listener of [...listeners]) listener();
    },
  };
  const stream = { getTracks: () => [track], getVideoTracks: () => [track] };
  return { stream: stream as unknown as MediaStream, track };
}

export interface FakeCanvas {
  width: number;
  height: number;
}

export interface FakeDevices extends PairingDevices {
  /** Every track handed out, in order. */
  readonly tracks: FakeTrack[];
  readonly canvases: FakeCanvas[];
  readonly getUserMedia: ReturnType<typeof vi.fn>;
  /** The text in front of the camera; null for none. */
  seen: string | null;
  reloads: number;
}

export interface FakeDeviceOptions {
  /** What getUserMedia does: give a stream (the default), or refuse with an error. */
  readonly camera?: 'ok' | Error;
  /** No reader at all (the jsQR import failed). */
  readonly noReader?: boolean;
  /** Holds getUserMedia's answer until the returned function is called. */
  readonly holdCamera?: boolean;
  readonly relayOrigin?: string | null;
}

/** Devices for the screen tests, and a function that lets a held camera answer. */
export function fakeDevices(options: FakeDeviceOptions = {}): {
  devices: FakeDevices;
  releaseCamera: () => void;
} {
  let release: () => void = () => undefined;
  const devices: FakeDevices = {
    tracks: [],
    canvases: [],
    seen: null,
    reloads: 0,
    getUserMedia: vi.fn(() => {
      const answer = (): Promise<MediaStream> => {
        if (options.camera instanceof Error) return Promise.reject(options.camera);
        const { stream, track } = fakeStream();
        devices.tracks.push(track);
        return Promise.resolve(stream);
      };
      if (options.holdCamera !== true) return answer();
      return new Promise<MediaStream>((resolve, reject) => {
        release = () => {
          answer().then(resolve, reject);
        };
      });
    }),
    media: () => ({ getUserMedia: devices.getUserMedia as MediaDevices['getUserMedia'] }),
    createDecoder: (): Promise<QrDecoder | null> => {
      const fakeJsQr = ((): { data: string } | null =>
        devices.seen === null ? null : { data: devices.seen }) as unknown as JsQr;
      return createQrDecoder({
        BarcodeDetector: undefined,
        loadJsQr: () =>
          options.noReader === true
            ? Promise.reject(new Error('no reader'))
            : Promise.resolve(fakeJsQr),
        createCanvas: () => {
          const canvas: FakeCanvas & { getContext: () => unknown } = {
            width: 300,
            height: 150,
            getContext: () => ({
              drawImage: () => undefined,
              getImageData: (_x: number, _y: number, w: number, h: number) => ({
                data: new Uint8ClampedArray(w * h * 4),
              }),
              clearRect: () => undefined,
            }),
          };
          devices.canvases.push(canvas);
          return canvas as unknown as HTMLCanvasElement;
        },
      });
    },
    reload: () => {
      devices.reloads += 1;
    },
    siteName: () => 'example.test',
    relayOrigin: () => options.relayOrigin ?? null,
  };
  return {
    devices,
    releaseCamera: () => {
      release();
    },
  };
}
