import { expect, test, type Page } from '@playwright/test';
import type { FoodLogRecord } from '../packages/core/src/index';
import { foods, targets } from '../packages/core/src/copy/health';
import {
  fixtureId,
  onDay,
  WEIGHT_SCENARIOS,
  weightScenario,
} from '../packages/test-fixtures/src/index';
import {
  goTo,
  heading,
  openFoodPanel,
  seedOnboarded,
  waitForServiceWorkerControl,
} from './support/app';
import { restoreSnapshot } from './support/scenario';

// Foods in the app (checklist item 18; UX 7a): every figure of a food reads "not known" while no
// food database is approved, the footer says no figure is from one, and it all works offline. A
// restored log row that says "database" shows as Estimate on Today until a database is approved.

async function expectSilverbeetNotKnown(page: Page): Promise<void> {
  const panel = page.getByRole('region', { name: 'Silverbeet' });
  const cells = panel.getByRole('table', { name: 'Nutrition per 100 g, raw' }).getByRole('cell');
  await expect(cells).toHaveCount(8);
  await expect(cells).toHaveText(Array.from({ length: 8 }, () => foods.figures.notKnown));
  await expect(panel.getByText(foods.footer.noDatabase)).toBeVisible();
  expect(await panel.innerText()).not.toMatch(/\b0\s*(g|kJ|mg)\b/);
}

test('E1 PWA-03 NU-09 HS-37: a food from About shows eight "not known" figures and the footer, online and offline', async ({
  page,
  context,
}) => {
  await seedOnboarded(page);
  await waitForServiceWorkerControl(page);
  await goTo(page, 'Foods in the app');
  await openFoodPanel(page, 'chard', 'Silverbeet');
  await expectSilverbeetNotKnown(page);

  await context.setOffline(true);
  await page.reload();
  await expect(heading(page)).toHaveText(foods.screen.title);
  await openFoodPanel(page, 'chard', 'Silverbeet');
  await expectSilverbeetNotKnown(page);
});

test.describe('a restored backup', () => {
  // The scenario's day is in New Zealand time, so the browser is too.
  test.use({ timezoneId: 'Pacific/Auckland' });

  test('C97 N43 HS-37: a Database log row restored while no database is approved shows as Estimate, under the no-database footer', async ({
    page,
  }) => {
    const seen = onDay(WEIGHT_SCENARIOS.K10, 10);
    // A synthetic plan portion from a backup whose rows say "database": no figure here is real.
    const portion: FoodLogRecord = {
      id: fixtureId(18_001),
      at: seen.now,
      timeZone: 'Pacific/Auckland',
      sourceKind: 'recipe',
      refId: fixtureId(18_002),
      name: 'Example restored portion',
      grams: 300,
      weightBasis: 'raw',
      servings: null,
      nutrients: {
        energyKj: 2000,
        proteinG: 30,
        fatG: 20,
        saturatedFatG: 5,
        carbsG: 10,
        sugarsG: 5,
        fibreG: 5,
        sodiumMg: 500,
      },
      unknownNutrients: [],
      confidence: 'database',
    };
    await page.clock.setFixedTime(new Date(seen.now));
    await page.goto('./');
    await restoreSnapshot(page, { ...weightScenario(seen), food_log: [portion] }, seen.now);
    const card = page.getByRole('region', { name: targets.today.label });
    const row = card.getByRole('listitem').filter({ hasText: portion.name });
    await expect(row).toContainText(foods.badges.estimate);
    await expect(row).not.toContainText(foods.badges.database);
    await expect(card.getByText(foods.footer.noDatabase)).toBeVisible();

    await goTo(page, 'About');
    await expect(page.getByText(foods.about.databaseBadgeNone)).toBeVisible();
  });
});
