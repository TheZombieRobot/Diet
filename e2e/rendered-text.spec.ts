import { expect, test, type Page } from '@playwright/test';
import { commerceRules, healthPhraseRules } from '../tools/scans/rules';
import { scanText } from '../tools/scans/scan';
import { goTo, heading, renderedText, visitEveryScreen } from './support/app';

// The rendered-text scan promised in tools/scans/rules.ts: the static scans read the source, this
// reads what each screen actually shows (text, aria-labels and the page title) and applies the
// same banned health phrases (HS-07, HS-08, HS-19, HS-21, HS-26) and the price, stock and
// cart-status wording rules (HS-16).

const RULES = [...healthPhraseRules, ...commerceRules];

async function violations(page: Page, where: string): Promise<string[]> {
  return scanText(where, await renderedText(page), RULES).map((v) => `${where}: ${v.ruleId}`);
}

/** Makes Chrome's install prompt available, so the install banner and button render too. */
async function offerInstall(page: Page): Promise<void> {
  await page.evaluate(() => {
    const event = Object.assign(new Event('beforeinstallprompt', { cancelable: true }), {
      prompt: () => Promise.resolve(),
      userChoice: new Promise(() => undefined),
    });
    window.dispatchEvent(event);
  });
}

test('no screen shows banned health, price, stock or cart wording', async ({ page }) => {
  await page.goto('./');
  await expect(heading(page)).toHaveText('Today');
  const found: string[] = [];

  await visitEveryScreen(page, async (screen) => {
    found.push(...(await violations(page, screen)));
  });

  // The conditional parts of Today and Settings: the install banner, the "+" panel.
  await offerInstall(page);
  await goTo(page, 'Today');
  await expect(page.getByText('Install this app')).toBeVisible();
  await page.getByRole('button', { name: 'Quick actions' }).click();
  found.push(...(await violations(page, 'Today with install banner and quick actions')));
  await goTo(page, 'Settings');
  await expect(page.getByRole('button', { name: 'Install app' })).toBeVisible();
  found.push(...(await violations(page, 'Settings with install button')));

  expect(found).toEqual([]);
});

test('the rendered-text scan catches wording that slips into a screen', async ({ page }) => {
  await page.goto('./#/drinks');
  await expect(heading(page)).toHaveText('Drinks');
  await page.evaluate(() => {
    const seeded = document.createElement('p');
    seeded.textContent = 'You have 2 drinks left this week. Added to cart. $4.50';
    document.querySelector('main')?.append(seeded);
  });
  const ids = (await violations(page, 'seeded')).map((v) => v.replace('seeded: ', ''));
  expect(ids).toEqual(expect.arrayContaining(['drinks-left', 'cart-status', 'currency-literal']));
});
