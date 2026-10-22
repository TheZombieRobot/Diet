import { expect, type Locator, type Page, test } from '@playwright/test';
import { fasting, planner } from '../packages/core/src/copy/health';
import { onDay, WEIGHT_SCENARIOS, weightScenario } from '../packages/test-fixtures/src/index';
import { commerceRules, healthPhraseRules } from '../tools/scans/rules';
import { scanText } from '../tools/scans/scan';
import { goTo, renderedText, seedOnboarded, waitForServiceWorkerControl } from './support/app';
import { startAudit } from './support/network';
import { restoreSnapshot } from './support/scenario';

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

test('E7: the Day screen, a planned meal and the picker stay inside a narrow or zoomed screen; every control is 48 px', async ({
  page,
}) => {
  await page.setViewportSize({ width: 360, height: 780 });
  await seedOnboarded(page, './#/plan/today');
  await expect(region(page, planner.day.mealsLabel)).toBeVisible();
  await chooseDinner(page, planner.picker.suggestions);
  await addedTitle(page);
  // With peanuts listed, every seed recipe is in "Check labels first", each with its chip.
  await patchProfile(page, { allergens: ['peanut'] });
  const small = () =>
    page.locator('a:visible, button:visible').evaluateAll((controls) =>
      controls.flatMap((c) => {
        const box = c.getBoundingClientRect();
        return box.width < 48 || box.height < 48
          ? [`${c.textContent} ${box.width}x${box.height}`]
          : [];
      }),
    );
  const openPicker = async () => {
    await slot(page, 'snack').getByRole('button', { name: planner.day.choose }).click();
    await expect(
      page.getByRole('radiogroup', { name: new RegExp(planner.picker.checkLabelsLegend) }),
    ).toBeVisible();
  };
  await page.goto('./#/plan/today');
  await expect(slot(page, 'dinner').locator('.ui-plan-meal__title')).toBeVisible();
  expect(await small()).toEqual([]);
  await openPicker();
  expect(await small()).toEqual([]);

  const problems: string[] = [];
  // 320 px: a small phone. 195 and 180 px: a 390 px and a 360 px phone at 200% zoom.
  for (const width of [320, 195, 180]) {
    await page.setViewportSize({ width, height: 640 });
    for (const where of ['Day screen', 'picker']) {
      // A reload closes the picker (the address does not change).
      await page.reload();
      await expect(region(page, planner.day.mealsLabel)).toBeVisible();
      if (where === 'picker') await openPicker();
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      );
      if (overflow > 0)
        problems.push(`${where} at ${width} px: scrolls sideways by ${overflow} px`);
    }
  }
  expect(problems).toEqual([]);
});

test.describe('E6: a Kickstart started 16 days ago, with the untouched 23:1 default', () => {
  test.use({ timezoneId: 'Pacific/Auckland' });

  test('one meal a day to day 21, the 5 pm snack and dinner from day 22; the Fast card matches', async ({
    page,
  }) => {
    // Scenario day 17 (Thursday 17 February 2000) at 09:00: day 21 is next Monday.
    const seen = onDay({ ...WEIGHT_SCENARIOS.K10, ratesKgPerWeek: [0] }, 17);
    await page.clock.setFixedTime(new Date(seen.now));
    await page.goto('./');
    await restoreSnapshot(page, weightScenario(seen), seen.now);
    await goTo(page, 'Today');
    await expect(region(page, fasting.card.label)).toContainText('6:00 pm – 7:00 pm');
    const days = [
      ['2000-02-17', '6:00 pm – 7:00 pm', false],
      ['2000-02-21', '6:00 pm – 7:00 pm', false],
      ['2000-02-22', '5:00 pm – 7:00 pm', true],
    ] as const;
    for (const [date, range, snack] of days) {
      await page.goto(`./#/plan/${date}`);
      await expect(region(page, planner.day.windowLabel)).toContainText(`Eat ${range}.`);
      await expect(slot(page, 'dinner')).toContainText(planner.slots.dinner);
      if (snack) await expect(slot(page, 'snack')).toContainText(planner.slots.snackAtFive);
      else await expect(slot(page, 'snack')).toHaveCount(0);
    }
  });
});
