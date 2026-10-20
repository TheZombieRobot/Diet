import { expect, test, type Page } from '@playwright/test';
import {
  alcohol,
  fasting,
  privacy,
  targets,
  today,
  weight,
} from '../packages/core/src/copy/health';
import { APPROVED_NUTRIENT_SOURCES } from '../packages/core/src/foods/approval';
import { commerceRules, healthPhraseRules } from '../tools/scans/rules';
import { scanText } from '../tools/scans/scan';
import {
  goTo,
  heading,
  offerInstall,
  openBackupPanels,
  openFoodPanel,
  patchRecords,
  renderedText,
  type ScreenName,
  SCREENS,
  seedOnboarded,
  SETUP_SCREENS,
  visitEveryScreen,
} from './support/app';

// The rendered-text scan promised in tools/scans/rules.ts: the static scans read the source, this
// reads what each screen actually shows (text, labels and descriptions, tooltips, image text,
// placeholders, form values and the page title) and applies the same banned health phrases
// (HS-07, HS-08, HS-19, HS-21, HS-26) and the price, stock and cart-status wording rules (HS-16).

const RULES = [...healthPhraseRules, ...commerceRules];
const FOODS: ScreenName = 'Foods in the app';

const region = (page: Page, name: string) => page.getByRole('region', { name, exact: true });
const quickActionsPanel = (page: Page) => page.locator('.ui-fab-panel');

async function violations(page: Page, where: string): Promise<string[]> {
  return scanText(where, await renderedText(page), RULES).map((v) => `${where}: ${v.ruleId}`);
}

/** Every screen as it shows with the install offer, the Today banner and the "+" panel open. */
async function visitWithEverythingOpen(
  page: Page,
  onScreen: (where: string, screen: ScreenName) => Promise<void>,
): Promise<void> {
  await offerInstall(page);
  for (const screen of SCREENS) {
    await goTo(page, screen);
    if (screen === 'Today') {
      await expect(page.getByText('Install this app')).toBeVisible();
      await page.getByRole('button', { name: 'Quick actions' }).click();
      await expect(
        quickActionsPanel(page).getByRole('button', { name: 'Log weight' }),
      ).toBeVisible();
    }
    if (screen === 'Settings') {
      await expect(page.getByRole('button', { name: 'Install app' })).toBeVisible();
    }
    await onScreen(`${screen} with the install offer and quick actions`, screen);
  }
}

test('HS-31: no screen shows banned health, price, stock or cart wording', async ({ page }) => {
  await seedOnboarded(page);
  await expect(heading(page)).toHaveText('Today');
  const found: string[] = [];

  await visitEveryScreen(page, async (screen) => {
    // Item 18: the generic loop never opens a food, so open one (E2).
    if (screen === FOODS) await openFoodPanel(page);
    found.push(...(await violations(page, screen)));
  });
  await visitWithEverythingOpen(page, async (where, screen) => {
    if (screen === FOODS) await openFoodPanel(page);
    found.push(...(await violations(page, where)));
  });
  await goTo(page, 'Settings');
  await openBackupPanels(page);
  found.push(...(await violations(page, 'Settings with the backup panels open')));

  expect(found).toEqual([]);
});

test('no screen but About, Weight, Fasting, Diet and targets, and Foods shows a number or a price, even with every banner and panel open', async ({
  page,
}) => {
  // Screens must not look like they hold records they do not have (no sample data). The fresh
  // state is a finished setup with no weigh-ins and no Kickstart choice (item 14). About is left
  // out: its numbers are the help lines and the version; so are the setup screens, which show the
  // owner's own entries, the question about being under 18 and the pattern names such as 16:8, the
  // Weight screen, whose labels carry digits by design ("7-day average", "Less 0.1 kg"), and the
  // Fasting screen, which shows the owner's eating pattern and its clock times (item 15), and Diet
  // and targets, which shows the owner's own figures and the allowed ranges by design (item 21).
  // On Today the Fast card may carry digits, for the same pattern ("22:2", "Eat 5:00 pm – 7:00 pm"),
  // and is left out by element (item 15 review); the Nutrition today card shows today's intake
  // (none: every figure 0; item 21); and item 16's own figures are removed one element at a time:
  // the date and status line, the "Add 250 mL" button, the NZ guidance line and the lipid-test
  // reminder. A digit anywhere else on Today, such as an unbuilt card, a later-step line or a
  // "Later" row of the "+" panel (TD-02), still fails.
  // Foods in the app is left out too: its numbers are the catalogue's (its count, typical pack
  // sizes), not records; that it never shows a nutrient figure as a number is E1 (foods.spec.ts).
  await seedOnboarded(page, './', './', { weightKg: null });
  const found: string[] = [];
  const check = async (where: string, screen: ScreenName) => {
    if (screen === 'Today' || screen === 'Weight') {
      // With no weigh-ins, no record value or sample figure is drawn (item 14).
      const weightFigures = screen === 'Today' ? region(page, weight.card.label) : page;
      await expect(
        weightFigures.locator('.ui-stat__value, .ui-trend-chart, [data-weigh-in-row]'),
      ).toHaveCount(0);
    }
    if (screen === 'Today') await expect(region(page, today.cards.movement)).toBeVisible();
    if (
      screen === 'About' ||
      screen === 'Weight' ||
      screen === 'Fasting and reflux' ||
      screen === 'Diet and targets' ||
      screen === FOODS ||
      (SETUP_SCREENS as readonly string[]).includes(screen)
    ) {
      if (/[$€£]/.test(await renderedText(page))) found.push(`${where}: a currency sign`);
      return;
    }
    let text = await renderedText(
      page,
      screen === 'Today' ? region(page, fasting.card.label) : undefined,
    );
    if (screen === 'Today') {
      // The Nutrition today card shows today's intake (none: every figure 0) against the owner's
      // own stored ranges and guides, never sample data (item 21; targets.spec.ts checks them).
      const nutrition = region(page, targets.today.label);
      await expect(nutrition.locator('.ui-meter__value').first()).toHaveText('0 kJ');
      const ownFigures = [
        nutrition,
        page.getByTestId('today-status'),
        region(page, today.cards.water).getByRole('button', { name: today.water.add }),
        page.getByTestId('drinks-guidance'),
        page.getByTestId('reminder-cholesterol'),
      ];
      for (const part of ownFigures) text = text.replace(await part.innerText(), '');
    }
    if (/\d/.test(text))
      found.push(`${where}: a digit in ${JSON.stringify(text.match(/.*\d.*/)?.[0])}`);
    if (/[$€£]/.test(text)) found.push(`${where}: a currency sign`);
  };
  await visitEveryScreen(page, (screen) => check(screen, screen));
  await visitWithEverythingOpen(page, check);
  expect(found).toEqual([]);
});

test('HS-31: Today filled in, with the steps editor and the "+" panel open, and with fasting switched off: no banned wording', async ({
  page,
}) => {
  // Item 16 design section 5.3 E4 (HS-07, HS-08, HS-16, HS-19, HS-21, HS-26, C11).
  await seedOnboarded(page);
  await expect(region(page, today.cards.movement)).toBeVisible();
  await page.getByRole('button', { name: today.water.add }).click();
  await expect(page.getByTestId('water-total')).toHaveText('250 mL');
  await page.getByRole('switch', { name: today.water.electrolytes }).check();
  await page.getByRole('button', { name: today.steps.enter }).click();
  await page.getByLabel(today.steps.field).fill('9000');
  await page.getByLabel(today.steps.field).press('Enter');
  await expect(page.getByTestId('steps-today')).toHaveText('9,000');
  await page.getByRole('button', { name: today.steps.edit }).click();
  await expect(region(page, privacy.backupReminder.cardLabel)).toBeVisible();
  await page.getByRole('button', { name: today.quickActions.title }).click();
  await expect(quickActionsPanel(page).getByText(today.quickActions.laterNote)).toBeVisible();
  const found = await violations(page, 'Today filled in');

  await patchRecords(page, { readiness: { q5: 'yes', q7: 'yes' } });
  await expect(region(page, alcohol.helpCardLabel)).toBeVisible();
  await page.getByRole('button', { name: today.quickActions.title }).click();
  await expect(quickActionsPanel(page).getByText(today.quickActions.laterNote)).toBeVisible();
  found.push(...(await violations(page, 'Today with fasting switched off and the help card')));
  expect(found).toEqual([]);
});

test('E4 C97 NU-09: while no food database is approved, no screen names one', async ({ page }) => {
  expect(APPROVED_NUTRIENT_SOURCES).toEqual([]);
  await seedOnboarded(page);
  const DATABASE_NAMES = [
    /Food Composition Database|\bFCDB\b|\bUSDA\b|FoodData|New Zealand Food/,
    /food composition/i,
  ];
  const found: string[] = [];
  await visitEveryScreen(page, async (screen) => {
    if (screen === FOODS) await openFoodPanel(page);
    const text = await renderedText(page);
    for (const name of DATABASE_NAMES)
      if (name.test(text)) found.push(`${screen}: ${String(name)}`);
  });
  expect(found).toEqual([]);
});

test('the rendered-text scan catches wording that slips into a screen', async ({ page }) => {
  await seedOnboarded(page, './#/drinks');
  await expect(heading(page)).toHaveText('Drinks');
  await page.evaluate(() => {
    const seeded = document.createElement('p');
    seeded.textContent = 'You have 2 drinks left this week. Added to cart. $4.50';
    // Wording a person meets only as a tooltip, a placeholder or a spoken description.
    seeded.title = 'A gentle taper plan';
    const input = document.createElement('input');
    input.placeholder = 'Calories left today';
    input.setAttribute('aria-description', 'Safe to drive in an hour');
    document.querySelector('main')?.append(seeded, input);
  });
  const ids = (await violations(page, 'seeded')).map((v) => v.replace('seeded: ', ''));
  expect(ids).toEqual(
    expect.arrayContaining([
      'drinks-left',
      'cart-status',
      'currency-literal',
      'taper-taper',
      'energy-left',
      'safe-to-drive',
    ]),
  );
});
