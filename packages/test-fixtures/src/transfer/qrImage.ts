/**
 * QR images drawn at test time (checklist item 30 design 5.5), so no image file is ever committed
 * (C14). Used by the app's decoder tests and the camera browser test, which feeds Chrome's fake
 * capture device a Y4M video. qrcode-generator is a test-only dependency (scan rule
 * qr-generator-test-only); the laptop side panel may use it to draw its code (item 33). The codes
 * are black on white, error correction M, byte mode, as the laptop must draw them.
 */
import qrcode from 'qrcode-generator';

/** The module grid: true for a dark module. */
export function qrModules(text: string): boolean[][] {
  const qr = qrcode(0, 'M');
  qr.addData(text, 'Byte');
  qr.make();
  const size = qr.getModuleCount();
  return Array.from({ length: size }, (_, row) =>
    Array.from({ length: size }, (_, col) => qr.isDark(row, col)),
  );
}

export interface RgbaImage {
  readonly data: Uint8ClampedArray;
  readonly width: number;
  readonly height: number;
}

/** RGBA pixels: dark modules black on white (the reverse with `invert`), with a quiet zone. */
export function qrRgba(
  text: string,
  {
    scale = 6,
    margin = 4,
    invert = false,
  }: { scale?: number; margin?: number; invert?: boolean } = {},
): RgbaImage {
  const modules = qrModules(text);
  const side = (modules.length + 2 * margin) * scale;
  const data = new Uint8ClampedArray(side * side * 4);
  for (let y = 0; y < side; y++) {
    for (let x = 0; x < side; x++) {
      const row = Math.floor(y / scale) - margin;
      const col = Math.floor(x / scale) - margin;
      const dark = modules[row]?.[col] === true;
      const value = dark !== invert ? 0 : 255;
      const at = (y * side + x) * 4;
      data[at] = value;
      data[at + 1] = value;
      data[at + 2] = value;
      data[at + 3] = 255;
    }
  }
  return { data, width: side, height: side };
}

const ascii = (text: string): number[] => Array.from(text, (c) => c.charCodeAt(0));

/** Luma of a dark and a light module in a video frame (video range). */
export const Y4M_DARK = 16;
export const Y4M_LIGHT = 235;

/**
 * A YUV4MPEG2 video of `frames` identical square frames: the code centred at the largest whole
 * module size that leaves a 4-module quiet zone, on a light ground, with neutral chroma.
 */
export function qrY4m(
  text: string,
  { size = 480, frames = 10 }: { size?: number; frames?: number } = {},
): Uint8Array {
  const modules = qrModules(text);
  const unit = Math.floor(size / (modules.length + 8));
  const offset = Math.floor((size - modules.length * unit) / 2);
  const luma = new Uint8Array(size * size).fill(Y4M_LIGHT);
  modules.forEach((line, row) => {
    line.forEach((dark, col) => {
      if (!dark) return;
      for (let dy = 0; dy < unit; dy++) {
        const start = (offset + row * unit + dy) * size + offset + col * unit;
        luma.fill(Y4M_DARK, start, start + unit);
      }
    });
  });
  const chroma = new Uint8Array(2 * (size / 2) * (size / 2)).fill(128);
  const header = ascii(`YUV4MPEG2 W${size} H${size} F10:1 Ip A1:1 C420jpeg\n`);
  const frameHeader = ascii('FRAME\n');
  const frameLength = frameHeader.length + luma.length + chroma.length;
  const out = new Uint8Array(header.length + frames * frameLength);
  out.set(header, 0);
  for (let f = 0; f < frames; f++) {
    const at = header.length + f * frameLength;
    out.set(frameHeader, at);
    out.set(luma, at + frameHeader.length);
    out.set(chroma, at + frameHeader.length + luma.length);
  }
  return out;
}
