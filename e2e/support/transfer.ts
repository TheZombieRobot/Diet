import { expect, type Page } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { inflateRawSync } from 'node:zlib';
import type { GroceryListRecord } from '../../packages/core/src/index';
import { RELAY_E2E_ORIGIN, RELAY_ORIGIN } from '../../packages/core/src/relay/protocol';
import {
  base64UrlToBytes,
  decodeListPayload,
  importPairingKey,
  type ListPayload,
  openFromRelay,
  openRelayBody,
} from '../../packages/grocery/src/transfer/index';
import { commerceRules, healthPhraseRules } from '../../tools/scans/rules';
import { scanText } from '../../tools/scans/scan';
import { lowContrastText } from './contrast';

// Browser helpers for Send to laptop (checklist item 31 design 5.2).

/** A production build whose relay origin is the reserved test name (L10), in a fresh folder. */
export function buildRelayTestApp(): string {
  const outDir = mkdtempSync(join(tmpdir(), 'diet-relay-test-'));
  execFileSync(
    'pnpm',
    ['--filter', '@diet/mobile-web', 'exec', 'vite', 'build', '--outDir', outDir, '--emptyOutDir'],
    { env: { ...process.env, DIET_TEST_RELAY_ORIGIN: RELAY_E2E_ORIGIN }, stdio: 'pipe' },
  );
  return outDir;
}

/**
 * Puts a grocery list, and optionally a pairing, into the app's database with raw IndexedDB, then
 * reloads. The pairing's key is `rawKey` imported in the page as a non-extractable key. It refuses
 * the real relay address, so no browser test can point the app at it (L56).
 */
export async function seedTransfer(
  page: Page,
  options: {
    readonly list: GroceryListRecord;
    readonly pairing?: {
      readonly rawKey: Uint8Array;
      readonly relayUrl: string;
      readonly roomId: string;
    };
  },
): Promise<void> {
  if (options.pairing !== undefined && options.pairing.relayUrl === RELAY_ORIGIN) {
    throw new Error('A browser test never pairs with the real relay');
  }
  await page.evaluate(
    async ({ list, pairing }) => {
      const key =
        pairing === null
          ? null
          : await crypto.subtle.importKey('raw', new Uint8Array(pairing.rawKey), 'AES-GCM', false, [
              'encrypt',
              'decrypt',
            ]);
      await new Promise<void>((resolve, reject) => {
        const request = indexedDB.open('diet');
        request.onerror = () => {
          reject(new Error('open failed'));
        };
        request.onsuccess = () => {
          const db = request.result;
          const tx = db.transaction(['grocery_lists', 'transfer_pairings'], 'readwrite');
          tx.objectStore('grocery_lists').put(list);
          if (pairing !== null) {
            tx.objectStore('transfer_pairings').put({
              id: 'singleton',
              relayUrl: pairing.relayUrl,
              roomId: pairing.roomId,
              key,
              pairedAt: '2000-01-01T00:00:00.000Z',
            });
          }
          tx.oncomplete = () => {
            db.close();
            resolve();
          };
          tx.onerror = () => {
            reject(new Error('write failed'));
          };
        };
      });
    },
    {
      list: options.list,
      pairing:
        options.pairing === undefined
          ? null
          : {
              rawKey: [...options.pairing.rawKey],
              relayUrl: options.pairing.relayUrl,
              roomId: options.pairing.roomId,
            },
    },
  );
  await page.reload();
  await expect(page.getByRole('navigation', { name: 'Main' })).toBeVisible();
}

/** The stored list, read back with raw IndexedDB. */
export function storedList(page: Page, id: string): Promise<GroceryListRecord> {
  return page.evaluate(
    (listId) =>
      new Promise<GroceryListRecord>((resolve, reject) => {
        const request = indexedDB.open('diet');
        request.onerror = () => {
          reject(new Error('open failed'));
        };
        request.onsuccess = () => {
          const db = request.result;
          const get = db.transaction(['grocery_lists']).objectStore('grocery_lists').get(listId);
          get.onsuccess = () => {
            db.close();
            resolve(get.result as GroceryListRecord);
          };
        };
      }),
    id,
  );
}

/**
 * Item 29 section 6's TR-02 checks on one stored body: its bytes hold no sentinel, no offset
 * inflates to the sentinel or to JSON, it opens under the pairing key to exactly `expected`, and
 * not under a fresh key. (The caller checks that two sends give two different bodies.)
 */
export async function expectSealedListBody(
  body: string,
  rawKey: Uint8Array,
  expected: ListPayload,
): Promise<void> {
  const bytes = base64UrlToBytes(body.slice(4));
  const sentinel = Buffer.from('zzsentinel');
  expect(Buffer.from(bytes).includes(sentinel)).toBe(false);
  for (let offset = 0; offset <= 16; offset++) {
    let inflated: Buffer | null = null;
    try {
      inflated = inflateRawSync(bytes.subarray(offset));
    } catch {
      inflated = null;
    }
    if (inflated === null) continue;
    expect(inflated.includes(sentinel)).toBe(false);
    expect(() => JSON.parse(inflated.toString('utf8')) as unknown).toThrow();
  }
  const opened = await openFromRelay(await importPairingKey(rawKey), 'list', body);
  expect(decodeListPayload(opened ?? new Uint8Array(0))).toEqual(expected);
  const other = await importPairingKey(crypto.getRandomValues(new Uint8Array(32)));
  expect(await openRelayBody(other, 'list', body)).toEqual({ ok: false, reason: 'cannot-open' });
}

/**
 * first-run.spec.ts's sweep, for the Send and export section and the paste panel: no wording-rule
 * match outside the code box, every text at 4.5:1 in light and dark, every control 48 px square,
 * and no sideways scroll.
 */
export async function sweepSection(page: Page, where: string, found: string[]): Promise<void> {
  const section = page.getByRole('region', { name: 'Send and export' });
  const text = await section.evaluate((element) => {
    const copy = element.cloneNode(true) as HTMLElement;
    for (const skip of copy.querySelectorAll('[data-scan-exclude]')) skip.remove();
    return copy.innerText || copy.textContent || '';
  });
  found.push(
    ...scanText(where, text, [...healthPhraseRules, ...commerceRules]).map(
      (v) => `${where}: ${v.ruleId}`,
    ),
  );
  for (const colorScheme of ['light', 'dark'] as const) {
    await page.emulateMedia({ colorScheme });
    found.push(...(await lowContrastText(page, `${where}, ${colorScheme}`)).low);
  }
  await page.emulateMedia({ colorScheme: 'light' });
  const sizes = await section
    .locator('a:visible, button:visible, textarea:visible')
    .evaluateAll((controls) =>
      controls.map((c) => {
        const box = c.getBoundingClientRect();
        return {
          name: `${c.tagName.toLowerCase()} "${c.textContent}"`,
          w: box.width,
          h: box.height,
        };
      }),
    );
  for (const { name, w, h } of sizes) {
    if (h < 48 || w < 48) found.push(`${where}: ${name} is ${String(w)} x ${String(h)}`);
  }
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  if (overflow > 0) found.push(`${where}: scrolls sideways by ${String(overflow)} px`);
}
