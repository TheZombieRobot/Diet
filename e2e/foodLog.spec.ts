import { expect, type Page, test } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { foodLog, foods, recipes, targets } from '../packages/core/src/copy/health';
import {
  goTo,
  heading,
  openRecipe,
  renderedText,
  seedOnboarded,
  SWEPT_RECIPE,
} from './support/app';

// The food log in the production build (item 23 design 5.5): FL-01 to FL-03, NN-04, H23b, C100.
// The shipped release has no food figures, so a recipe logs with every figure not known. Every
// entry is synthetic and lives only in the test's browser profile.

const copy = foodLog;
const main = (page: Page) => page.getByRole('main');
const panel = (page: Page, name: string) => page.getByRole('region', { name, exact: true });
const eaten = (page: Page) => page.getByRole('region', { name: copy.entries.label });

async function openAdd(page: Page, row: string): Promise<void> {
  await main(page)
    .getByRole('button', { name: new RegExp(`^${row}`) })
    .click();
}

/** A synthetic per-100 g label: `raw` meat with its figures, or an as-sold yoghurt (no zero figure). */
async function typeLabel(page: Page, kind: 'chicken' | 'yoghurt'): Promise<void> {
  const p = panel(page, copy.add.fromLabel);
  const chicken = kind === 'chicken';
  await p
    .getByLabel(copy.label.name, { exact: true })
    .fill(chicken ? 'Example chicken breast' : 'Example yoghurt');
  await p
    .getByRole('radiogroup', { name: copy.label.describes })
    .getByRole('radio', {
      name: new RegExp(
        `^${chicken ? copy.label.describesOptions.raw : copy.label.describesOptions['as-sold']}`,
      ),
    })
    .check();
  const figures: readonly [string, string, string][] = [
    ['Energy, kJ per 100 g', '460', '400'],
    ['Protein, g per 100 g', '23', '9.6'],
    ['Fat, total, g per 100 g', '2', '2.0'],
    ['Saturated fat, g per 100 g', '0.6', '1.3'],
    ['Carbohydrate (as on an NZ/AU label), g per 100 g', '0', '5.0'],
    ['Sugars, g per 100 g', '0', '4.8'],
    ['Sodium, mg per 100 g', '60', '45'],
  ];
  for (const [label, c, y] of figures) await p.getByLabel(label).fill(chicken ? c : y);
  await p.getByRole('checkbox', { name: copy.label.fibreNotOnLabel }).check();
}

/** How the food was weighed, in the amount step's own group. */
const weighed = (p: ReturnType<typeof panel>, option: string) =>
  p.getByRole('radiogroup', { name: copy.amount.weighed }).getByRole('radio', { name: option });

async function logIt(page: Page, from: string): Promise<void> {
  await panel(page, from).getByRole('button', { name: copy.add.logIt }).click();
  await expect(page.getByRole('region', { name: copy.add.label }).getByRole('status')).toHaveText(
    /^Logged /,
  );
}

test('E1 E2 FL-01 FL-03 NN-04: raw and cooked entries of one label stay distinct across a reload, and Today lists them with Label', async ({
  page,
}) => {
  await seedOnboarded(page);
  await goTo(page, 'Food log');
  await openAdd(page, copy.add.fromLabel);
  await typeLabel(page, 'chicken');
  const p = panel(page, copy.add.fromLabel);
  await p.getByLabel(copy.amount.grams).fill('200');
  await weighed(p, copy.amount.weighedOptions.raw).check();
  await logIt(page, copy.add.fromLabel);
  await openAdd(page, copy.add.again);
  await panel(page, copy.add.again).getByRole('button', { name: 'Example chicken breast' }).click();
  const again = panel(page, copy.add.again);
  await again.getByLabel(copy.amount.grams).fill('150');
  await weighed(again, copy.amount.weighedOptions.cooked).check();
  await again.getByLabel(copy.amount.before).fill('200');
  await logIt(page, copy.add.again);
  for (const reload of [false, true]) {
    if (reload) await page.reload();
    await expect(eaten(page).getByRole('button', { name: /200 g raw/ })).toContainText(
      foods.badges.label,
    );
    await expect(eaten(page).getByRole('button', { name: /150 g cooked/ })).toBeVisible();
  }
  await goTo(page, 'Today');
  const nutrition = page.getByRole('region', { name: targets.today.label });
  await expect(nutrition.getByRole('link', { name: /Example chicken breast/ })).toHaveCount(2);
  await expect(nutrition.getByRole('link').first()).toContainText(foods.badges.label);
});

test('E3 FL-02 H23b: a recipe logged with no figures shows no badge, and no page shows an unknown as 0', async ({
  page,
}) => {
  await seedOnboarded(page);
  // The yoghurt label has no known zero; the recipe has no figure at all.
  await goTo(page, 'Food log');
  await openAdd(page, copy.add.fromLabel);
  await typeLabel(page, 'yoghurt');
  const p = panel(page, copy.add.fromLabel);
  await p.getByLabel(copy.amount.grams).fill('150');
  await weighed(p, copy.amount.weighedOptions['as-sold']).check();
  await logIt(page, copy.add.fromLabel);
  await goTo(page, 'Recipes');
  await openRecipe(page, SWEPT_RECIPE);
  await page.getByRole('button', { name: recipes.actions.logAsEaten }).click();
  await page
    .getByRole('region', { name: recipes.actions.label })
    .getByRole('button', { name: copy.add.logIt })
    .click();
  await expect(page.getByText(`Logged ${SWEPT_RECIPE}.`)).toBeVisible();
  const zero = /\b0\s*(?:g|kJ|mg)\b/;
  expect(await renderedText(page)).not.toMatch(zero);
  await goTo(page, 'Food log');
  const row = eaten(page).getByRole('button', { name: /traybake/i });
  await expect(row.locator('.ui-chip')).toHaveCount(0);
  await row.click();
  await expect(eaten(page).getByText(copy.entries.noFigures)).toBeVisible();
  expect(await renderedText(page)).not.toMatch(zero);
  for (const screen of ['Today', 'Summary for your GP'] as const) {
    await goTo(page, screen);
    expect(await renderedText(page)).not.toMatch(zero);
  }
});

test('E4 C100 HS-14: the summary for a GP over two logged days is a text file named for today', async ({
  page,
}) => {
  await seedOnboarded(page);
  await goTo(page, 'Food log');
  for (let day = 0; day < 2; day++) {
    await page.getByRole('button', { name: copy.day.previous }).click();
    await openAdd(page, day === 0 ? copy.add.fromLabel : copy.add.again);
    if (day === 0) {
      await typeLabel(page, 'yoghurt');
    } else {
      await panel(page, copy.add.again).getByRole('button', { name: 'Example yoghurt' }).click();
    }
    const from = day === 0 ? copy.add.fromLabel : copy.add.again;
    const p = panel(page, from);
    await p.getByLabel(copy.amount.grams).fill('200');
    await weighed(p, copy.amount.weighedOptions['as-sold']).check();
    await p.getByLabel(copy.amount.time).fill('12:30');
    await logIt(page, from);
  }
  await page
    .getByRole('region', { name: copy.gp.linkTitle })
    .getByRole('link', { name: new RegExp(`^${copy.gp.linkTitle}`) })
    .click();
  await expect(heading(page)).toHaveText(copy.routeTitles.gpSummary);
  const summary = page.getByRole('region', { name: copy.gp.summaryLabel, exact: true });
  await expect(summary).toContainText('2 of 28');
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    summary.getByRole('button', { name: copy.gp.saveText }).click(),
  ]);
  expect(download.suggestedFilename()).toMatch(/^diet-gp-summary-\d{4}-\d{2}-\d{2}\.txt$/);
  const text = readFileSync(await download.path(), 'utf8');
  expect(text).toContain('Days with food logged: 2 of 28');
  // 200 g at 1.3 g per 100 g each day.
  expect(text).toContain('Saturated fat, average a day: 2.6 g');
  await expect(summary.getByRole('status')).toContainText(download.suggestedFilename());
});
