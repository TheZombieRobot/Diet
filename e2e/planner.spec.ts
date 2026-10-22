import { expect, type Locator, type Page, test } from '@playwright/test';
import { planner } from '../packages/core/src/copy/health';
import { commerceRules, healthPhraseRules } from '../tools/scans/rules';
import { scanText } from '../tools/scans/scan';
import { goTo, renderedText, seedOnboarded, waitForServiceWorkerControl } from './support/app';
import { startAudit } from './support/network';

// The seven-day planner in the production build (item 22 design 6.4), over the shipped datasets:
// no food figures are loaded, so every planned figure reads "not known" and the planner fills
// nothing by itself. Synthetic records from a finished setup (every answer "no", 22:2, a rough
// guide). HS-20 for #/plan/today and #/plan/2000-01-03 is item 13's first-run spec, which
// deep-links to every DEEP_LINKS entry.

const region = (page: Page, name: string) => page.getByRole('region', { name, exact: true });
const slot = (page: Page, id: string) => page.getByTestId(`slot-${id}`);
/** Both refusals for a day whose energy is not known (item 18's and the planner's aim). */
const NOT_KNOWN = /the energy in some of its meals is not known yet/;

/** Merges `patch` into the stored profile (raw IndexedDB), then reloads. */
async function patchProfile(page: Page, patch: Readonly<Record<string, unknown>>): Promise<void> {
  await page.evaluate(
    (p) =>
      new Promise<void>((resolve, reject) => {
        const request = indexedDB.open('diet');
        request.onerror = () => {
          reject(new Error('open failed'));
        };
        request.onsuccess = () => {
          const db = request.result;
          const tx = db.transaction(['profile'], 'readwrite');
          const get = tx.objectStore('profile').get('singleton');
          get.onsuccess = () => {
            tx.objectStore('profile').put({ ...(get.result as object), ...p });
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
    patch,
  );
  await page.reload();
  await expect(page.getByRole('navigation', { name: 'Main' })).toBeVisible();
}

/** On a Day screen: chooses the first suggestion (or label-check recipe) for dinner. */
async function chooseDinner(page: Page, group: string): Promise<Locator> {
  await slot(page, 'dinner').getByRole('button', { name: planner.day.choose }).click();
  const picker = page.getByTestId('meal-picker');
  await picker
    .getByRole('radiogroup', { name: new RegExp(group) })
    .getByRole('radio')
    .first()
    .check();
  await picker.getByRole('button', { name: /^Add to / }).click();
  return picker;
}

/** The title in "Added {title}." once the meal is written. */
async function addedTitle(page: Page): Promise<string> {
  const added = page.getByText(/^Added .+\.$/);
  await expect(added).toBeVisible();
  return (await added.innerText()).replace(/^Added /, '').replace(/\.$/, '');
}

test('E1 PWA-04: offline, a dinner chosen for today through "+" Swap recipe is kept after a reload', async ({
  page,
  context,
}) => {
  await seedOnboarded(page);
  await waitForServiceWorkerControl(page);
  await context.setOffline(true);
  await goTo(page, 'Food');
  await expect(region(page, planner.week.label)).toBeVisible();
  await goTo(page, 'Today');
  await page.getByRole('button', { name: 'Quick actions' }).click();
  await page.locator('.ui-fab-panel').getByText('Swap recipe').click();
  await expect(region(page, planner.day.mealsLabel)).toBeVisible();
  // 22:2 (the seeded default): the 5 pm snack and dinner.
  await expect(slot(page, 'snack')).toContainText(planner.slots.snackAtFive);
  await expect(slot(page, 'breakfast')).toHaveCount(0);
  await chooseDinner(page, planner.picker.suggestions);
  const title = await addedTitle(page);
  await page.reload();
  await expect(slot(page, 'dinner')).toContainText(title);
  // HS-R18: with no food figures loaded, the day's energy reads "not known", never 0.
  const figures = region(page, planner.figures.label);
  await expect(figures).toContainText('not known');
  await expect(figures).not.toContainText(/\b0 kJ\b/);
});

test('E3 HS-14, E5 NU-06 HS-R18: the planner asks nothing of the network; with no figures loaded Fill fills no day', async ({
  page,
  context,
  baseURL,
  request,
}) => {
  const audit = await startAudit(context, request, baseURL);
  await seedOnboarded(page, './#/plan/today');
  await expect(region(page, planner.day.mealsLabel)).toBeVisible();
  await chooseDinner(page, planner.picker.suggestions);
  await addedTitle(page);

  await goTo(page, 'Food');
  const week = region(page, planner.week.label);
  await expect(week).toContainText(planner.week.noFillFigures);
  await week.getByRole('button', { name: planner.week.fill }).click();
  const fill = page.getByTestId('plan-fillWeek-panel');
  await expect(fill.getByRole('heading', { name: planner.fill.refusedHeading })).toBeVisible();
  await expect(fill).toContainText(NOT_KNOWN);
  await expect(fill.getByRole('heading', { name: planner.fill.proposedHeading })).toHaveCount(0);
  await expect(fill.getByRole('button', { name: planner.fill.use })).toBeDisabled();
  await fill.getByRole('button', { name: planner.fill.cancel }).click();

  await week.getByRole('button', { name: planner.week.copy }).click();
  const copy = page.getByTestId('plan-copyWeek-panel');
  await expect(copy).toContainText(NOT_KNOWN);
  await expect(copy.getByRole('button', { name: planner.copy.use })).toBeDisabled();
  await copy.getByRole('button', { name: planner.copy.cancel }).click();

  const budget = region(page, planner.budget.label);
  await budget.getByLabel(planner.budget.noteLabel).fill('Keep the week under $120');
  await budget.getByRole('button', { name: planner.budget.save }).click();
  await expect(budget.getByText(planner.budget.saved)).toBeVisible();
  await audit.verify();
});

test('E4 HS-R20, E7 HS-31: with peanuts listed, the label check names them and Cancel writes nothing; no planner view shows banned wording', async ({
  page,
}) => {
  await seedOnboarded(page);
  await patchProfile(page, { allergens: ['peanut'], budgetNote: 'Under $120 this week' });
  const rules = [...healthPhraseRules, ...commerceRules];
  const found: string[] = [];
  const sweep = async (where: string) => {
    found.push(
      ...scanText(where, await renderedText(page), rules).map((v) => `${where}: ${v.ruleId}`),
    );
  };

  await page.goto('./#/plan/today');
  await expect(region(page, planner.day.mealsLabel)).toBeVisible();
  await sweep('Day screen');
  await chooseDinner(page, planner.picker.checkLabelsLegend);
  const check = page.getByTestId('label-check');
  await expect(check).toContainText('peanuts');
  await expect(check.getByRole('listitem').first()).toBeVisible();
  await sweep('Day screen with the label check');
  await check.getByRole('button', { name: planner.labelCheck.cancel }).click();
  await expect(page.getByTestId('meal-picker')).toBeVisible();
  await sweep('Day screen with the meal picker');
  await page.reload();
  await expect(slot(page, 'dinner')).toContainText(planner.day.nothingPlanned);

  await chooseDinner(page, planner.picker.checkLabelsLegend);
  await page
    .getByTestId('label-check')
    .getByRole('button', { name: planner.labelCheck.confirm })
    .click();
  const title = await addedTitle(page);
  await page.reload();
  await expect(slot(page, 'dinner')).toContainText(title);

  await goTo(page, 'Food');
  // HS-16: the owner's own note is shown as typed, and it is the only "$" on the page; the sweep
  // skips text inside [data-owner-text], so the app's own strings are still checked.
  const budget = region(page, planner.budget.label);
  await expect(budget.locator('[data-owner-text]').first()).toContainText('$120');
  await sweep('Food with a planned week and a budget note');
  const week = region(page, planner.week.label);
  await week.getByRole('button', { name: planner.week.fill }).click();
  await expect(page.getByTestId('plan-fillWeek-panel')).toBeVisible();
  await sweep('Food with the fill preview');
  await page
    .getByTestId('plan-fillWeek-panel')
    .getByRole('button', { name: planner.fill.cancel })
    .click();
  await week.getByRole('button', { name: planner.week.copy }).click();
  await expect(page.getByTestId('plan-copyWeek-panel')).toBeVisible();
  await sweep('Food with the copy preview');
  expect(found).toEqual([]);
});
