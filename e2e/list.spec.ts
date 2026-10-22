import { expect, type Page, test } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { grocery } from '../packages/core/src/copy/health';
import { goTo, heading, seedOnboarded } from './support/app';
import { lowContrastText } from './support/contrast';
import { startAudit } from './support/network';

// The grocery list in the production build (item 24 design 5.6; LE1, LE2, LE4): a list made from a
// plan over item 20's shipped recipes and item 18's shipped catalogue, with the seeded silverbeet
// row given 300 g. Synthetic records written with raw IndexedDB after a finished setup.

/** Plans today and tomorrow, and sets the seeded silverbeet row to 300 g, then reloads. */
async function seedPlanAndGarden(page: Page): Promise<void> {
  await page.evaluate(
    () =>
      new Promise<void>((resolve, reject) => {
        const request = indexedDB.open('diet');
        request.onerror = () => {
          reject(new Error('open failed'));
        };
        request.onsuccess = () => {
          const db = request.result;
          const now = new Date();
          const local = (d: Date) =>
            `${String(d.getFullYear())}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
          const tomorrow = new Date(now.getTime() + 86_400_000);
          const at = now.toISOString();
          const meal = (slot: string, recipeId: string, householdServes: number) => ({
            slot,
            recipeId,
            myServes: 1,
            householdServes,
          });
          const tx = db.transaction(['plan_days', 'garden'], 'readwrite');
          tx.objectStore('plan_days').put({
            date: local(now),
            dietMode: 'balanced',
            meals: [meal('dinner', 'seed:recipe-chicken-silverbeet-traybake', 5)],
            eatingWindow: null,
            updatedAt: at,
          });
          tx.objectStore('plan_days').put({
            date: local(tomorrow),
            dietMode: 'balanced',
            meals: [
              meal('lunch', 'seed:recipe-sardine-avocado-cucumber-salad', 2),
              meal('dinner', 'seed:recipe-chicken-avocado-green-salad', 2),
            ],
            eatingWindow: null,
            updatedAt: at,
          });
          const rows = tx.objectStore('garden').getAll();
          rows.onsuccess = () => {
            for (const row of rows.result as Record<string, unknown>[]) {
              if (row['ingredientId'] === 'seed:silverbeet') {
                tx.objectStore('garden').put({ ...row, amount: 300, unit: 'g', updatedAt: at });
              }
            }
          };
          tx.oncomplete = () => {
            db.close();
            resolve();
          };
          tx.onerror = () => {
            reject(new Error('write failed'));
          };
        };
      }),
  );
  await page.reload();
  await expect(page.getByRole('navigation', { name: 'Main' })).toBeVisible();
}

const row = (page: Page, name: string) =>
  page.locator('.ui-tick-row').filter({ has: page.getByText(name, { exact: true }) });

/** A download's file name and text. */
async function download(page: Page, button: string): Promise<{ name: string; text: string }> {
  const [file] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: button, exact: true }).click(),
  ]);
  return { name: file.suggestedFilename(), text: readFileSync(await file.path(), 'utf8') };
}

test('LE1, LE2 GL-01, GL-02, GL-05 to GL-08, NN-06, HS-14: make the list, tick, add, reload, export offline and change the store', async ({
  page,
  context,
  request,
  baseURL,
}) => {
  const audit = await startAudit(context, request, baseURL);
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await seedOnboarded(page);
  await seedPlanAndGarden(page);
  await goTo(page, 'List');
  await page.getByRole('button', { name: grocery.empty.fromPlan }).click();
  await page.getByRole('button', { name: grocery.build.make }).click();
  await expect(page.getByText(grocery.build.made)).toBeVisible();

  // NN-06: 500 g planned, 300 g in the garden: 200 g to buy, as one bunch; GL-01: one avocado line.
  const silverbeet = row(page, 'Silverbeet');
  await expect(silverbeet.locator('.ui-tick-row__amount')).toHaveText('1 bunch');
  await expect(silverbeet).toContainText('Need 200 g · 300 g from garden, as listed on');
  await expect(row(page, 'Avocado').locator('.ui-tick-row__amount')).toHaveText('2 avocados');
  await expect(row(page, 'Avocado')).toHaveCount(1);

  // Options opens the line's panel and ticks nothing.
  await page.getByRole('button', { name: 'Options for Avocado' }).click();
  await expect(page.getByLabel(grocery.price.field)).toBeVisible();
  await expect(page.getByRole('checkbox', { name: /^Avocado/ })).not.toBeChecked();
  await page.getByRole('button', { name: grocery.panel.close }).click();
  await page.getByRole('checkbox', { name: /^Avocado/ }).click();
  await expect(page.getByText(/^1 of \d+ ticked$/)).toBeVisible();
  await page.getByRole('button', { name: grocery.actions.add }).click();
  await page.getByLabel(grocery.manual.name, { exact: true }).fill('Example batteries');
  await page.getByRole('button', { name: grocery.manual.add }).click();
  await expect(page.getByText('Example batteries', { exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByRole('checkbox', { name: /^Avocado/ })).toBeChecked();
  await expect(page.getByText('Example batteries', { exact: true })).toBeVisible();

  // LE4: the populated list at phone width, light and dark: contrast and no sideways scroll.
  await page.setViewportSize({ width: 360, height: 800 });
  for (const colorScheme of ['light', 'dark'] as const) {
    await page.emulateMedia({ colorScheme });
    const { low } = await lowContrastText(page, `List (${colorScheme})`);
    expect(low).toEqual([]);
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    ).toBe(true);
  }

  // GL-06, GL-07: offline, the exports are made on the phone.
  await context.setOffline(true);
  await page.getByRole('button', { name: grocery.exports.copy }).click();
  await expect(page.getByText(grocery.exports.copied)).toBeVisible();
  const copied = await page.evaluate(() => navigator.clipboard.readText());
  expect(copied.split('\n')).toContain('Silverbeet, 1 bunch');
  expect(copied).toContain('Example batteries');
  const csv = await download(page, grocery.exports.csv);
  const json = await download(page, grocery.exports.json);
  expect(csv.name).toMatch(/^diet-grocery-list-\d{4}-\d{2}-\d{2}\.csv$/);
  expect(json.name).toBe(csv.name.replace(/\.csv$/, '.json'));
  const [header, first] = csv.text.replace(/^\uFEFF/, '').split('\r\n');
  expect(header?.split(',')).toHaveLength(16);
  expect(first?.startsWith("PAK'nSAVE Pāpāmoa,")).toBe(true);
  expect((JSON.parse(json.text) as { storeName: string }).storeName).toBe("PAK'nSAVE Pāpāmoa");
  await context.setOffline(false);

  // LE2 GL-08: the store setting changes the List header and the CSV.
  await goTo(page, 'Store');
  await page.getByLabel(grocery.store.field).fill('Example store');
  await page.getByRole('button', { name: grocery.store.save, exact: true }).click();
  await expect(page.getByText(grocery.store.saved)).toBeVisible();
  await goTo(page, 'List');
  await expect(heading(page)).toHaveText('List');
  await expect(page.locator('.ui-store-name')).toHaveText('Example store');
  const after = await download(page, grocery.exports.csv);
  expect(after.text.split('\r\n')[1]?.startsWith('Example store,')).toBe(true);
  await audit.verify();
});
