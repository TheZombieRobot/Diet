// The QR readers (item 30 design 1.5; A4; TR-03a, C83, HS-(next)). The bundled reader is the real
// jsQR, loaded the way the app loads it, reading codes drawn at test time.
import { qrRgba, V1_CODE, V1_CODE_NO_RELAY } from '@diet/test-fixtures';
import { describe, expect, it } from 'vitest';
import {
  type BarcodeDetectorClass,
  createQrDecoder,
  decodeRgba,
  frameSize,
  loadBundledJsQr,
  PREFER_BUNDLED_DECODER,
} from './qrDecoders';

describe('the bundled reader (jsQR)', () => {
  it('reads V1 and V1′ drawn black on white, and nothing from a blank or an inverted image', async () => {
    const jsQr = await loadBundledJsQr();
    for (const code of [V1_CODE, V1_CODE_NO_RELAY]) {
      const image = qrRgba(code, { scale: 4 });
      expect(decodeRgba(jsQr, image.data, image.width, image.height)).toBe(code);
    }
    const blank = new Uint8ClampedArray(200 * 200 * 4).fill(255);
    expect(decodeRgba(jsQr, blank, 200, 200)).toBeNull();
    // The laptop must draw black on white: the phone reads without inversion.
    const inverted = qrRgba(V1_CODE, { scale: 4, invert: true });
    expect(decodeRgba(jsQr, inverted.data, inverted.width, inverted.height)).toBeNull();
  });

  it.each([
    [0, 720, null],
    [1280, Number.NaN, null],
    [1280, 720, { width: 800, height: 450 }],
    [640, 480, { width: 640, height: 480 }],
  ])('frameSize(%d, %d) is %j', (width, height, size) => {
    expect(frameSize(width, height)).toEqual(size);
  });
});

/** A BarcodeDetector stand-in reporting `formats`, or refusing to say. */
function detector(
  formats: readonly string[] | 'rejects',
  detect: () => Promise<{ rawValue: unknown }[]> = () => Promise.resolve([]),
): BarcodeDetectorClass {
  return class {
    static getSupportedFormats(): Promise<readonly string[]> {
      return formats === 'rejects' ? Promise.reject(new Error('no')) : Promise.resolve(formats);
    }
    detect = detect;
  };
}

const canvasOf = (context: object | null) => {
  const canvas = { width: 300, height: 150, getContext: () => context };
  return { canvas, create: () => canvas as unknown as HTMLCanvasElement };
};
const fakeContext = { clearRect: () => undefined };
const loadJsQr = loadBundledJsQr;

describe('choosing a reader', () => {
  it('the bundled reader by default: the browser’s own reader is not even asked what it reads', async () => {
    const { create } = canvasOf(fakeContext);
    let asked = 0;
    const Native = class extends detector(['qr_code']) {
      static override getSupportedFormats(): Promise<readonly string[]> {
        asked += 1;
        return super.getSupportedFormats();
      }
    };
    expect(PREFER_BUNDLED_DECODER).toBe(true);
    expect(
      (await createQrDecoder({ BarcodeDetector: Native, loadJsQr, createCanvas: create }))?.kind,
    ).toBe('bundled');
    expect(asked).toBe(0);
    // The owner's other choice at the item-35 STOP.
    expect(
      (
        await createQrDecoder({
          BarcodeDetector: Native,
          loadJsQr,
          createCanvas: create,
          preferBundled: false,
        })
      )?.kind,
    ).toBe('native');
  });

  it.each([
    ['reads no QR codes', detector(['ean_13'])],
    ['will not say what it reads', detector('rejects')],
    ['is missing', undefined],
  ])(
    'with the browser’s reader allowed, the bundled reader when the browser’s %s',
    async (_name, Detector) => {
      const { create } = canvasOf(fakeContext);
      const decoder = await createQrDecoder({
        BarcodeDetector: Detector,
        loadJsQr,
        createCanvas: create,
        preferBundled: false,
      });
      expect(decoder?.kind).toBe('bundled');
    },
  );

  it('no reader when the bundled one cannot load or has no canvas', async () => {
    const failing = () => Promise.reject(new Error('offline'));
    expect(
      await createQrDecoder({
        BarcodeDetector: undefined,
        loadJsQr: failing,
        createCanvas: canvasOf(fakeContext).create,
      }),
    ).toBeNull();
    expect(
      await createQrDecoder({
        BarcodeDetector: undefined,
        loadJsQr,
        createCanvas: canvasOf(null).create,
      }),
    ).toBeNull();
  });

  it('the native reader returns the texts it finds, and nothing when detect fails', async () => {
    const video = document.createElement('video');
    const found = await createQrDecoder({
      BarcodeDetector: detector(['qr_code'], () =>
        Promise.resolve([{ rawValue: V1_CODE }, { rawValue: 7 }]),
      ),
      preferBundled: false,
    });
    expect(await found?.detect(video)).toEqual([V1_CODE]);
    const failing = await createQrDecoder({
      BarcodeDetector: detector(['qr_code'], () => Promise.reject(new Error('busy'))),
      preferBundled: false,
    });
    expect(await failing?.detect(video)).toEqual([]);
  });

  it('release() clears the canvas to 0×0; later reads find nothing; a second release is harmless', async () => {
    const { canvas, create } = canvasOf(fakeContext);
    const decoder = await createQrDecoder({
      BarcodeDetector: undefined,
      loadJsQr,
      createCanvas: create,
    });
    decoder?.release();
    expect([canvas.width, canvas.height]).toEqual([0, 0]);
    expect(await decoder?.detect(document.createElement('video'))).toEqual([]);
    decoder?.release();
  });
});
