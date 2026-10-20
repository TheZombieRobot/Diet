import { expect, type Page, test } from '@playwright/test';
import { onboarding, privacy, weight } from '../packages/core/src/copy/health';
import { buildBackupPayload, plainBackupText } from '../packages/core/src/index';
import { onDay, WEIGHT_SCENARIOS, weightScenario } from '../packages/test-fixtures/src/index';
import { goTo, heading } from './support/app';
import { restoreSnapshot } from './support/scenario';

// Restore and delete all with two tabs open on Kickstart records, in the production build (full
// review F8, F12; HS-27, HS-30): a stop-sign answer saved in one tab while the other shows a
// restore's confirmation is never erased, and a pre-start "yes" is a record that every tab shows
// and delete all removes everywhere. Synthetic scenarios, restored onto a new phone with the clock
// fixed at the scenario's moment.

test.use({ timezoneId: 'Pacific/Auckland' });

const region = (page: Page, name: string) => page.getByRole('region', { name, exact: true });
const card = (page: Page) => page.getByRole('region', { name: privacy.backupCard.title });

/** A tab on the same records, with the clock at the scenario's moment. */
async function openTab(page: Page, now: string): Promise<void> {
  await page.clock.setFixedTime(new Date(now));
  await page.goto('./');
}

async function answer(page: Page, yesTo: string): Promise<void> {
  for (const question of [
    weight.check.dizzyOnStanding,
    weight.check.palpitations,
    weight.check.crampsNotSettling,
    weight.check.faintAtWork,
  ]) {
    await page
      .getByRole('radiogroup', { name: question })
      .getByRole('radio', { name: question === yesTo ? weight.check.yes : weight.check.no })
      .check();
  }
}

async function deleteAll(page: Page): Promise<void> {
  await goTo(page, 'Settings');
  await card(page).getByRole('button', { name: privacy.backupCard.deleteAllAction }).click();
  await card(page).getByRole('button', { name: privacy.deleteAll.next }).click();
  await Promise.all([
    page.waitForEvent('load'),
    card(page).getByRole('button', { name: privacy.deleteAll.confirm }).click(),
  ]);
  await expect(heading(page)).toHaveText(onboarding.welcome.title);
}

test('F12: a stop-sign answer saved in another tab while the restore confirmation is open stops Replace; the confirmation comes back and the answer is kept', async ({
  context,
}) => {
  const seen = onDay(WEIGHT_SCENARIOS.K42, 19);
  const a = await context.newPage();
  await openTab(a, seen.now);
  await restoreSnapshot(a, weightScenario(seen), seen.now);
  // The same records as a file, made before the answer below.
  const file = plainBackupText(
    buildBackupPayload(weightScenario(seen), {
      kind: 'backup',
      exportedAt: seen.now,
      appVersion: '0.1.0',
    }),
  );
  await goTo(a, 'Settings');
  await card(a).getByRole('button', { name: privacy.backupCard.restoreAction }).click();
  const [chooser] = await Promise.all([
    a.waitForEvent('filechooser'),
    card(a).getByRole('button', { name: privacy.importBackup.chooseFile }).click(),
  ]);
  await chooser.setFiles({
    name: 'diet-backup-2000-02-19.json',
    mimeType: 'application/json',
    buffer: Buffer.from(file),
  });
  const confirm = a.getByTestId('restore-confirm');
  await expect(confirm).toBeVisible();

  const b = await context.newPage();
  await openTab(b, seen.now);
  await region(b, weight.extension.label)
    .getByRole('button', { name: weight.extension.extend })
    .click();
  await answer(b, weight.check.palpitations);
  await b.getByRole('button', { name: weight.check.confirmExtend }).click();
  await expect(b.getByRole('status').filter({ hasText: weight.extension.stopSign })).toBeVisible();

  await confirm.getByRole('button', { name: privacy.importBackup.replace }).click();
  await expect(
    a.getByRole('alert').filter({ hasText: privacy.importBackup.changedSinceConfirm }),
  ).toBeVisible();
  await expect(confirm.getByTestId('restore-summary')).toContainText(
    privacy.importBackup.kickstartKept,
  );
  await Promise.all([
    a.waitForEvent('load'),
    confirm.getByRole('button', { name: privacy.importBackup.replace }).click(),
  ]);
  await expect(heading(a)).toHaveText('Today');
  const stopSigns = region(a, weight.stopSigns.label);
  await expect(stopSigns.getByText(weight.stopSigns.afterCheckRunning)).toBeVisible();
  await expect(region(a, weight.extension.label)).toHaveCount(0);
});

test('HS-30 across tabs (F8): a pre-start "yes" is a record every tab shows; delete all in one tab clears the other tab’s storage, and nothing comes back after setting up again', async ({
  context,
}) => {
  const seen = onDay(WEIGHT_SCENARIOS.PENDING, 1);
  const guidance = (page: Page) =>
    region(page, weight.start.pendingLabel).filter({ hasText: weight.start.stopSign });
  const b = await context.newPage();
  await openTab(b, seen.now);
  await restoreSnapshot(b, weightScenario(seen), seen.now);
  await region(b, weight.start.pendingLabel)
    .getByRole('button', { name: weight.start.pendingAction })
    .click();
  await answer(b, weight.check.palpitations);
  await b.getByRole('button', { name: weight.check.confirmStart }).click();
  await expect(guidance(b).locator('a[href="tel:111"]')).toBeVisible();
  await b.evaluate(() => {
    sessionStorage.setItem('example-key', 'example value');
  });

  // A tab that never saw the answer shows its guidance: it is in the records.
  const a = await context.newPage();
  await openTab(a, seen.now);
  await expect(guidance(a).locator('a[href="tel:111"]')).toBeVisible();
  await deleteAll(a);
  await a.close();
  await expect(b.getByTestId('storage-failure')).toHaveText(
    privacy.storageFailure['reload-needed'],
  );
  expect(await b.evaluate(() => sessionStorage.length)).toBe(0);

  await b.reload();
  await expect(heading(b)).toHaveText(onboarding.welcome.title);
  await restoreSnapshot(b, weightScenario(seen), seen.now);
  await expect(
    region(b, weight.start.pendingLabel).getByRole('button', { name: weight.start.pendingAction }),
  ).toBeVisible();
  await expect(guidance(b)).toHaveCount(0);
});
