import { expect, type Page, test } from '@playwright/test';
import { createDecipheriv } from 'node:crypto';
import { rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { transfer } from '../packages/core/src/copy/health';
import { qrY4m } from '../packages/test-fixtures/src/transfer/qrImage';
import {
  V1_CODE,
  V1_KEY_TEXT,
  V1_RELAY,
  V1_ROOM_ID,
  V2_PLAINTEXT,
  VECTOR_IV_LIST,
  VECTOR_KEY_BYTES,
} from '../packages/test-fixtures/src/transfer/vectors';
import { goTo, seedOnboarded, waitForServiceWorkerControl } from './support/app';
import { startAudit } from './support/network';

// Checklist item 30 (design 5.4; E1–E4): pairing the phone through its camera, in the production
// build. Chrome's fake capture device plays a video of V1's code, drawn at run time (no image is
// committed); the phone reads it, stores a key it cannot read back, stops the camera and makes no
// request (TR-03a, TR-10 phone half, HS-14, HS-(next), C83, C115).

const copy = transfer.pairing;
/** The bundled QR reader's own chunk of the build. */
const JS_QR_CHUNK = /\/assets\/jsQR-[\w-]+\.js$/;
/** V1's code as a video, written before the browser starts and deleted afterwards. */
const VIDEO = join(tmpdir(), `diet-e2e-pairing-${String(process.pid)}.y4m`);
writeFileSync(VIDEO, qrY4m(V1_CODE, { size: 480, frames: 10 }));
test.afterAll(() => {
  rmSync(VIDEO, { force: true });
});

/** Keeps every stream the page gets, and counts the camera requests. */
function watchCamera(page: Page, options: { readonly bundledReader: boolean }): Promise<void> {
  return page.addInitScript((bundledReader) => {
    const w = window as unknown as {
      __pairingStreams: MediaStream[];
      __cameraRequests: number;
      BarcodeDetector?: unknown;
    };
    // Linux Chrome has no QR reader of its own; removing it makes sure the bundled one runs.
    if (bundledReader) delete w.BarcodeDetector;
    w.__pairingStreams = [];
    w.__cameraRequests = 0;
    const media = navigator.mediaDevices;
    const original = media.getUserMedia.bind(media);
    media.getUserMedia = async (constraints) => {
      w.__cameraRequests += 1;
      const stream = await original(constraints);
      w.__pairingStreams.push(stream);
      return stream;
    };
  }, options.bundledReader);
}

const cameraState = (page: Page) =>
  page.evaluate(() => {
    const w = window as unknown as { __pairingStreams: MediaStream[]; __cameraRequests: number };
    return {
      requests: w.__cameraRequests,
      live: w.__pairingStreams.flatMap((s) => s.getTracks()).filter((t) => t.readyState !== 'ended')
        .length,
      videos: document.querySelectorAll('video').length,
    };
  });

/** The stored pairing row, read with raw IndexedDB, and Example plaintext sealed with its key. */
const storedPairing = (page: Page, iv: readonly number[]) =>
  page.evaluate(
    (ivBytes) =>
      new Promise<{
        count: number;
        roomId: string;
        relayUrl: string;
        extractable: boolean;
        algorithm: unknown;
        usages: string[];
        sealed: number[];
      } | null>((resolve, reject) => {
        const open = indexedDB.open('diet');
        open.onerror = () => {
          reject(new Error('open failed'));
        };
        open.onsuccess = () => {
          const db = open.result;
          const store = db.transaction(['transfer_pairings']).objectStore('transfer_pairings');
          const all = store.getAll();
          all.onsuccess = () => {
            const rows = all.result as {
              roomId: string;
              relayUrl: string;
              key: CryptoKey;
            }[];
            db.close();
            const row = rows[0];
            if (row === undefined) {
              resolve(null);
              return;
            }
            const additionalData = new TextEncoder().encode('["diet-transfer",1,"list"]');
            void crypto.subtle
              .encrypt(
                { name: 'AES-GCM', iv: new Uint8Array(ivBytes), additionalData, tagLength: 128 },
                row.key,
                new TextEncoder().encode('Example plaintext'),
              )
              .then((sealed) => {
                resolve({
                  count: rows.length,
                  roomId: row.roomId,
                  relayUrl: row.relayUrl,
                  extractable: row.key.extractable,
                  algorithm: row.key.algorithm,
                  usages: [...row.key.usages].sort(),
                  sealed: [...new Uint8Array(sealed)],
                });
              }, reject);
          };
        };
      }),
    [...iv],
  );

/** Node opens what the page sealed with the stored key, using V1's raw key bytes. */
function openWithV1Key(sealed: readonly number[]): string {
  const bytes = Buffer.from(sealed);
  const decipher = createDecipheriv('aes-256-gcm', VECTOR_KEY_BYTES, VECTOR_IV_LIST);
  decipher.setAAD(Buffer.from('["diet-transfer",1,"list"]'));
  decipher.setAuthTag(bytes.subarray(bytes.length - 16));
  return Buffer.concat([
    decipher.update(bytes.subarray(0, bytes.length - 16)),
    decipher.final(),
  ]).toString('utf8');
}

async function scanAndExpectPaired(page: Page): Promise<void> {
  await page.getByRole('button', { name: copy.scan }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Pairing code saved.' })).toBeVisible({
    timeout: 20_000,
  });
  await expect(page.getByText(copy.paired, { exact: true })).toBeVisible();
  await expect(page.getByText('Pairing check: PCMK', { exact: true })).toBeVisible();
}

// Every test here runs with the fake camera allowed (E2 and E3 replace it with their own stubs).
test.use({
  permissions: ['camera'],
  launchOptions: {
    args: [
      '--use-fake-ui-for-media-stream',
      '--use-fake-device-for-media-stream',
      `--use-file-for-fake-video-capture=${VIDEO}`,
    ],
  },
});

test.describe('with a fake camera showing V1’s code', () => {
  test('E1: the bundled reader pairs; the key is stored non-extractable; the camera stops; unpair; no request', async ({
    page,
    context,
    baseURL,
    request,
  }) => {
    const audit = await startAudit(context, request, baseURL);
    await watchCamera(page, { bundledReader: true });
    await seedOnboarded(page);
    await goTo(page, 'Laptop pairing');
    expect((await cameraState(page)).requests).toBe(0);
    await scanAndExpectPaired(page);

    const stored = await storedPairing(page, [...VECTOR_IV_LIST]);
    expect(stored).toMatchObject({
      count: 1,
      roomId: V1_ROOM_ID,
      relayUrl: V1_RELAY,
      extractable: false,
      algorithm: { name: 'AES-GCM', length: 256 },
      usages: ['decrypt', 'encrypt'],
    });
    expect(openWithV1Key(stored?.sealed ?? [])).toBe(V2_PLAINTEXT);
    const webStorage = await page.evaluate(() =>
      [localStorage, sessionStorage]
        .flatMap((storage) =>
          Array.from({ length: storage.length }, (_, i) => {
            const key = storage.key(i) ?? '';
            return `${key}=${storage.getItem(key) ?? ''}`;
          }),
        )
        .join('\n'),
    );
    expect(webStorage).not.toContain(V1_ROOM_ID);
    expect(webStorage).not.toContain(V1_KEY_TEXT);
    expect(await cameraState(page)).toEqual({ requests: 1, live: 0, videos: 0 });

    // The pairing is kept: no second scan.
    await page.reload();
    await expect(page.getByText(copy.paired, { exact: true })).toBeVisible();
    expect((await cameraState(page)).requests).toBe(0);

    await page.getByRole('button', { name: copy.unpair }).click();
    await page.getByRole('button', { name: copy.unpair }).click();
    await expect(page.getByText(copy.unpairedNow, { exact: true })).toBeVisible();
    expect(await storedPairing(page, [...VECTOR_IV_LIST])).toBeNull();
    await audit.verify();
    // The bundled reader is one of the app's own files, and the page loaded it.
    expect(audit.seen.some((s) => !s.fromServiceWorker && JS_QR_CHUNK.test(s.url))).toBe(true);
  });

  test('E4: offline, the reader comes from the offline copy and pairing needs no network', async ({
    page,
    context,
  }) => {
    await watchCamera(page, { bundledReader: true });
    await seedOnboarded(page);
    await waitForServiceWorkerControl(page);
    await context.setOffline(true);
    const failed: string[] = [];
    context.on('requestfailed', (r) => failed.push(r.url()));
    await page.reload();
    await goTo(page, 'Laptop pairing');
    await scanAndExpectPaired(page);
    expect(failed).toEqual([]);
  });
});

test('E2: the browser’s own reader pairs, and the bundled reader is never loaded', async ({
  page,
  context,
  baseURL,
  request,
}) => {
  const audit = await startAudit(context, request, baseURL);
  await page.addInitScript((code) => {
    // A canvas stream stands in for the camera, and a stub for Chrome's own QR reader.
    const canvas = document.createElement('canvas');
    canvas.width = 64;
    canvas.height = 64;
    const context2d = canvas.getContext('2d');
    setInterval(() => {
      context2d?.fillRect(0, 0, 64, 64);
    }, 100);
    navigator.mediaDevices.getUserMedia = () => Promise.resolve(canvas.captureStream(10));
    (window as unknown as { BarcodeDetector: unknown }).BarcodeDetector = class {
      static getSupportedFormats() {
        return Promise.resolve(['qr_code']);
      }
      detect(video: HTMLVideoElement) {
        return Promise.resolve(
          video.readyState >= 2 ? [{ rawValue: code, format: 'qr_code' }] : [],
        );
      }
    };
  }, V1_CODE);
  await seedOnboarded(page);
  await goTo(page, 'Laptop pairing');
  await scanAndExpectPaired(page);
  await audit.verify();
  // The service worker keeps a copy for offline use; the page itself never loads it.
  expect(audit.seen.filter((s) => !s.fromServiceWorker && JS_QR_CHUNK.test(s.url))).toEqual([]);
});

test('E3: a denied camera gives the steps with this site’s name, stores nothing and sends nothing', async ({
  page,
  context,
  baseURL,
  request,
}) => {
  const audit = await startAudit(context, request, baseURL);
  await page.addInitScript(() => {
    navigator.mediaDevices.getUserMedia = () =>
      Promise.reject(new DOMException('Permission denied', 'NotAllowedError'));
  });
  await seedOnboarded(page);
  await goTo(page, 'Laptop pairing');
  await page.getByRole('button', { name: copy.scan }).click();
  const host = new URL(baseURL ?? '').host;
  await expect(page.getByRole('alert')).toContainText(`Choose ${host} and set it to Allow.`);
  await expect(page.getByRole('button', { name: copy.scanAgain })).toBeVisible();
  expect(await storedPairing(page, [...VECTOR_IV_LIST])).toBeNull();
  await audit.verify();
});
