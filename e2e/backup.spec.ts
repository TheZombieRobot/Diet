import { readFileSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';
import { privacy } from '../packages/core/src/copy/health';
import {
  lockedReferenceEnvelopeV1,
  plainReferenceEnvelopeV1,
  REFERENCE_PHRASE_V1,
  snapshotV1,
} from '../packages/test-fixtures/src/index';
import { goTo, heading, recordPolicyViolations, waitForServiceWorkerControl } from './support/app';
import { appOrigin, expectOnlyOwnOrigin, record, type Seen } from './support/network';

// Backup in the real browser (storage spec sections 10 to 12; section 16 tests 43 to 45; BK-01,
// BK-02, HS-14, HS-15, PWA-06): a real download, the real file chooser, delete-all and restore,
// online and offline, with every request audited. The files are synthetic (the version-1
// fixture) and live only in Playwright's temporary download folder.

const BACKED_UP = Object.keys(snapshotV1);

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

/** Replace, then wait for the app to load again on Today. */
async function replaceAndReload(page: Page): Promise<void> {
  const confirm = card(page).getByTestId('restore-confirm');
  await expect(confirm).toBeVisible();
  await Promise.all([
    page.waitForEvent('load'),
    confirm.getByRole('button', { name: privacy.importBackup.replace }).click(),
  ]);
  await expect(heading(page)).toHaveText('Today');
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
  await expect(card(page).getByText(privacy.exportBackup.canYouSeeIt)).toBeVisible();
  await card(page).getByRole('button', { name: privacy.exportBackup.yes }).click();
  await expect(card(page).getByTestId('last-backup')).toHaveText(
    /^Last backup made \d{1,2} \w+ \d{4}$/,
  );
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
  await expect(heading(page)).toHaveText('Today');
}

test('BK-01 / HS-14: restore, export, delete all and restore again, with every record back and no request outside the app', async ({
  page,
  context,
  baseURL,
}) => {
  const seen: Seen[] = [];
  context.on('request', record(seen));
  const violations = await recordPolicyViolations(context);
  await page.goto('./');
  await waitForServiceWorkerControl(page);

  // Seed every backed-up store from the synthetic fixture by restoring it.
  await chooseBackup(page, 'diet-backup-2000-03-01.json', plainReferenceEnvelopeV1());
  await replaceAndReload(page);
  expect(await count(page, 'weights')).toBe(snapshotV1.weights.length);

  const exported = await exportPlain(page);
  expect(JSON.parse(exported)).toMatchObject({ version: 1, encrypted: false });
  const before = await readDatabase(page);
  expect(before['grocery_lists']).toEqual(snapshotV1.grocery_lists);

  await deleteAll(page);
  await openSettings(page);
  expect(await count(page, 'weights')).toBe(0);
  expect(await count(page, 'beverages')).toBe(1);

  await chooseBackup(page, 'diet-backup-2000-03-01.json', exported);
  await replaceAndReload(page);
  expect(await readDatabase(page)).toEqual(before);

  expectOnlyOwnOrigin(seen, appOrigin(baseURL));
  expect(violations).toEqual([]);
});

test('BK-02: a wrong password says so and imports nothing; the right one restores the file', async ({
  page,
}) => {
  await page.goto('./');
  await chooseBackup(page, 'diet-backup-2000-03-01-locked.json', lockedReferenceEnvelopeV1());
  const field = card(page).getByLabel(privacy.importBackup.passwordLabel);
  await expect(field).toHaveAttribute('autocomplete', 'current-password');
  await field.fill('not the reference phrase');
  await card(page).getByRole('button', { name: privacy.importBackup.unlock }).click();
  await expect(card(page).getByRole('alert')).toHaveText(
    privacy.backupErrors['wrong-password-or-damaged'],
  );
  expect(await count(page, 'weights')).toBe(0);
  const phrase = REFERENCE_PHRASE_V1;
  await field.fill(phrase);
  await card(page).getByRole('button', { name: privacy.importBackup.unlock }).click();
  await replaceAndReload(page);
  expect(await count(page, 'weights')).toBe(snapshotV1.weights.length);
});

test('offline: export, delete all and restore work with no network at all', async ({
  page,
  context,
  baseURL,
}) => {
  await page.goto('./');
  await waitForServiceWorkerControl(page);
  await chooseBackup(page, 'diet-backup-2000-03-01.json', plainReferenceEnvelopeV1());
  await replaceAndReload(page);

  await context.setOffline(true);
  const seen: Seen[] = [];
  context.on('request', record(seen));
  const failed: string[] = [];
  context.on('requestfailed', (request) => failed.push(request.url()));
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
  await chooseBackup(page, 'diet-backup-2000-03-01.json', exported);
  await replaceAndReload(page);
  expect(await readDatabase(page)).toEqual(before);

  expect(fromNetwork).toEqual([]);
  expect(failed).toEqual([]);
  expectOnlyOwnOrigin(seen, appOrigin(baseURL));
});

test('HS-14: an unchecked rescue copy after a failed self-check makes no request either', async ({
  page,
  context,
  baseURL,
}) => {
  await page.goto('./');
  await openSettings(page);
  // A row the app itself would never write, put there with raw IndexedDB.
  const weight = snapshotV1.weights[0];
  await page.evaluate(
    (row) =>
      new Promise<void>((resolve, reject) => {
        const request = indexedDB.open('diet');
        request.onsuccess = () => {
          const db = request.result;
          const tx = db.transaction(['weights'], 'readwrite');
          tx.objectStore('weights').put(row);
          tx.oncomplete = () => {
            db.close();
            resolve();
          };
          tx.onerror = () => {
            reject(new Error('write failed'));
          };
        };
      }),
    { ...weight, kg: 5 },
  );
  const seen: Seen[] = [];
  context.on('request', record(seen));
  const violations = await recordPolicyViolations(context);

  await card(page).getByRole('button', { name: privacy.backupCard.exportAction }).click();
  await card(page).getByRole('switch', { name: privacy.exportBackup.lockLabel }).uncheck();
  await card(page).getByRole('button', { name: privacy.exportBackup.saveFile }).click();
  await expect(card(page).getByRole('alert')).toHaveText(
    'The backup could not be checked: weights kg failed range',
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
  expectOnlyOwnOrigin(seen, appOrigin(baseURL));
  expect(violations).toEqual([]);
});

test('PWA-06: Settings shows the result of navigator.storage.persisted()', async ({ page }) => {
  await page.goto('./');
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
