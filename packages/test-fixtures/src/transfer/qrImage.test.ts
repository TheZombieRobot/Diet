// The QR test images (item 30 design 5.5). That they decode is proven by the app's decoder test
// (A4), which owns the decoder, so this package needs no QR reader.
import { describe, expect, it } from 'vitest';
import { qrModules, qrRgba, qrY4m, Y4M_DARK, Y4M_LIGHT } from './qrImage';
import { V1_CODE } from './vectors';

describe('QR test images', () => {
  it('V1 is a version-6 code at level M (41 x 41 modules) with its finder corners dark', () => {
    const modules = qrModules(V1_CODE);
    expect(modules).toHaveLength(41);
    expect(modules.every((row) => row.length === 41)).toBe(true);
    for (const [row, col] of [
      [0, 0],
      [0, 40],
      [40, 0],
    ] as const) {
      expect(modules[row]?.[col]).toBe(true);
    }
  });

  it('qrRgba draws black modules on white inside a white quiet zone, and the reverse when inverted', () => {
    const image = qrRgba(V1_CODE, { scale: 2, margin: 4 });
    expect(image.width).toBe((41 + 8) * 2);
    expect(image.data).toHaveLength(image.width * image.height * 4);
    const pixel = (x: number, y: number, data = image.data) => data[(y * image.width + x) * 4];
    expect(pixel(0, 0)).toBe(255);
    expect(pixel(8, 8)).toBe(0);
    expect(pixel(8, 8, qrRgba(V1_CODE, { scale: 2, margin: 4, invert: true }).data)).toBe(255);
  });

  it('qrY4m writes an exact YUV4MPEG2 header and frames, the code dark on a light ground', () => {
    const video = qrY4m(V1_CODE, { size: 480, frames: 3 });
    const header = 'YUV4MPEG2 W480 H480 F10:1 Ip A1:1 C420jpeg\n';
    const frame = 'FRAME\n'.length + 480 * 480 + 2 * 240 * 240;
    expect(video).toHaveLength(header.length + 3 * frame);
    expect(String.fromCharCode(...video.subarray(0, header.length))).toBe(header);
    const luma = (x: number, y: number) => video[header.length + 'FRAME\n'.length + y * 480 + x];
    // 480 / (41 + 8) gives 9-pixel modules, centred: the code starts at pixel 55.
    expect(luma(0, 0)).toBe(Y4M_LIGHT);
    expect(luma(55, 55)).toBe(Y4M_DARK);
    expect(luma(54, 54)).toBe(Y4M_LIGHT);
  });
});
