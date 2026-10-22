// Getting a photo ready to keep (item 19 design 1.8 steps 3 to 6; GD-01, G3, G4, G6), with a fake
// platform: a decoded image of the wrong shape is refused, the encoding ladder is walked, the
// decoded image is always closed, and a strip that leaves anything behind is caught by the re-check.
// JPEGs are built in code; nothing here is a real photo.
import { cleanJpeg, withMetadata } from '@diet/test-fixtures';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type * as Core from '@diet/core';
import { type DecodedImage, type PhotoPlatform, preparePhoto } from './preparePhoto';

// A strip that can be broken on purpose, to prove the re-check after it (design 1.8 step 5).
const strip = vi.hoisted(() => ({ broken: false }));
vi.mock('@diet/core', async (importOriginal) => {
  const core = await importOriginal<typeof Core>();
  return {
    ...core,
    stripJpegMetadata: (bytes: Uint8Array) =>
      strip.broken ? bytes : core.stripJpegMetadata(bytes),
  };
});

const NOW = '2000-01-10T01:00:00.000Z';
const file = new Blob([Uint8Array.of(1, 2, 3)], { type: 'image/jpeg' });
let closed: number;
beforeEach(() => {
  strip.broken = false;
  closed = 0;
});

/** A 3000 × 2000 photo decoded as asked; each encoding step's bytes come from `encode`. */
function platform(
  encode: (width: number, height: number, quality: number) => Uint8Array,
  decoded?: { width: number; height: number },
): PhotoPlatform {
  return {
    measure: () => Promise.resolve({ width: 3000, height: 2000 }),
    decode: (_file, size): Promise<DecodedImage> =>
      Promise.resolve({
        ...(decoded ?? size),
        close: () => {
          closed++;
        },
      }),
    encodeJpeg: (_image, width, height, quality) => Promise.resolve(encode(width, height, quality)),
  };
}
const dirtyJpeg = (width: number, height: number) =>
  withMetadata(cleanJpeg({ width, height }), { gps: true, comment: true });

describe('preparePhoto (design 1.8; GD-01, G3, G6)', () => {
  it('a step too big moves to the next; the kept photo has that step’s size, no details, and the time it was added', async () => {
    const qualities: number[] = [];
    const result = await preparePhoto(
      file,
      platform((width, height, quality) => {
        qualities.push(quality);
        // Too big at the first two steps (1,024 px at 0.8 and 0.7), small enough at 800 px.
        return width === 1024 ? new Uint8Array(600_000) : dirtyJpeg(width, height);
      }),
      () => NOW,
    );
    expect(qualities).toEqual([0.8, 0.7, 0.7]);
    expect(result).toMatchObject({
      ok: true,
      // 1,024 × 683 decoded, then 800 px on the long side.
      photo: { mimeType: 'image/jpeg', width: 800, height: 534, takenAt: NOW },
    });
    if (!result.ok) throw new Error('expected a kept photo');
    expect(new Uint8Array(result.photo.bytes)).toEqual(cleanJpeg({ width: 800, height: 534 }));
    expect(closed).toBe(1);
  });

  it('a decoded image of another shape is refused, never stored sideways', async () => {
    const result = await preparePhoto(
      file,
      platform(dirtyJpeg, { width: 683, height: 1024 }),
      () => NOW,
    );
    expect(result).toEqual({ ok: false, code: 'unreadable' });
    expect(closed).toBe(1);
  });

  it.each([
    ['no step small enough', () => new Uint8Array(500_001), 'output-too-large'],
    [
      'an encoder that fails',
      () => {
        throw new Error('synthetic');
      },
      'unreadable',
    ],
    ['an encoding that is not a JPEG', () => Uint8Array.of(1, 2, 3), 'not-cleaned'],
  ] as const)('%s: refused as %s, and the decoded image is closed', async (_n, encode, code) => {
    expect(await preparePhoto(file, platform(encode), () => NOW)).toEqual({ ok: false, code });
    expect(closed).toBe(1);
  });

  it('a strip that leaves a segment behind is caught by the check after it', async () => {
    strip.broken = true;
    expect(await preparePhoto(file, platform(dirtyJpeg), () => NOW)).toEqual({
      ok: false,
      code: 'not-cleaned',
    });
    expect(closed).toBe(1);
  });
});
