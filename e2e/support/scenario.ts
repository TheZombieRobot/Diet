import { expect, type Page } from '@playwright/test';
import { buildBackupPayload, plainBackupText, type Snapshot } from '../../packages/core/src/index';
import { alcohol, onboarding, privacy } from '../../packages/core/src/copy/health';
import { goTo, heading } from './app';

/**
 * Restores `snapshot` the way a new phone does (item 13; C53): Welcome, the alcohol notice, then
 * "Restore from a backup instead". The file holds a finished setup, so the reload opens Settings,
 * Readiness answers (E64), which says once that the records are back (F28); then Today. Items 14 and 21 restore their synthetic scenarios this way.
 */
export async function restoreSnapshot(
  page: Page,
  snapshot: Snapshot,
  exportedAt: string,
): Promise<void> {
  const text = plainBackupText(
    buildBackupPayload(snapshot, { kind: 'backup', exportedAt, appVersion: '0.1.0' }),
  );
  await expect(heading(page)).toHaveText(onboarding.welcome.title);
  await page.getByRole('button', { name: onboarding.frame.continue }).click();
  await page.getByRole('button', { name: alcohol.notice.acknowledge }).click();
  await page.getByRole('button', { name: onboarding.frame.restoreLink }).click();
  await expect(heading(page)).toHaveText(onboarding.frame.restoreTitle);
  const [chooser] = await Promise.all([
    page.waitForEvent('filechooser'),
    page.getByRole('button', { name: privacy.importBackup.chooseFile }).click(),
  ]);
  await chooser.setFiles({
    name: 'diet-backup-2000-02-01.json',
    mimeType: 'application/json',
    buffer: Buffer.from(text),
  });
  const confirm = page.getByTestId('restore-confirm');
  await expect(confirm).toBeVisible();
  // A new phone holds nothing of the owner's, however far setup got (F14, F22): no loss is
  // counted, and Replace is the first button.
  await expect(confirm.getByTestId('restore-summary')).toContainText(
    privacy.importBackup.freshPhone,
  );
  await expect(confirm.getByRole('button').first()).toHaveText(privacy.importBackup.replace);
  await Promise.all([
    page.waitForEvent('load'),
    confirm.getByRole('button', { name: privacy.importBackup.replace }).click(),
  ]);
  await expect(heading(page)).toHaveText('Readiness answers');
  await expect(
    page.getByRole('status').filter({ hasText: privacy.importBackup.restored }),
  ).toBeVisible();
  await goTo(page, 'Today');
}

/** Every row of a store, read with raw IndexedDB. */
export function storeRows<T>(page: Page, store: string): Promise<T[]> {
  return page.evaluate(
    (name) =>
      new Promise<T[]>((resolve, reject) => {
        const request = indexedDB.open('diet');
        request.onerror = () => {
          reject(new Error('open failed'));
        };
        request.onsuccess = () => {
          const db = request.result;
          const all = db.transaction(name, 'readonly').objectStore(name).getAll();
          all.onsuccess = () => {
            db.close();
            resolve(all.result as T[]);
          };
          all.onerror = () => {
            reject(new Error('read failed'));
          };
        };
      }),
    store,
  );
}
