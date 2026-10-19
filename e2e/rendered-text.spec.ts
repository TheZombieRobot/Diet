import { expect, test, type Page } from '@playwright/test';
import { fasting, targets } from '../packages/core/src/copy/health';
import { commerceRules, healthPhraseRules } from '../tools/scans/rules';
import { scanText } from '../tools/scans/scan';
import {
  goTo,
  heading,
  offerInstall,
  openBackupPanels,
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
  await seedOnboarded(page);
  await expect(heading(page)).toHaveText('Today');
  const found: string[] = [];

  await visitEveryScreen(page, async (screen) => {
    found.push(...(await violations(page, screen)));
  });
  await visitWithEverythingOpen(page, async (where) => {
    found.push(...(await violations(page, where)));
  });
  await goTo(page, 'Settings');
  await openBackupPanels(page);
  found.push(...(await violations(page, 'Settings with the backup panels open')));

  expect(found).toEqual([]);
});

test('no screen but About, Weight, Fasting and Diet and targets shows a number or a price, even with every banner and panel open', async ({
  page,
}) => {
  // Screens must not look like they hold records they do not have (no sample data). The fresh
  // state is a finished setup with no weigh-ins and no Kickstart choice (item 14). About is left
  // out: its numbers are the help lines and the version; so are the setup screens, which show the
  // owner's own entries, the question about being under 18 and the pattern names such as 16:8, the
  // Weight screen, whose labels carry digits by design ("7-day average", "Less 0.1 kg"), and the
  // Fasting screen, which shows the owner's eating pattern and its clock times (item 15). On Today
  // only the Fast card may carry digits, for the same pattern ("22:2", "Eat 5:00 pm – 7:00 pm"),
  // and the Nutrition today card, for today's intake (none: every figure 0; item 21).
  await seedOnboarded(page, './', './', { weightKg: null });
  const found: string[] = [];
  const check = async (where: string, screen: ScreenName) => {
    if (screen === 'Today' || screen === 'Weight') {
      // With no weigh-ins, no record value or sample figure is drawn (item 14).
      await expect(
        page.locator('.ui-stat__value, .ui-trend-chart, [data-weigh-in-row]'),
      ).toHaveCount(0);
    }
    // Diet and targets shows the owner's own figures and the allowed ranges by design (item 21).
    if (
      screen === 'About' ||
      screen === 'Weight' ||
      screen === 'Fasting and reflux' ||
      screen === 'Diet and targets' ||
      (SETUP_SCREENS as readonly string[]).includes(screen)
    ) {
      return;
    }
    let text = await renderedText(page);
    let fastCard = '';
    if (screen === 'Today') {
      // The Nutrition today card shows today's intake (none: every figure 0) against the owner's
      // own stored ranges and guides, never sample data (item 21; targets.spec.ts checks them).
      const nutrition = page.getByRole('region', { name: targets.today.label });
      await expect(nutrition.locator('.ui-meter__value').first()).toHaveText('0 kJ');
      text = text.replace(await nutrition.innerText(), '');
      fastCard = await page
        .getByRole('region', { name: fasting.card.label, exact: true })
        .innerText();
    }
    text = text
      .split('\n')
      .filter((line) => line.trim() === '' || !fastCard.includes(line.trim()))
      .join('\n');
    if (/\d/.test(text))
      found.push(`${where}: a digit in ${JSON.stringify(text.match(/.*\d.*/)?.[0])}`);
    if (/[$€£]/.test(text)) found.push(`${where}: a currency sign`);
  };
  await visitEveryScreen(page, (screen) => check(screen, screen));
  await visitWithEverythingOpen(page, check);
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
