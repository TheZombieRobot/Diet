/**
 * The QR readers for the Laptop pairing screen (checklist item 30 design 1.5; C83). The browser's
 * own BarcodeDetector when it reads QR codes, otherwise the bundled jsQR decoder, which is loaded
 * only then, as its own chunk that the service worker keeps for offline use. This is the only file
 * that may load jsqr (scan rule qr-decoder-import).
 *
 * On Android, Chrome's BarcodeDetector comes from Google Play services and was not audited; jsQR
 * is the audited path, and the owner is asked at the item-35 STOP whether to use only it
 * (PREFER_BUNDLED_DECODER). Every stop releases the reader: the canvas is cleared and shrunk to
 * 0×0, and no frame or jsQR result is kept beyond one call.
 */
import type jsQR from 'jsqr';

export type JsQr = typeof jsQR;

export interface QrDecoder {
  readonly kind: 'native' | 'bundled';
  /** Every QR text found in the video's current frame; [] when the frame is not ready or holds none. */
  detect(video: HTMLVideoElement): Promise<readonly string[]>;
  /** Clears and shrinks the canvas to 0×0 and drops the decoder's references. Safe to call twice. */
  release(): void;
}

interface DetectedBarcode {
  readonly rawValue: unknown;
}

interface BarcodeDetectorLike {
  detect(source: HTMLVideoElement): Promise<readonly DetectedBarcode[]>;
}

/** The browser's BarcodeDetector, which TypeScript's DOM lib does not declare. */
export interface BarcodeDetectorClass {
  new (options: { formats: string[] }): BarcodeDetectorLike;
  getSupportedFormats(): Promise<readonly string[]>;
}

export interface DecoderEnv {
  /** Read from globalThis when not given; undefined means the browser has none. */
  readonly BarcodeDetector: BarcodeDetectorClass | undefined;
  readonly loadJsQr: () => Promise<JsQr>;
  readonly createCanvas: () => HTMLCanvasElement;
  readonly preferBundled: boolean;
}

/** The owner's choice at the item-35 STOP (P52): true skips the browser's own reader. */
export const PREFER_BUNDLED_DECODER = false;
/** The longest side of a frame handed to jsQR. */
export const MAX_DECODE_SIDE = 800;
/** HTMLMediaElement.HAVE_CURRENT_DATA: a frame can be drawn. */
const HAVE_CURRENT_DATA = 2;

/** The one dynamic import of the bundled decoder; exported so tests load it the same way. */
export const loadBundledJsQr = (): Promise<JsQr> =>
  import('jsqr').then((module) => {
    // CommonJS interop differs between bundlers; jsQR also hangs itself on its own `default`.
    const loaded = module.default as JsQr & { readonly default?: JsQr };
    return loaded.default ?? loaded;
  });

/** The size a frame is drawn at: scaled down (never up) to at most `max` on its longer side. */
export function frameSize(
  width: number,
  height: number,
  max = MAX_DECODE_SIDE,
): { width: number; height: number } | null {
  if (!(Number.isFinite(width) && Number.isFinite(height) && width > 0 && height > 0)) return null;
  const scale = Math.min(1, max / Math.max(width, height));
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
}

/** The text of a QR code in RGBA pixels, or null. Only the text is kept from jsQR's result. */
export function decodeRgba(
  read: JsQr,
  data: Uint8ClampedArray,
  width: number,
  height: number,
): string | null {
  return read(data, width, height, { inversionAttempts: 'dontInvert' })?.data ?? null;
}

const browserDetector = (): BarcodeDetectorClass | undefined => {
  const detector = (globalThis as { BarcodeDetector?: unknown }).BarcodeDetector;
  return typeof detector === 'function' ? (detector as BarcodeDetectorClass) : undefined;
};

async function readsQr(Detector: BarcodeDetectorClass): Promise<boolean> {
  try {
    return (await Detector.getSupportedFormats()).includes('qr_code');
  } catch {
    return false;
  }
}

function nativeDecoder(Detector: BarcodeDetectorClass): QrDecoder | null {
  let detector: BarcodeDetectorLike | null;
  try {
    detector = new Detector({ formats: ['qr_code'] });
  } catch {
    return null;
  }
  return {
    kind: 'native',
    detect: async (video) => {
      if (detector === null) return [];
      try {
        const found = await detector.detect(video);
        return found.map((b) => b.rawValue).filter((v): v is string => typeof v === 'string');
      } catch {
        return [];
      }
    },
    release: () => {
      detector = null;
    },
  };
}

async function bundledDecoder(
  loadJsQr: () => Promise<JsQr>,
  createCanvas: () => HTMLCanvasElement,
): Promise<QrDecoder | null> {
  let read: JsQr | null;
  try {
    read = await loadJsQr();
  } catch {
    return null;
  }
  let canvas: HTMLCanvasElement | null = createCanvas();
  let context = canvas.getContext('2d', { willReadFrequently: true });
  if (context === null) return null;
  return {
    kind: 'bundled',
    detect: (video) => {
      if (read === null || canvas === null || context === null) return Promise.resolve([]);
      const size = frameSize(video.videoWidth, video.videoHeight);
      if (video.readyState < HAVE_CURRENT_DATA || size === null) return Promise.resolve([]);
      if (canvas.width !== size.width) canvas.width = size.width;
      if (canvas.height !== size.height) canvas.height = size.height;
      context.drawImage(video, 0, 0, size.width, size.height);
      const pixels = context.getImageData(0, 0, size.width, size.height);
      const text = decodeRgba(read, pixels.data, size.width, size.height);
      return Promise.resolve(text === null ? [] : [text]);
    },
    release: () => {
      if (canvas !== null) {
        context?.clearRect(0, 0, canvas.width, canvas.height);
        canvas.width = 0;
        canvas.height = 0;
      }
      canvas = null;
      context = null;
      read = null;
    },
  };
}

/**
 * The reader for this browser: the native one unless `preferBundled`, when it reads QR codes;
 * otherwise the bundled one; null when neither can start (the import or the canvas failed).
 */
export async function createQrDecoder(env: Partial<DecoderEnv> = {}): Promise<QrDecoder | null> {
  const Detector = 'BarcodeDetector' in env ? env.BarcodeDetector : browserDetector();
  const preferBundled = env.preferBundled ?? PREFER_BUNDLED_DECODER;
  if (!preferBundled && Detector !== undefined && (await readsQr(Detector))) {
    const native = nativeDecoder(Detector);
    if (native !== null) return native;
  }
  return bundledDecoder(
    env.loadJsQr ?? loadBundledJsQr,
    env.createCanvas ?? (() => document.createElement('canvas')),
  );
}
