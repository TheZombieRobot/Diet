import { expect, type Page, test } from '@playwright/test';
import { foods, recipes } from '../packages/core/src/copy/health';
import { overrideFiguresFor } from '../packages/core/src/recipes/testData';
import { commerceRules, healthPhraseRules } from '../tools/scans/rules';
import { scanText } from '../tools/scans/scan';
import {
  goTo,
  heading,
  openRecipe,
  renderedText,
  seedOnboarded,
  SWEPT_RECIPE,
} from './support/app';

// The recipe screens in the production build (item 20 design 8.4). Before checklist item 10 no
// food figure is loaded, so every recipe reads "not known" with no badge (E1). The swap tests give
// the patties' ingredients synthetic owner corrections with raw IndexedDB, as no copy can be
// stored without figures (design 6.4). Every record is synthetic.

const PATTIES = 'Salmon and silverbeet patties';
const BARE_STYLES: readonly string[] = Object.values(recipes.chips.style);

/** Every recipe's title, from the list's links in order. */
async function recipeTitles(page: Page): Promise<string[]> {
  await goTo(page, 'Recipes');
  return page
    .locator('main .ui-link-row__title')
    .evaluateAll((titles) => titles.map((t) => t.textContent));
}

async function checkPage(page: Page, title: string, found: string[]): Promise<void> {
  await goTo(page, 'Recipes');
  await page.getByRole('link', { name: new RegExp(title.replace(/[()]/g, '.')) }).click();
  await expect(heading(page)).toHaveText(title);
  const card = page.getByRole('region', { name: recipes.nutrition.label });
  await expect(card.getByText(foods.totals.noneLoaded)).toBeVisible();
  // No badge chip, no heart-smart line and no bare carb style: nothing is worked out.
  await expect(card.locator('.ui-chip')).toHaveCount(0);
  const chips = await page.locator('main .ui-chip').allInnerTexts();
  for (const chip of chips) if (BARE_STYLES.includes(chip)) found.push(`${title}: chip ${chip}`);
  const main = await page.getByRole('main').innerText();
  if (main.includes('Heart-smart')) found.push(`${title}: heart-smart`);
  found.push(
    ...scanText(title, await renderedText(page), [...healthPhraseRules, ...commerceRules]).map(
      (v) => `${title}: ${v.ruleId}`,
    ),
  );
}

test('E1 NU-10 HS-37 HS-39 PWA-03: all 30 recipe pages, online then offline, show no figure, badge or bare style', async ({
  page,
  context,
}) => {
  test.setTimeout(240_000);
  await seedOnboarded(page);
  const titles = await recipeTitles(page);
  expect(titles).toHaveLength(30);
  const found: string[] = [];
  for (const title of titles) await checkPage(page, title, found);
  // Offline after the first load: the pages still render from the app's own files.
  await context.setOffline(true);
  await page.reload();
  for (const title of titles.slice(0, 3)) await checkPage(page, title, found);
  expect(found).toEqual([]);
});

/** Profile allergens and the patties' synthetic corrections, written as seedOnboarded writes rows. */
async function seedPatties(page: Page): Promise<void> {
  const ids = [
    'seed:canned-salmon',
    'seed:eggs',
    'seed:silverbeet',
    'seed:spring-onion',
    'seed:almond-meal',
    'seed:lemon',
    'seed:olive-oil',
    'seed:black-pepper',
    'seed:sunflower-seeds',
  ];
  await page.evaluate(
    (overrides) =>
      new Promise<void>((resolve, reject) => {
        const request = indexedDB.open('diet');
        request.onerror = () => {
          reject(new Error('open failed'));
        };
        request.onsuccess = () => {
          const db = request.result;
          const tx = db.transaction(['profile', 'ingredient_overrides'], 'readwrite');
          const get = tx.objectStore('profile').get('singleton');
          get.onsuccess = () => {
            tx.objectStore('profile').put({ ...(get.result as object), allergens: ['tree-nut'] });
          };
          for (const row of overrides) tx.objectStore('ingredient_overrides').put(row);
          tx.oncomplete = () => {
            db.close();
            resolve();
          };
          tx.onerror = () => {
            reject(new Error('write failed'));
          };
        };
      }),
    overrideFiguresFor(ids),
  );
  await page.reload();
  await expect(page.getByRole('navigation', { name: 'Main' })).toBeVisible();
}

const conflict = (page: Page) =>
  page.getByRole('region', { name: recipes.detail.atAGlance }).getByRole('alert');
const allergensCard = (page: Page) => page.getByRole('region', { name: recipes.allergens.label });

test('E2 FL-06 HS-24 / E3: swapping away the almond meal keeps tree nuts; going back restores the original', async ({
  page,
}) => {
  await seedOnboarded(page);
  await seedPatties(page);
  await goTo(page, 'Recipes');
  await page.getByRole('link', { name: new RegExp(PATTIES) }).click();
  await expect(heading(page)).toHaveText(PATTIES);
  await expect(conflict(page)).toContainText('tree nuts');

  await page.getByRole('button', { name: recipes.actions.substitute }).click();
  await page.getByRole('radio', { name: /^Almond meal/ }).check();
  await page.getByRole('radio', { name: /^Sunflower seeds/ }).check();
  await page.getByRole('button', { name: 'Use Sunflower seeds' }).click();
  await expect(page.getByText(/^Swapped Almond meal for Sunflower seeds\./)).toBeVisible();
  await expect(page.getByText(recipes.chips.yourVersion).first()).toBeVisible();
  // No line now contains tree nuts, yet they are still listed, and the page still leads with them.
  await expect(conflict(page)).toContainText('tree nuts');
  await expect(allergensCard(page)).toContainText(
    'Listed because the recipe this was made from contains tree nuts.',
  );
  for (let i = 0; i < 4; i++)
    await page.getByRole('button', { name: recipes.ingredients.more }).click();
  await expect(allergensCard(page)).toContainText('tree nuts');
  await page.reload();
  await expect(conflict(page)).toContainText('tree nuts');
  await expect(allergensCard(page)).toContainText('tree nuts');

  // E3: back to the original, with its almond meal.
  await page.getByRole('button', { name: recipes.actions.removeVersion }).click();
  await page.getByRole('button', { name: recipes.remove.confirm }).click();
  await expect(page.getByText(recipes.remove.done)).toBeVisible();
  await expect(heading(page)).toHaveText(PATTIES);
  await expect(
    page.getByRole('region', { name: recipes.ingredients.label }).getByText('Almond meal'),
  ).toBeVisible();
});

test('a short screen at 200% text: every recipe page leaves room to read below the top bar', async ({
  page,
}) => {
  test.setTimeout(120_000);
  await seedOnboarded(page);
  await goTo(page, 'Recipes');
  const hrefs = await page
    .locator('main a.ui-link-row')
    .evaluateAll((links) => links.map((a) => a.getAttribute('href') ?? ''));
  expect(hrefs).toHaveLength(30);
  // A 360 x 740 phone at 200% text is 180 x 370 CSS pixels.
  await page.setViewportSize({ width: 180, height: 370 });
  const cramped: string[] = [];
  for (const href of hrefs) {
    await page.evaluate((hash) => {
      window.location.hash = hash;
    }, href);
    await expect(page.getByRole('region', { name: recipes.detail.atAGlance })).toBeVisible();
    // Scrolled into the page: the room between what the top bar still covers and the tab bar.
    const room = await page.evaluate(() => {
      window.scrollTo(0, 600);
      const top = document.querySelector('.ui-topbar')?.getBoundingClientRect().bottom ?? 0;
      const bottom = document.querySelector('.ui-tabbar')?.getBoundingClientRect().top ?? 0;
      return bottom - Math.max(0, top);
    });
    if (room < 150) cramped.push(`${href}: ${String(Math.round(room))} px`);
  }
  expect(cramped).toEqual([]);
});

test('ingredient names wrap at whole words on a zoomed screen', async ({ page }) => {
  await seedOnboarded(page);
  await page.setViewportSize({ width: 180, height: 640 });
  await openRecipe(page, SWEPT_RECIPE);
  const broken = await page.evaluate(() =>
    [...document.querySelectorAll('.ui-line__name')].flatMap((name) => {
      const text = name.firstChild;
      if (text === null || text.nodeType !== Node.TEXT_NODE) return [];
      const words: string[] = [];
      for (const match of (text.textContent ?? '').matchAll(/\S+/g)) {
        const range = document.createRange();
        range.setStart(text, match.index);
        range.setEnd(text, match.index + match[0].length);
        // A word drawn on two lines has two boxes.
        if (range.getClientRects().length > 1) words.push(match[0]);
      }
      return words;
    }),
  );
  expect(broken).toEqual([]);
});

test('Back keeps the owner’s place: the list’s scroll and row, and a recipe’s Cooking for', async ({
  page,
}) => {
  await page.setViewportSize({ width: 360, height: 740 });
  await seedOnboarded(page);
  await goTo(page, 'Recipes');
  const tuna = page.getByRole('link', { name: /Tuna, egg and green bean salad/ });
  await tuna.scrollIntoViewIfNeeded();
  const before = await page.evaluate(() => window.scrollY);
  expect(before).toBeGreaterThan(500);
  await tuna.click();
  await expect(heading(page)).toHaveText('Tuna, egg and green bean salad');
  await page.goBack();
  await expect(heading(page)).toHaveText('Recipes');
  await expect(tuna).toBeFocused();
  await expect(tuna).toBeInViewport();
  expect(Math.abs((await page.evaluate(() => window.scrollY)) - before)).toBeLessThan(2);

  // Cooking for 6 on the traybake, then its soup link and Back: still 6.
  await openRecipe(page, SWEPT_RECIPE);
  const amounts = page
    .getByRole('region', { name: recipes.ingredients.label })
    .getByText('Amounts for 6 serves', { exact: false });
  for (let i = 0; i < 2; i++)
    await page.getByRole('button', { name: recipes.ingredients.more }).click();
  await expect(amounts).toBeVisible();
  await page.getByRole('link', { name: 'Silverbeet and lemon chicken soup' }).click();
  await expect(heading(page)).toHaveText('Silverbeet and lemon chicken soup');
  await page.goBack();
  await expect(heading(page)).toHaveText(SWEPT_RECIPE);
  await expect(amounts).toBeVisible();

  // The Food tab from a recipe, then Back: Today, with no Recipes left in between.
  await goTo(page, 'Food');
  await expect(heading(page)).toHaveText('Food');
  await page.goBack();
  await expect(heading(page)).toHaveText('Today');
});
