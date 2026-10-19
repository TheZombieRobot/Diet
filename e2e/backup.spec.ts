import { readFileSync } from 'node:fs';
import {
  type APIRequestContext,
  type BrowserContext,
  expect,
  type Page,
  test,
} from '@playwright/test';
import { alcohol, onboarding, privacy } from '../packages/core/src/copy/health';
import {
  lockedReferenceEnvelopeV1,
  plainReferenceEnvelopeV1,
  REFERENCE_PHRASE_V1,
  snapshotV1,
} from '../packages/test-fixtures/src/index';
import {
  goTo,
  heading,
  recordPolicyViolations,
  renderedText,
  seedOnboarded,
  waitForServiceWorkerControl,
} from './support/app';
import { appFiles, appOrigin, expectOnlyOwnOrigin, record, type Seen } from './support/network';

// Backup in the real browser (storage spec sections 10 to 12; section 16 tests 43 to 45; BK-01,
// BK-02, HS-14, HS-15, HS-30, PWA-06): a real download, the real file chooser, the locked file,
// delete-all and restore, online and offline, in one tab and against a second tab, with every
// request audited from the first page load. The files are synthetic (the version-1 fixture) and
// live only in Playwright's temporary download folder.

const BACKED_UP = Object.keys(snapshotV1);
const SEEDED = ['profile', 'targets', 'settings', 'beverages', 'garden'];

/** Every backed-up store, read with raw IndexedDB in the page (structured-clone data only). */
function readDatabase(page: Page): Promise<Record<string, unknown[]>> {
  return page.evaluate(
    (stores) =>
      new Promise<Record<string, unknown[]>>((resolve, reject) => {
        const request = indexedDB.open('diet');
        request.onerror = () => {
          reject(new Error('open failed'));
        };
        request.onsuccess = () => {
          const db = request.result;
          const tx = db.transaction(stores, 'readonly');
          const out: Record<string, unknown[]> = {};
          for (const name of stores) {
            const all = tx.objectStore(name).getAll();
            all.onsuccess = () => {
              out[name] = all.result as unknown[];
            };
          }
          tx.oncomplete = () => {
            db.close();
            resolve(out);
          };
        };
      }),
    BACKED_UP,
  );
}

const count = async (page: Page, store: string) => (await readDatabase(page))[store]?.length ?? 0;

const card = (page: Page) => page.getByRole('region', { name: privacy.backupCard.title });

/**
 * The network audit, started before the first page load: every request of the context (the
 * service worker's included) and every policy violation, checked against the app's own files.
 */
async function startAudit(
  context: BrowserContext,
  request: APIRequestContext,
  baseURL: string | undefined,
): Promise<{ readonly seen: Seen[]; readonly verify: () => void }> {
  const files = await appFiles(request, baseURL);
  const seen: Seen[] = [];
  context.on('request', record(seen));
  const violations = await recordPolicyViolations(context);
  return {
    seen,
    verify: () => {
      expect(seen.length).toBeGreaterThan(0);
      expectOnlyOwnOrigin(seen, appOrigin(baseURL), files);
      expect(violations).toEqual([]);
    },
  };
}

/** Waits until the app has opened its database (the Backup and data card offers its actions). */
async function openSettings(page: Page): Promise<void> {
  await goTo(page, 'Settings');
  await expect(
    card(page).getByRole('button', { name: privacy.backupCard.exportAction }),
  ).toBeVisible();
}

/** Restore: choose the file through the real file chooser. */
async function chooseBackup(page: Page, name: string, text: string): Promise<void> {
  await openSettings(page);
  await card(page).getByRole('button', { name: privacy.backupCard.restoreAction }).click();
  const [chooser] = await Promise.all([
    page.waitForEvent('filechooser'),
    card(page).getByRole('button', { name: privacy.importBackup.chooseFile }).click(),
  ]);
  await chooser.setFiles({ name, mimeType: 'application/json', buffer: Buffer.from(text) });
}

/**
 * Replace, then wait for the app to load again: on Today from Settings, or, from setup, on
 * Settings, Readiness answers, so the restored answers are checked first (item 13, E64).
 */
async function replaceAndReload(page: Page, opensOn = 'Today'): Promise<void> {
  const confirm = page.getByTestId('restore-confirm');
  await expect(confirm).toBeVisible();
  await Promise.all([
    page.waitForEvent('load'),
    confirm.getByRole('button', { name: privacy.importBackup.replace }).click(),
  ]);
  await expect(heading(page)).toHaveText(opensOn);
}

/**
 * A fresh phone, or one after delete-all, shows the first-run flow. Restore is reachable there
 * only after the alcohol notice is acknowledged (DOC_REVIEW C53; HS-20), from "Restore from a
 * backup instead".
 */
async function chooseBackupInSetup(page: Page, name: string, text: string): Promise<void> {
  await expect(heading(page)).toHaveText(onboarding.welcome.title);
  await expect(page.getByRole('button', { name: onboarding.frame.restoreLink })).toHaveCount(0);
  await page.getByRole('button', { name: onboarding.frame.continue }).click();
  await page.getByRole('button', { name: alcohol.notice.acknowledge }).click();
  await page.getByRole('button', { name: onboarding.frame.restoreLink }).click();
  await expect(heading(page)).toHaveText(onboarding.frame.restoreTitle);
  const [chooser] = await Promise.all([
    page.waitForEvent('filechooser'),
    page.getByRole('button', { name: privacy.importBackup.chooseFile }).click(),
  ]);
  await chooser.setFiles({ name, mimeType: 'application/json', buffer: Buffer.from(text) });
}

/** Seeds every backed-up store from the synthetic fixture by restoring it. */
async function seedFromFixture(page: Page): Promise<void> {
  await chooseBackup(page, 'diet-backup-2000-03-01.json', plainReferenceEnvelopeV1());
  await replaceAndReload(page);
  expect(await count(page, 'weights')).toBe(snapshotV1.weights.length);
}

/** After a download: answer "Can you see the file?" with Yes, and see the backup recorded. */
async function confirmSeen(page: Page): Promise<void> {
  await expect(card(page).getByText(privacy.exportBackup.canYouSeeIt)).toBeVisible();
  await card(page).getByRole('button', { name: privacy.exportBackup.yes }).click();
  await expect(card(page).getByTestId('export-recorded')).toContainText(
    privacy.exportBackup.recorded,
  );
  await expect(card(page).getByTestId('last-backup')).toHaveText(
    /^Last backup made \d{1,2} \w+ \d{4}$/,
  );
}

/** Export a plain backup, catch the download, and answer Yes. Returns the file's text. */
async function exportPlain(page: Page): Promise<string> {
  await openSettings(page);
  await card(page).getByRole('button', { name: privacy.backupCard.exportAction }).click();
  await card(page).getByRole('switch', { name: privacy.exportBackup.lockLabel }).uncheck();
  await expect(card(page).getByText(privacy.exportBackup.plainWarning)).toBeVisible();
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    card(page).getByRole('button', { name: privacy.exportBackup.saveFile }).click(),
  ]);
  expect(download.suggestedFilename()).toMatch(/^diet-backup-\d{4}-\d{2}-\d{2}\.json$/);
  const text = readFileSync(await download.path(), 'utf8');
  await expect(card(page).getByTestId('export-ask')).toContainText(download.suggestedFilename());
  await confirmSeen(page);
  return text;
}

async function deleteAll(page: Page): Promise<void> {
  await openSettings(page);
  await card(page).getByRole('button', { name: privacy.backupCard.deleteAllAction }).click();
  await card(page).getByRole('button', { name: privacy.deleteAll.next }).click();
  await Promise.all([
    page.waitForEvent('load'),
    card(page).getByRole('button', { name: privacy.deleteAll.confirm }).click(),
  ]);
  // A fresh start: the first-run flow (item 13).
  await expect(heading(page)).toHaveText(onboarding.welcome.title);
}

/** Writes rows with raw IndexedDB, as a row the app itself would never write. */
function writeRaw(page: Page, store: string, rows: readonly unknown[]): Promise<void> {
  return page.evaluate(
    ({ store, rows }) =>
      new Promise<void>((resolve, reject) => {
        const request = indexedDB.open('diet');
        request.onsuccess = () => {
          const db = request.result;
          const tx = db.transaction([store], 'readwrite');
          for (const row of rows) tx.objectStore(store).put(row);
          tx.oncomplete = () => {
            db.close();
            resolve();
          };
          tx.onerror = () => {
            reject(new Error('write failed'));
          };
        };
      }),
    { store, rows },
  );
}

test('BK-01 / HS-14: restore, export, delete all and restore again, with every record back and no request outside the app', async ({
  page,
  context,
  baseURL,
  request,
}) => {
  const audit = await startAudit(context, request, baseURL);
  await seedOnboarded(page);
  await waitForServiceWorkerControl(page);
  await seedFromFixture(page);

  const exported = await exportPlain(page);
  expect(JSON.parse(exported)).toMatchObject({ version: 1, encrypted: false });
  const before = await readDatabase(page);
  expect(before['grocery_lists']).toEqual(snapshotV1.grocery_lists);

  await deleteAll(page);
  expect(await count(page, 'weights')).toBe(0);
  expect(await count(page, 'beverages')).toBe(1);

  await chooseBackupInSetup(page, 'diet-backup-2000-03-01.json', exported);
  await replaceAndReload(page, 'Readiness answers');
  expect(await readDatabase(page)).toEqual(before);
  audit.verify();
});

test('BK-01, locked: the default locked export round-trips in Chromium, with the right header, no password left behind and no request outside the app', async ({
  page,
  context,
  baseURL,
  request,
}) => {
  const audit = await startAudit(context, request, baseURL);
  await seedOnboarded(page);
  await waitForServiceWorkerControl(page);
  await seedFromFixture(page);

  const phrase = 'synthetic example phrase for the locked test';
  await openSettings(page);
  await card(page).getByRole('button', { name: privacy.backupCard.exportAction }).click();
  await expect(
    card(page).getByRole('switch', { name: privacy.exportBackup.lockLabel }),
  ).toBeChecked();
  await card(page).getByLabel(privacy.exportBackup.passwordLabel, { exact: true }).fill(phrase);
  await card(page).getByLabel(privacy.exportBackup.passwordRepeatLabel).fill(phrase);
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    card(page).getByRole('button', { name: privacy.exportBackup.saveFile }).click(),
  ]);
  expect(download.suggestedFilename()).toMatch(/^diet-backup-\d{4}-\d{2}-\d{2}-locked\.json$/);
  const text = readFileSync(await download.path(), 'utf8');
  const file = JSON.parse(text) as {
    kdf: { iterations: number; salt: string };
    cipher: { iv: string };
  };
  expect(Object.keys(file)).toEqual([
    'format',
    'version',
    'encrypted',
    'kdf',
    'cipher',
    'ciphertext',
  ]);
  expect(file).toMatchObject({ format: 'diet-backup', version: 1, encrypted: true });
  expect(file.kdf.iterations).toBe(600_000);
  expect(Buffer.from(file.kdf.salt, 'base64')).toHaveLength(16);
  expect(Buffer.from(file.cipher.iv, 'base64')).toHaveLength(12);
  expect(text).not.toContain(phrase);
  expect(text).not.toContain('Example note');

  // The password is nowhere on the page or in its address once the file is made.
  await expect(card(page).getByTestId('export-ask')).toBeVisible();
  expect(page.url()).not.toContain(encodeURIComponent(phrase));
  expect(page.url()).not.toContain(phrase);
  expect(await renderedText(page)).not.toContain(phrase);
  await confirmSeen(page);
  const before = await readDatabase(page);
  expect(before['weights']).toHaveLength(snapshotV1.weights.length);

  await deleteAll(page);
  expect(await count(page, 'weights')).toBe(0);
  await chooseBackupInSetup(page, download.suggestedFilename(), text);
  const field = page.getByLabel(privacy.importBackup.passwordLabel);
  await expect(field).toHaveAttribute('autocomplete', 'current-password');
  await field.fill(phrase);
  await page.getByRole('button', { name: privacy.importBackup.unlock }).click();
  await expect(page.getByTestId('restore-confirm')).toContainText(privacy.importBackup.fileLocked);
  await replaceAndReload(page, 'Readiness answers');
  expect(await readDatabase(page)).toEqual(before);
  expect(page.url()).not.toContain(phrase);
  audit.verify();
});

test('BK-02: a wrong password says so and imports nothing; the right one restores the file, with no request outside the app', async ({
  page,
  context,
  baseURL,
  request,
}) => {
  const audit = await startAudit(context, request, baseURL);
  await page.goto('./');
  await chooseBackupInSetup(
    page,
    'diet-backup-2000-03-01-locked.json',
    lockedReferenceEnvelopeV1(),
  );
  const field = page.getByLabel(privacy.importBackup.passwordLabel);
  await expect(field).toHaveAttribute('autocomplete', 'current-password');
  await field.fill('not the reference phrase');
  await page.getByRole('button', { name: privacy.importBackup.unlock }).click();
  await expect(page.getByRole('main').getByRole('alert')).toHaveText(
    privacy.backupErrors['wrong-password-or-damaged'],
  );
  // The error is linked to the cleared field, which has focus again.
  await expect(field).toHaveAttribute('aria-invalid', 'true');
  await expect(field).toHaveValue('');
  await expect(field).toBeFocused();
  expect(await count(page, 'weights')).toBe(0);
  const phrase = REFERENCE_PHRASE_V1;
  await field.fill(phrase);
  await page.getByRole('button', { name: privacy.importBackup.unlock }).click();
  await replaceAndReload(page, 'Readiness answers');
  expect(await count(page, 'weights')).toBe(snapshotV1.weights.length);
  expect(page.url()).not.toContain(phrase);
  audit.verify();
});

test('offline: export, delete all and restore work with no network at all', async ({
  page,
  context,
  baseURL,
  request,
}) => {
  const audit = await startAudit(context, request, baseURL);
  await seedOnboarded(page);
  await waitForServiceWorkerControl(page);
  await seedFromFixture(page);

  await context.setOffline(true);
  const failed: string[] = [];
  context.on('requestfailed', (r) => failed.push(r.url()));
  const fromNetwork: string[] = [];
  page.on('response', (response) => {
    if (!response.fromServiceWorker()) {
      fromNetwork.push(response.url());
    }
  });

  const exported = await exportPlain(page);
  const before = await readDatabase(page);
  await deleteAll(page);
  expect(await count(page, 'weights')).toBe(0);
  await chooseBackupInSetup(page, 'diet-backup-2000-03-01.json', exported);
  await replaceAndReload(page, 'Readiness answers');
  expect(await readDatabase(page)).toEqual(before);

  expect(fromNetwork).toEqual([]);
  expect(failed).toEqual([]);
  audit.verify();
});

test('HS-14: an unchecked rescue copy after a failed self-check makes no request either', async ({
  page,
  context,
  baseURL,
  request,
}) => {
  const audit = await startAudit(context, request, baseURL);
  await seedOnboarded(page);
  await openSettings(page);
  await writeRaw(page, 'weights', [{ ...snapshotV1.weights[0], kg: 5 }]);

  await card(page).getByRole('button', { name: privacy.backupCard.exportAction }).click();
  await card(page).getByRole('switch', { name: privacy.exportBackup.lockLabel }).uncheck();
  await card(page).getByRole('button', { name: privacy.exportBackup.saveFile }).click();
  await expect(card(page).getByRole('alert')).toHaveText(
    'The backup could not be checked: Weigh-ins, record 1: the weight is outside the allowed range (20–400).',
  );
  await card(page).getByRole('switch', { name: privacy.exportBackup.lockLabel }).uncheck();
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    card(page).getByRole('button', { name: privacy.exportBackup.saveUnchecked }).click(),
  ]);
  expect(download.suggestedFilename()).toMatch(/^diet-backup-\d{4}-\d{2}-\d{2}-rescue\.json$/);
  expect(JSON.parse(readFileSync(await download.path(), 'utf8'))).toMatchObject({
    payload: { kind: 'rescue' },
  });
  await expect(card(page)).toContainText(download.suggestedFilename());
  audit.verify();
});

test('HS-30: delete all empties every database, cache and storage of the origin except the offline copy, in real Chromium', async ({
  page,
}) => {
  await seedOnboarded(page);
  await waitForServiceWorkerControl(page);
  await seedFromFixture(page);
  await page.evaluate(async () => {
    localStorage.setItem('example-key', 'example value');
    sessionStorage.setItem('example-key', 'example value');
    const cache = await caches.open('example-runtime-cache');
    await cache.put('./example-cached.txt', new Response('example'));
    await new Promise<void>((resolve, reject) => {
      const request = indexedDB.open('example-extra', 1);
      request.onupgradeneeded = () => {
        request.result.createObjectStore('things');
      };
      request.onsuccess = () => {
        request.result.close();
        resolve();
      };
      request.onerror = () => {
        reject(new Error('open failed'));
      };
    });
  });
  const probe = () =>
    page.evaluate(async () => ({
      databases: (await indexedDB.databases()).map((d) => d.name).sort(),
      caches: await caches.keys(),
      local: localStorage.length,
      session: sessionStorage.length,
      worker: (await navigator.serviceWorker.getRegistration())?.active?.scriptURL ?? null,
    }));
  const before = await probe();
  expect(before.databases).toEqual(['diet', 'example-extra']);
  expect(before.caches).toContain('example-runtime-cache');

  await deleteAll(page);
  const after = await probe();
  expect(after.databases).toEqual(['diet']);
  expect(after.caches.length).toBeGreaterThan(0);
  for (const name of after.caches) expect(name).toMatch(/^workbox-precache/);
  expect(after.local).toBe(0);
  expect(after.session).toBe(0);
  expect(after.worker).toMatch(/\/Diet\/sw\.js$/);
  const records = await readDatabase(page);
  for (const store of BACKED_UP) {
    expect(records[store]?.length, store).toBe(SEEDED.includes(store) ? 1 : 0);
  }
});

test('HS-30, two tabs: delete all in one tab closes the records in the other, which says to reload', async ({
  context,
}) => {
  const a = await context.newPage();
  await seedOnboarded(a);
  await waitForServiceWorkerControl(a);
  await seedFromFixture(a);
  const b = await context.newPage();
  await b.goto('./');
  await expect(heading(b)).toHaveText('Today');

  await deleteAll(a);
  await expect(b.getByTestId('storage-failure')).toHaveText(
    privacy.storageFailure['reload-needed'],
  );
  expect(await count(a, 'weights')).toBe(0);
  await b.reload();
  await expect(heading(b)).toHaveText(onboarding.welcome.title);
});

test('two tabs: a restore waits for a busy second tab to stop writing, so nothing is written on top of the restored records (section 7.5)', async ({
  context,
}) => {
  const a = await context.newPage();
  await seedOnboarded(a);
  await waitForServiceWorkerControl(a);
  await openSettings(a);

  // The second tab: the app itself, plus a raw writer in the same page that holds the lock in
  // shared mode and writes weigh-ins in a tight loop. Told about the restore, it notices only
  // 300 ms later, as a busy tab might, then closes its connection and lets go of the lock.
  const b = await context.newPage();
  await b.goto('./');
  await expect(heading(b)).toHaveText('Today');
  const template = snapshotV1.weights[3];
  await b.evaluate((row) => {
    const state = { writes: 0, done: false };
    (window as unknown as { dietBusyTab: typeof state }).dietBusyTab = state;
    void navigator.locks.request('diet-db-open', { mode: 'shared' }, async () => {
      const db = await new Promise<IDBDatabase>((resolve, reject) => {
        const request = indexedDB.open('diet');
        request.onsuccess = () => {
          resolve(request.result);
        };
        request.onerror = () => {
          reject(new Error('open failed'));
        };
      });
      const told = { stop: false };
      const channel = new BroadcastChannel('diet-db');
      channel.onmessage = () => {
        setTimeout(() => {
          told.stop = true;
        }, 300);
      };
      while (!told.stop) {
        await new Promise<void>((resolve) => {
          const tx = db.transaction(['weights'], 'readwrite');
          tx.objectStore('weights').put({
            ...row,
            id: `00000000-0000-4000-8000-${String(900000000000 + state.writes)}`,
            kg: 70,
          });
          tx.oncomplete = () => {
            resolve();
          };
          tx.onerror = () => {
            resolve();
          };
        });
        state.writes += 1;
      }
      channel.close();
      db.close();
      state.done = true;
    });
  }, template);
  await expect
    .poll(() =>
      b.evaluate(
        () => (window as unknown as { dietBusyTab: { writes: number } }).dietBusyTab.writes,
      ),
    )
    .toBeGreaterThan(5);

  await chooseBackup(a, 'diet-backup-2000-03-01.json', plainReferenceEnvelopeV1());
  await replaceAndReload(a);
  expect(
    await b.evaluate(
      () => (window as unknown as { dietBusyTab: { done: boolean } }).dietBusyTab.done,
    ),
  ).toBe(true);
  const restored = await readDatabase(a);
  for (const store of BACKED_UP) {
    expect(restored[store]?.length, store).toBe(
      (snapshotV1 as unknown as Record<string, unknown[]>)[store]?.length,
    );
  }
  const ids = new Set(snapshotV1.weights.map((w) => w.id));
  expect((restored['weights'] as { id: string }[]).every((w) => ids.has(w.id))).toBe(true);
  // The app in the second tab closed its records too.
  await expect(b.getByTestId('storage-failure')).toHaveText(
    privacy.storageFailure['reload-needed'],
  );
});

test('"Export what is on this phone first", "Export a backup first" and "Back up now" bring the export panel into view with focus on the lock switch', async ({
  page,
}) => {
  await seedOnboarded(page);
  await seedFromFixture(page);
  const lock = card(page).getByRole('switch', { name: privacy.exportBackup.lockLabel });

  // Today's reminder (the fixture's last backup is long ago).
  await page.getByRole('button', { name: privacy.backupReminder.backUpNow }).click();
  await expect(heading(page)).toHaveText('Settings');
  await expect(lock).toBeInViewport();
  await expect(lock).toBeFocused();

  // Restore over records the file lacks.
  await page.reload();
  await expect(heading(page)).toHaveText('Settings');
  await writeRaw(page, 'weights', [
    { ...snapshotV1.weights[3], id: '00000000-0000-4000-8000-000000009999' },
  ]);
  await chooseBackup(page, 'diet-backup-2000-03-01.json', plainReferenceEnvelopeV1());
  const confirm = card(page).getByTestId('restore-confirm');
  await expect(confirm).toContainText(privacy.importBackup.missingOne);
  await confirm.getByRole('button', { name: privacy.importBackup.exportFirst }).click();
  await expect(lock).toBeInViewport();
  await expect(lock).toBeFocused();

  // Delete-all's first step.
  await page.reload();
  await expect(heading(page)).toHaveText('Settings');
  await card(page).getByRole('button', { name: privacy.backupCard.deleteAllAction }).click();
  await card(page).getByRole('button', { name: privacy.deleteAll.exportFirst }).click();
  await expect(lock).toBeInViewport();
  await expect(lock).toBeFocused();
});

test('PWA-06: Settings shows the result of navigator.storage.persisted()', async ({ page }) => {
  await seedOnboarded(page);
  await openSettings(page);
  const status = card(page).getByTestId('backup-storage-status');
  await expect(status).not.toHaveText(privacy.storageStatus.checking);
  const persisted = await page.evaluate(() => navigator.storage.persisted());
  await expect(status).toHaveText(
    persisted ? privacy.storageStatus.protected : privacy.storageStatus.notProtected,
  );
  await goTo(page, 'About');
  await expect(page.getByTestId('storage-protection')).toHaveText(
    persisted ? privacy.storageStatus.protected : privacy.storageStatus.notProtected,
  );
});
