/**
 * Getting a garden photo ready to keep (item 19 design 1.8; HEALTH_SAFETY section 7; G3 to G6, G26):
 * run only on the owner's tap, on the main thread, with the browser's own image loading, decoder
 * and canvas: no worker, no library, no network. The photo is scaled while decoding (so a large one
 * is never held at full size), turned upright, drawn onto a canvas and encoded again as JPEG, then
 * every APPn and comment segment and anything after the end marker is removed byte by byte (core
 * stripJpegMetadata). The validation middleware checks the result once more when it is stored.
 * Errors never carry bytes or file names.
 */
import {
  fitWithin,
  type Instant,
  jpegMetadataMarkers,
  PHOTO_ENCODE_LADDER,
  PHOTO_LIMITS,
  stripJpegMetadata,
} from '@diet/core';
import { revokeTrackedObjectUrl, trackedObjectUrl } from '../files';

export type PhotoErrorCode =
  'file-too-large' | 'too-many-pixels' | 'unreadable' | 'output-too-large' | 'not-cleaned';

export interface DecodedImage {
  readonly width: number;
  readonly height: number;
  close(): void;
}

export interface PhotoPlatform {
  /**
   * The upright size as an <img> on a tracked object URL reports it (naturalWidth and
   * naturalHeight after 'load', which needs the header only); the URL is revoked at once. Rejects
   * if the image does not load.
   */
  measure(file: Blob): Promise<{ width: number; height: number }>;
  /** The image decoded upright and scaled to `size` while decoding. */
  decode(file: Blob, size: { width: number; height: number }): Promise<DecodedImage>;
  /** The image drawn onto a white canvas of width × height and encoded as JPEG. Throws unless JPEG. */
  encodeJpeg(
    image: DecodedImage,
    width: number,
    height: number,
    quality: number,
  ): Promise<Uint8Array>;
}

/** A photo ready to keep: a clean JPEG with its size and when it was added. */
export interface KeptPhoto {
  readonly mimeType: 'image/jpeg';
  readonly bytes: ArrayBuffer;
  readonly width: number;
  readonly height: number;
  readonly takenAt: Instant;
}

export type PreparedPhoto =
  | { readonly ok: true; readonly photo: KeptPhoto }
  | { readonly ok: false; readonly code: PhotoErrorCode };

/** The steps of design 1.8, in order; the first that fails names the problem. */
export async function preparePhoto(
  file: Blob,
  platform: PhotoPlatform,
  now: () => Instant,
): Promise<PreparedPhoto> {
  if (file.size > PHOTO_LIMITS.maxInputBytes) return { ok: false, code: 'file-too-large' };
  let measured: { width: number; height: number };
  try {
    measured = await platform.measure(file);
  } catch {
    return { ok: false, code: 'unreadable' };
  }
  if (measured.width <= 0 || measured.height <= 0) return { ok: false, code: 'unreadable' };
  if (measured.width * measured.height > PHOTO_LIMITS.maxInputPixels) {
    return { ok: false, code: 'too-many-pixels' };
  }
  const target = fitWithin(measured.width, measured.height, PHOTO_LIMITS.maxEdge);
  let image: DecodedImage;
  try {
    image = await platform.decode(file, target);
  } catch {
    return { ok: false, code: 'unreadable' };
  }
  try {
    // A photo of another shape is never stored sideways or stretched.
    if (image.width !== target.width || image.height !== target.height) {
      return { ok: false, code: 'unreadable' };
    }
    let encoded: { bytes: Uint8Array; width: number; height: number } | null = null;
    for (const step of PHOTO_ENCODE_LADDER) {
      const size = fitWithin(image.width, image.height, step.maxEdge);
      let bytes: Uint8Array;
      try {
        bytes = await platform.encodeJpeg(image, size.width, size.height, step.quality);
      } catch {
        return { ok: false, code: 'unreadable' };
      }
      if (bytes.length <= PHOTO_LIMITS.targetBytes) {
        encoded = { bytes, ...size };
        break;
      }
    }
    if (encoded === null) return { ok: false, code: 'output-too-large' };
    const clean = stripJpegMetadata(encoded.bytes);
    if (clean === null || jpegMetadataMarkers(clean)?.length !== 0) {
      return { ok: false, code: 'not-cleaned' };
    }
    return {
      ok: true,
      photo: {
        mimeType: 'image/jpeg',
        bytes: clean.slice().buffer,
        width: encoded.width,
        height: encoded.height,
        // When it was added to the app, never the camera's time (G6).
        takenAt: now(),
      },
    };
  } finally {
    image.close();
  }
}

/** A canvas to draw on: an OffscreenCanvas where the browser has one, else a detached <canvas>. */
async function canvasJpeg(
  // An ImageBitmap from decode(): DecodedImage has its shape.
  image: CanvasImageSource,
  width: number,
  height: number,
  quality: number,
): Promise<Blob> {
  const draw = (context: OffscreenCanvasRenderingContext2D | CanvasRenderingContext2D | null) => {
    if (context === null) throw new Error('No canvas');
    // A JPEG has no transparency: a white ground keeps transparent parts from turning black.
    context.fillStyle = 'white';
    context.fillRect(0, 0, width, height);
    context.imageSmoothingQuality = 'high';
    context.drawImage(image, 0, 0, width, height);
  };
  if (typeof OffscreenCanvas === 'function') {
    const canvas = new OffscreenCanvas(width, height);
    draw(canvas.getContext('2d'));
    return canvas.convertToBlob({ type: 'image/jpeg', quality });
  }
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  draw(canvas.getContext('2d'));
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob === null) reject(new Error('Not encoded'));
        else resolve(blob);
      },
      'image/jpeg',
      quality,
    );
  });
}

/** The browser's own image loading, decoder and canvas. */
export const browserPhotoPlatform: PhotoPlatform = {
  measure: (file) =>
    new Promise((resolve, reject) => {
      const url = trackedObjectUrl(file);
      const img = new Image();
      img.onload = () => {
        revokeTrackedObjectUrl(url);
        resolve({ width: img.naturalWidth, height: img.naturalHeight });
      };
      img.onerror = () => {
        revokeTrackedObjectUrl(url);
        reject(new Error('Not an image'));
      };
      img.src = url;
    }),
  decode: (file, size) =>
    createImageBitmap(file, {
      imageOrientation: 'from-image',
      resizeWidth: size.width,
      resizeHeight: size.height,
      resizeQuality: 'high',
    }),
  encodeJpeg: async (image, width, height, quality) => {
    const blob = await canvasJpeg(image, width, height, quality);
    if (blob.type !== 'image/jpeg') throw new Error('Not encoded as JPEG');
    return new Uint8Array(await blob.arrayBuffer());
  },
};
