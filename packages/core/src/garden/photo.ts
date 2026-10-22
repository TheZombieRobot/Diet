/**
 * Garden photo bytes (checklist item 19; design 2.6; HEALTH_SAFETY section 7; C49; G2 to G5).
 * Photos are scaled on the phone and kept as JPEG with nothing but image data: every APPn segment
 * (JFIF and its thumbnail, Exif with any location, XMP, ICC, IPTC, maker data), every comment, the
 * reserved JPGn markers and anything after the end marker are removed. The app's validation
 * middleware runs photoProblem on every photo write, from any code, so a photo that still carries
 * such data is never stored. Pure functions over bytes: no browser, no library, no network.
 */

/** The limits of a kept photo and of the file the owner picks (G3). */
export const PHOTO_LIMITS = Object.freeze({
  maxInputBytes: 30_000_000,
  maxInputPixels: 50_000_000,
  maxEdge: 1024,
  targetBytes: 500_000,
});

/** Encoding tries, in order, until one is at most PHOTO_LIMITS.targetBytes (G3). */
export const PHOTO_ENCODE_LADDER = Object.freeze([
  Object.freeze({ maxEdge: 1024, quality: 0.8 }),
  Object.freeze({ maxEdge: 1024, quality: 0.7 }),
  Object.freeze({ maxEdge: 800, quality: 0.7 }),
  Object.freeze({ maxEdge: 640, quality: 0.6 }),
] as const);

/** The size that fits within `maxEdge` on the long side: never enlarged, the short side rounded, at least 1. */
export function fitWithin(
  width: number,
  height: number,
  maxEdge: number,
): { width: number; height: number } {
  const long = Math.max(width, height);
  if (long <= maxEdge) return { width, height };
  const scale = maxEdge / long;
  const side = (n: number) => (n === long ? maxEdge : Math.max(1, Math.round(n * scale)));
  return width >= height
    ? { width: maxEdge, height: side(height) }
    : { width: side(width), height: maxEdge };
}

const MARKER = 0xff;
const SOI = 0xd8;
const EOI = 0xd9;
const SOS = 0xda;
const APP1 = 0xe1;

/** Start-of-frame markers: the frame header carries the image size. */
const isSof = (m: number): boolean =>
  m >= 0xc0 && m <= 0xcf && m !== 0xc4 && m !== 0xc8 && m !== 0xcc;
/** Markers with no length: TEM and RST0–RST7. */
const isStandalone = (m: number): boolean => m === 0x01 || (m >= 0xd0 && m <= 0xd7);
/** Segments kept: DQT, DHT, DAC, DRI, DNL, DHP, EXP, every SOFn and SOS. */
const isImageSegment = (m: number): boolean =>
  isSof(m) || m === 0xc4 || m === 0xcc || (m >= 0xda && m <= 0xdf);
/** Segments dropped: APP0–APP15, the reserved JPG0–JPG13, and COM. */
const isDropped = (m: number): boolean => m >= 0xe0 && m <= 0xfe;

const EXIF_ID = Uint8Array.of(0x45, 0x78, 0x69, 0x66, 0x00, 0x00); // "Exif\0\0"
const XMP_ID = new TextEncoder().encode('http://ns.adobe.com/xap/1.0/');

const startsWith = (bytes: Uint8Array, at: number, prefix: Uint8Array): boolean =>
  prefix.every((b, i) => bytes[at + i] === b);

function labelOf(bytes: Uint8Array, marker: number, payload: number): string {
  if (marker === APP1 && startsWith(bytes, payload, EXIF_ID)) return 'APP1:Exif';
  if (marker === APP1 && startsWith(bytes, payload, XMP_ID)) return 'APP1:XMP';
  if (marker >= 0xe0 && marker <= 0xef) return 'APPn';
  return marker === 0xfe ? 'COM' : 'JPGn';
}

interface Walk {
  /** The kept parts, in order: SOI, image segments, scans, EOI. */
  readonly kept: readonly Uint8Array[];
  /** What was left out, by label. */
  readonly dropped: readonly string[];
}

/**
 * Walks a JPEG from SOI to EOI. Null when it does not parse: no SOI, a length outside the data, an
 * unknown or reserved marker, no frame or no scan, or data ending before EOI.
 */
function walk(bytes: Uint8Array): Walk | null {
  if (bytes.length < 4 || bytes[0] !== MARKER || bytes[1] !== SOI) return null;
  const kept: Uint8Array[] = [bytes.subarray(0, 2)];
  const dropped: string[] = [];
  let sawFrame = false;
  let sawScan = false;
  let pos = 2;
  for (;;) {
    if (pos >= bytes.length || bytes[pos] !== MARKER) return null;
    // Fill bytes: any number of FF before the marker.
    while (pos < bytes.length && bytes[pos] === MARKER) pos += 1;
    if (pos >= bytes.length) return null;
    const marker = bytes[pos] ?? 0;
    pos += 1;
    if (marker === EOI) {
      if (!sawFrame || !sawScan) return null;
      kept.push(Uint8Array.of(MARKER, EOI));
      if (pos < bytes.length) dropped.push('after-EOI');
      return { kept, dropped };
    }
    if (isStandalone(marker)) {
      kept.push(Uint8Array.of(MARKER, marker));
      continue;
    }
    if (!isImageSegment(marker) && !isDropped(marker)) return null;
    if (pos + 2 > bytes.length) return null;
    const length = ((bytes[pos] ?? 0) << 8) | (bytes[pos + 1] ?? 0);
    if (length < 2 || pos + length > bytes.length) return null;
    const end = pos + length;
    if (isDropped(marker)) {
      dropped.push(labelOf(bytes, marker, pos + 2));
      pos = end;
      continue;
    }
    if (isSof(marker)) sawFrame = true;
    if (marker !== SOS) {
      kept.push(Uint8Array.of(MARKER, marker), bytes.subarray(pos, end));
      pos = end;
      continue;
    }
    // A scan: its header, then entropy-coded data up to the next marker that is not a stuffed
    // byte (FF 00) or a restart (FF D0–D7). Progressive files have several scans.
    sawScan = true;
    let data = end;
    for (;;) {
      if (data >= bytes.length) return null;
      if (bytes[data] !== MARKER) {
        data += 1;
        continue;
      }
      if (data + 1 >= bytes.length) return null;
      const next = bytes[data + 1] ?? 0;
      if (next === 0x00 || (next >= 0xd0 && next <= 0xd7)) {
        data += 2;
        continue;
      }
      break;
    }
    kept.push(Uint8Array.of(MARKER, SOS), bytes.subarray(pos, data));
    pos = data;
  }
}

/**
 * The same image with only image data (G4): starts FF D8, keeps DQT, DHT, DAC, DRI, DNL, DHP, EXP,
 * every SOFn and each scan byte for byte, and ends at EOI. Null for a file that does not parse.
 * Idempotent.
 */
export function stripJpegMetadata(bytes: Uint8Array): Uint8Array | null {
  const result = walk(bytes);
  if (result === null) return null;
  const out = new Uint8Array(result.kept.reduce((n, part) => n + part.length, 0));
  let at = 0;
  for (const part of result.kept) {
    out.set(part, at);
    at += part.length;
  }
  return out;
}

/**
 * What stripJpegMetadata would remove ('APP1:Exif', 'APP1:XMP', 'APPn', 'COM', 'JPGn',
 * 'after-EOI'): [] for a clean file, null for one that does not parse.
 */
export function jpegMetadataMarkers(bytes: Uint8Array): readonly string[] | null {
  return walk(bytes)?.dropped ?? null;
}

/** The first frame's width and height, or null (not a JPEG, a truncated header, a zero side). Never throws. */
export function jpegSize(bytes: Uint8Array): { width: number; height: number } | null {
  if (bytes.length < 4 || bytes[0] !== MARKER || bytes[1] !== SOI) return null;
  let pos = 2;
  while (pos < bytes.length) {
    if (bytes[pos] !== MARKER) return null;
    while (pos < bytes.length && bytes[pos] === MARKER) pos += 1;
    const marker = bytes[pos] ?? 0;
    pos += 1;
    if (isStandalone(marker)) continue;
    if (marker === EOI || marker === SOS || pos + 2 > bytes.length) return null;
    const length = ((bytes[pos] ?? 0) << 8) | (bytes[pos + 1] ?? 0);
    if (length < 2) return null;
    if (isSof(marker)) {
      if (length < 7 || pos + 7 > bytes.length) return null;
      const height = ((bytes[pos + 3] ?? 0) << 8) | (bytes[pos + 4] ?? 0);
      const width = ((bytes[pos + 5] ?? 0) << 8) | (bytes[pos + 6] ?? 0);
      return width > 0 && height > 0 ? { width, height } : null;
    }
    pos += length;
  }
  return null;
}

export type PhotoProblem = 'photo-format' | 'photo-metadata' | 'photo-size';

/**
 * Why a photo may not be stored (the validation middleware's check, on every write; G2, G4): not
 * a JPEG (WebP stays valid in the version-1 validator, but is never written), a JPEG that does not
 * parse, one that still carries metadata, or one whose frame is not its stated size or is over
 * 1,024 px on its long side.
 */
export function photoProblem(photo: {
  readonly mimeType: string;
  readonly bytes: ArrayBuffer;
  readonly width: number;
  readonly height: number;
}): PhotoProblem | null {
  if (photo.mimeType !== 'image/jpeg') return 'photo-format';
  const bytes = new Uint8Array(photo.bytes);
  const markers = jpegMetadataMarkers(bytes);
  if (markers === null) return 'photo-format';
  if (markers.length > 0) return 'photo-metadata';
  const size = jpegSize(bytes);
  if (
    size === null ||
    size.width !== photo.width ||
    size.height !== photo.height ||
    Math.max(size.width, size.height) > PHOTO_LIMITS.maxEdge
  ) {
    return 'photo-size';
  }
  return null;
}
