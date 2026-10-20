/**
 * JPEG bytes built in code for the garden photo tests (checklist item 19; design section 5). No
 * image file is ever committed: the repository's path rules forbid photo files, so every JPEG is
 * made at run time. Every metadata segment carries a plain ASCII marker such as TEST-MARKER-EXIF,
 * so a test can show that none of it survives; every GPS position written is 0° N 0° E, and no
 * option takes a position.
 */

/** The ASCII markers withMetadata writes, one per kind of metadata. */
export const PHOTO_TEST_MARKERS = Object.freeze({
  exif: 'TEST-MARKER-EXIF',
  xmp: 'TEST-MARKER-XMP',
  icc: 'TEST-MARKER-ICC',
  app13: 'TEST-MARKER-IPTC',
  comment: 'TEST-MARKER-COMMENT',
  trailer: 'TEST-MARKER-TRAILER',
  jfif: 'TEST-MARKER-JFIF',
});

const ascii = (text: string): number[] => Array.from(new TextEncoder().encode(text));
const u16be = (n: number): number[] => [(n >> 8) & 0xff, n & 0xff];
const u16le = (n: number): number[] => [n & 0xff, (n >> 8) & 0xff];
const u32le = (n: number): number[] => [n & 0xff, (n >> 8) & 0xff, (n >> 16) & 0xff, n >>> 24];

/** A marker segment: FF, the marker, the length (payload plus 2) and the payload. */
const segment = (marker: number, payload: readonly number[]): number[] => [
  0xff,
  marker,
  ...u16be(payload.length + 2),
  ...payload,
];

/** Entropy-coded bytes with every FF stuffed as FF 00, as a JPEG scan carries them. */
function stuffed(scan: Uint8Array): number[] {
  const out: number[] = [];
  for (const b of scan) out.push(...(b === 0xff ? [0xff, 0x00] : [b]));
  return out;
}

/**
 * A minimal baseline JPEG with a frame of `width` × `height`: SOI, DQT, SOF0, DHT, SOS, `scan`
 * (every FF stuffed as FF 00), EOI. Its image data is not decodable; it is for byte-level checks.
 */
export function cleanJpeg(options: {
  readonly width: number;
  readonly height: number;
  readonly scan?: Uint8Array;
}): Uint8Array {
  const scan = options.scan ?? Uint8Array.from({ length: 32 }, (_, i) => (i * 37 + 11) % 256);
  return Uint8Array.from([
    0xff,
    0xd8,
    ...segment(0xdb, [0x00, ...Array.from({ length: 64 }, () => 1)]),
    ...segment(0xc0, [8, ...u16be(options.height), ...u16be(options.width), 1, 1, 0x11, 0]),
    ...segment(0xc4, [0x00, 1, ...Array.from({ length: 15 }, () => 0), 0]),
    ...segment(0xda, [1, 1, 0x00, 0, 63, 0]),
    ...stuffed(scan),
    0xff,
    0xd9,
  ]);
}

/** A little-endian TIFF IFD: the entries (sorted by tag) and where its out-of-line data goes. */
interface IfdEntry {
  readonly tag: number;
  readonly type: number;
  readonly count: number;
  /** Four bytes stored in place, or bytes stored after the IFD. */
  readonly inline?: readonly number[];
  readonly data?: readonly number[];
}

function ifd(entries: readonly IfdEntry[], at: number): { bytes: number[]; end: number } {
  const head = 2 + entries.length * 12 + 4;
  let dataAt = at + head;
  const table: number[] = [...u16le(entries.length)];
  const data: number[] = [];
  for (const entry of entries) {
    table.push(...u16le(entry.tag), ...u16le(entry.type), ...u32le(entry.count));
    if (entry.data === undefined) {
      table.push(...(entry.inline ?? []), ...[0, 0, 0, 0].slice((entry.inline ?? []).length));
    } else {
      table.push(...u32le(dataAt));
      data.push(...entry.data);
      dataAt += entry.data.length;
    }
  }
  table.push(...u32le(0));
  return { bytes: [...table, ...data], end: dataAt };
}

/** Three rationals of 0/1: 0 degrees, 0 minutes, 0 seconds. */
const ZERO_DMS = Array.from({ length: 3 }, () => [...u32le(0), ...u32le(1)]).flat();

/** An Exif APP1 segment: a description holding the marker, an orientation, and a 0° N 0° E GPS IFD. */
function exifSegment(orientation: number, gps: boolean): number[] {
  const description = [...ascii(PHOTO_TEST_MARKERS.exif), 0];
  const ifd0 = (gpsAt: number): IfdEntry[] => [
    { tag: 0x010e, type: 2, count: description.length, data: description },
    { tag: 0x0112, type: 3, count: 1, inline: u16le(orientation) },
    ...(gps ? [{ tag: 0x8825, type: 4, count: 1, inline: u32le(gpsAt) }] : []),
  ];
  // IFD0 starts at 8. Its size does not depend on the GPS pointer's value, so it is laid out once
  // to find where the GPS IFD goes, then again with the pointer.
  const gpsAt = ifd(ifd0(0), 8).end;
  const tiff = [0x49, 0x49, 0x2a, 0x00, ...u32le(8), ...ifd(ifd0(gpsAt), 8).bytes];
  if (gps) {
    const gpsIfd = ifd(
      [
        { tag: 0x0001, type: 2, count: 2, inline: ascii('N\0') },
        { tag: 0x0002, type: 5, count: 3, data: ZERO_DMS },
        { tag: 0x0003, type: 2, count: 2, inline: ascii('E\0') },
        { tag: 0x0004, type: 5, count: 3, data: ZERO_DMS },
      ],
      gpsAt,
    );
    tiff.push(...gpsIfd.bytes);
  }
  return segment(0xe1, [...ascii('Exif'), 0, 0, ...tiff]);
}

export interface PhotoMetadata {
  /** An Exif orientation (1 to 8), in an Exif segment that also carries TEST-MARKER-EXIF. */
  readonly orientation?: number;
  /** A GPS IFD at 0° N 0° E inside the Exif segment. */
  readonly gps?: boolean;
  readonly xmp?: boolean;
  readonly icc?: boolean;
  /** A Photoshop IPTC segment (APP13). */
  readonly app13?: boolean;
  readonly comment?: boolean;
  /** Bytes after the end marker. */
  readonly trailer?: boolean;
  /** A JFIF APP0 segment with a thumbnail field. */
  readonly jfif?: boolean;
}

/** Every metadata option: what a phone camera file can carry, and more. */
export const ALL_PHOTO_METADATA: PhotoMetadata = Object.freeze({
  orientation: 6,
  gps: true,
  xmp: true,
  icc: true,
  app13: true,
  comment: true,
  trailer: true,
  jfif: true,
});

/** `jpeg` with metadata segments spliced in after SOI (and a trailer after EOI). */
export function withMetadata(jpeg: Uint8Array, metadata: PhotoMetadata): Uint8Array {
  const segments: number[] = [];
  if (metadata.jfif === true) {
    segments.push(
      ...segment(0xe0, [
        ...ascii('JFIF'),
        0,
        1,
        1,
        0,
        0,
        1,
        0,
        1,
        0,
        0,
        ...ascii(PHOTO_TEST_MARKERS.jfif),
      ]),
    );
  }
  if (metadata.orientation !== undefined || metadata.gps === true) {
    segments.push(...exifSegment(metadata.orientation ?? 1, metadata.gps === true));
  }
  if (metadata.xmp === true) {
    segments.push(
      ...segment(0xe1, [
        ...ascii('http://ns.adobe.com/xap/1.0/'),
        0,
        ...ascii(`<x:xmpmeta>${PHOTO_TEST_MARKERS.xmp}</x:xmpmeta>`),
      ]),
    );
  }
  if (metadata.icc === true) {
    segments.push(
      ...segment(0xe2, [...ascii('ICC_PROFILE'), 0, 1, 1, ...ascii(PHOTO_TEST_MARKERS.icc)]),
    );
  }
  if (metadata.app13 === true) {
    segments.push(
      ...segment(0xed, [...ascii('Photoshop 3.0'), 0, ...ascii(PHOTO_TEST_MARKERS.app13)]),
    );
  }
  if (metadata.comment === true) segments.push(...segment(0xfe, ascii(PHOTO_TEST_MARKERS.comment)));
  const trailer = metadata.trailer === true ? ascii(PHOTO_TEST_MARKERS.trailer) : [];
  return Uint8Array.from([...jpeg.subarray(0, 2), ...segments, ...jpeg.subarray(2), ...trailer]);
}

/** True when any of the test markers appears anywhere in `bytes`, read as Latin-1 text. */
export function hasTestMarker(bytes: Uint8Array): boolean {
  const text = new TextDecoder('latin1').decode(bytes);
  return Object.values(PHOTO_TEST_MARKERS).some((marker) => text.includes(marker));
}
