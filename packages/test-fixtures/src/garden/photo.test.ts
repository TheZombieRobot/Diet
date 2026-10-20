// Garden photo bytes (item 19 design 2.6; A3; GD-01, HEALTH_SAFETY section 7, G3, G4): every
// metadata segment and the trailer removed, the image segments kept byte for byte, malformed files
// refused, never a throw. JPEGs are built in code (jpeg.ts); no image file is committed.
import {
  fitWithin,
  jpegMetadataMarkers,
  jpegSize,
  PHOTO_ENCODE_LADDER,
  PHOTO_LIMITS,
  photoProblem,
  stripJpegMetadata,
} from '@diet/core';
import { describe, expect, it } from 'vitest';
import { ALL_PHOTO_METADATA, cleanJpeg, hasTestMarker, withMetadata } from './jpeg';

const clean = cleanJpeg({ width: 300, height: 200 });
const dirty = withMetadata(clean, ALL_PHOTO_METADATA);
const record = (bytes: Uint8Array, over: Partial<{ mimeType: string; width: number }> = {}) => ({
  mimeType: 'image/jpeg',
  bytes: bytes.slice().buffer,
  width: 300,
  height: 200,
  ...over,
});

describe('stripJpegMetadata and jpegMetadataMarkers (A3; GD-01, G4)', () => {
  it('A3 GD-01: every metadata segment and the trailer go; the image segments stay byte for byte', () => {
    expect(hasTestMarker(dirty)).toBe(true);
    expect(jpegMetadataMarkers(dirty)).toEqual([
      'APPn',
      'APP1:Exif',
      'APP1:XMP',
      'APPn',
      'APPn',
      'COM',
      'after-EOI',
    ]);
    const stripped = stripJpegMetadata(dirty);
    expect(stripped).toEqual(clean);
    expect(hasTestMarker(stripped ?? new Uint8Array())).toBe(false);
    expect(jpegMetadataMarkers(stripped ?? new Uint8Array())).toEqual([]);
    expect(stripJpegMetadata(clean)).toEqual(clean);
    // A reserved JPGn segment is dropped too.
    const reserved = Uint8Array.from([
      ...clean.subarray(0, 2),
      0xff,
      0xf0,
      0,
      3,
      7,
      ...clean.subarray(2),
    ]);
    expect(jpegMetadataMarkers(reserved)).toEqual(['JPGn']);
    expect(stripJpegMetadata(reserved)).toEqual(clean);
  });

  it('A3: stuffed bytes and restart markers in the scan are kept, and the strip is idempotent', () => {
    const scan = Uint8Array.of(1, 0xff, 2, 0xff, 3);
    const withRestart = cleanJpeg({ width: 8, height: 8, scan });
    const at = withRestart.length - 2;
    const restarted = Uint8Array.from([
      ...withRestart.subarray(0, at),
      0xff,
      0xd0,
      9,
      ...withRestart.subarray(at),
    ]);
    const once = stripJpegMetadata(withMetadata(restarted, { comment: true }));
    expect(once).toEqual(restarted);
    expect(stripJpegMetadata(once ?? new Uint8Array())).toEqual(restarted);
  });

  it.each([
    ['not a JPEG', Uint8Array.of(0x89, 0x50, 0x4e, 0x47, 0, 0)],
    [
      'a length past the end',
      Uint8Array.from([...clean.subarray(0, 2), 0xff, 0xe1, 0x40, 0x00, 1]),
    ],
    ['no scan', Uint8Array.from([...clean.subarray(0, clean.indexOf(0xda) - 1), 0xff, 0xd9])],
    ['no end marker', clean.subarray(0, clean.length - 2)],
    [
      'a reserved marker',
      Uint8Array.from([...clean.subarray(0, 2), 0xff, 0x02, 0, 2, ...clean.subarray(2)]),
    ],
    ['empty', new Uint8Array()],
  ])('A3: %s is refused (null), never a throw', (_name, bytes) => {
    expect(stripJpegMetadata(bytes)).toBeNull();
    expect(jpegMetadataMarkers(bytes)).toBeNull();
  });
});

describe('photoProblem: the write check (A3; GD-01, G2)', () => {
  it.each([
    ['a clean JPEG of its stated size', record(clean), null],
    ['a WebP record', record(clean, { mimeType: 'image/webp' }), 'photo-format'],
    ['bytes that are not a JPEG', record(Uint8Array.of(1, 2, 3)), 'photo-format'],
    ['Exif location data', record(withMetadata(clean, { gps: true })), 'photo-metadata'],
    [
      'a trailer after the end marker',
      record(withMetadata(clean, { trailer: true })),
      'photo-metadata',
    ],
    ['a frame of another size', record(clean, { width: 301 }), 'photo-size'],
    [
      'a long side over 1,024 px',
      { ...record(cleanJpeg({ width: 1025, height: 10 })), width: 1025, height: 10 },
      'photo-size',
    ],
  ] as const)('%s → %s', (_name, photo, problem) => {
    expect(photoProblem(photo)).toBe(problem);
  });

  it('jpegSize reads the frame, and refuses a zero side or a cut header', () => {
    expect(jpegSize(clean)).toEqual({ width: 300, height: 200 });
    expect(jpegSize(cleanJpeg({ width: 0, height: 5 }))).toBeNull();
    expect(jpegSize(clean.subarray(0, 78))).toBeNull();
  });
});

describe('sizes and the encoding ladder (A3; G3)', () => {
  it.each([
    [3000, 2000, 1024, 683],
    [200, 300, 200, 300],
    [5000, 1, 1024, 1],
  ])('fitWithin(%i × %i) → %i × %i', (w, h, ew, eh) => {
    expect(fitWithin(w, h, PHOTO_LIMITS.maxEdge)).toEqual({ width: ew, height: eh });
  });

  it('the ladder never grows an edge or raises the quality, and starts at the kept limit', () => {
    expect(PHOTO_ENCODE_LADDER[0].maxEdge).toBe(PHOTO_LIMITS.maxEdge);
    for (let i = 1; i < PHOTO_ENCODE_LADDER.length; i++) {
      const [before, step] = [PHOTO_ENCODE_LADDER[i - 1], PHOTO_ENCODE_LADDER[i]];
      expect(step?.maxEdge).toBeLessThanOrEqual(before?.maxEdge ?? 0);
      expect(step?.quality).toBeLessThanOrEqual(before?.quality ?? 0);
    }
  });
});
