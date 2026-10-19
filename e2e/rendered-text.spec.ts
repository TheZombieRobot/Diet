import { expect, test, type Page } from '@playwright/test';
import { commerceRules, healthPhraseRules } from '../tools/scans/rules';
import { scanText } from '../tools/scans/scan';
import {
  goTo,
  heading,
  offerInstall,
  renderedText,
  SCREENS,
  visitEveryScreen,
  type ScreenName,
} from './support/app';

// The rendered-text scan promised in tools/scans/rules.ts: the static scans read the source, this
// reads what each screen actually shows (text, labels and descriptions, tooltips, image text,
// placeholders, form values and the page title) and applies the same banned health phrases
// (HS-07, HS-08, HS-19, HS-21, HS-26) and the price, stock and cart-status wording rules (HS-16).

const RULES = [...healthPhraseRules, ...commerceRules];

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
      await expect(page.getByText(/^Quick ways to log weight/)).toBeVisible();
    }
    if (screen === 'Settings') {
      await expect(page.getByRole('button', { name: 'Install app' })).toBeVisible();
    }
    await onScreen(`${screen} with the install offer and quick actions`, screen);
  }
}

test('no screen shows banned health, price, stock or cart wording', async ({ page }) => {
  await page.goto('./');
  await expect(heading(page)).toHaveText('Today');
  const found: string[] = [];

  await visitEveryScreen(page, async (screen) => {
    found.push(...(await violations(page, screen)));
  });
  await visitWithEverythingOpen(page, async (where) => {
    found.push(...(await violations(page, where)));
  });

  expect(found).toEqual([]);
});

test('no screen but About shows a number or a price, even with every banner and panel open', async ({
  page,
}) => {
  // Placeholder screens must not look like they hold records (no sample data). About is left out:
  // its numbers are the help lines and the version.
  await page.goto('./');
  const found: string[] = [];
  const check = async (where: string, screen: ScreenName) => {
    if (screen === 'About') return;
    const text = await renderedText(page);
    if (/\d/.test(text))
      found.push(`${where}: a digit in ${JSON.stringify(text.match(/.*\d.*/)?.[0])}`);
    if (/[$€£]/.test(text)) found.push(`${where}: a currency sign`);
  };
  await visitEveryScreen(page, (screen) => check(screen, screen));
  await visitWithEverythingOpen(page, check);
  expect(found).toEqual([]);
});

test('the rendered-text scan catches wording that slips into a screen', async ({ page }) => {
  await page.goto('./#/drinks');
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
