import type { Page } from '@playwright/test';

/** A stored garden photo as the browser holds it, with its bytes as base64 (item 19; GD-01). */
export interface StoredPhoto {
  readonly gardenId: string;
  readonly mimeType: string;
  readonly width: number;
  readonly height: number;
  readonly base64: string;
}

/**
 * Every stored garden photo, read with raw IndexedDB inside the page, so the bytes checked are the
 * ones the app kept (item 19 design 5, E1). The photo store is device only: nothing else reads it.
 */
export function readPhotos(page: Page): Promise<StoredPhoto[]> {
  return page.evaluate(
    () =>
      new Promise<StoredPhoto[]>((resolve, reject) => {
        const request = indexedDB.open('diet');
        request.onerror = () => {
          reject(new Error('open failed'));
        };
        request.onsuccess = () => {
          const db = request.result;
          const all = db
            .transaction(['garden_photos'], 'readonly')
            .objectStore('garden_photos')
            .getAll();
          all.onsuccess = () => {
            const rows = all.result as {
              gardenId: string;
              mimeType: string;
              width: number;
              height: number;
              bytes: ArrayBuffer;
            }[];
            db.close();
            resolve(
              rows.map((row) => {
                let binary = '';
                for (const byte of new Uint8Array(row.bytes)) binary += String.fromCharCode(byte);
                return {
                  gardenId: row.gardenId,
                  mimeType: row.mimeType,
                  width: row.width,
                  height: row.height,
                  base64: btoa(binary),
                };
              }),
            );
          };
          all.onerror = () => {
            reject(new Error('read failed'));
          };
        };
      }),
  );
}

/**
 * A JPEG drawn by the page's own canvas (decodable, unlike the minimal builder's): `width` ×
 * `height` of two flat colours, so a turned photo shows which way is up. Returns its bytes.
 */
export async function canvasJpeg(page: Page, width: number, height: number): Promise<Buffer> {
  const base64 = await page.evaluate(
    async ({ w, h }) => {
      const canvas = new OffscreenCanvas(w, h);
      const context = canvas.getContext('2d');
      if (context === null) throw new Error('no canvas');
      context.fillStyle = 'rgb(20, 120, 90)';
      context.fillRect(0, 0, w, h);
      context.fillStyle = 'rgb(240, 200, 60)';
      context.fillRect(0, 0, w, Math.round(h / 4));
      const blob = await canvas.convertToBlob({ type: 'image/jpeg', quality: 0.9 });
      let binary = '';
      for (const byte of new Uint8Array(await blob.arrayBuffer()))
        binary += String.fromCharCode(byte);
      return btoa(binary);
    },
    { w: width, h: height },
  );
  return Buffer.from(base64, 'base64');
}

/**
 * Whether canvasJpeg's band (the top quarter of the drawn image) is on the right of a stored
 * photo: decoded in the page, the middle row is sampled at both edges. A photo turned upright from
 * orientation 6 (a quarter turn clockwise) has the band on its right.
 */
export function bandOnRight(page: Page, base64: string): Promise<boolean> {
  return page.evaluate(async (data) => {
    const bytes = Uint8Array.from(atob(data), (c) => c.charCodeAt(0));
    const image = await createImageBitmap(new Blob([bytes], { type: 'image/jpeg' }));
    const canvas = new OffscreenCanvas(image.width, image.height);
    const context = canvas.getContext('2d');
    if (context === null) throw new Error('no canvas');
    context.drawImage(image, 0, 0);
    const y = Math.floor(image.height / 2);
    const [leftRed = 0] = context.getImageData(2, y, 1, 1).data;
    const [rightRed = 0] = context.getImageData(image.width - 3, y, 1, 1).data;
    // The band is drawn in rgb(240, 200, 60), the rest in rgb(20, 120, 90).
    return rightRed > 180 && leftRed < 80;
  }, base64);
}
