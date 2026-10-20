import { expect, type Page, test } from '@playwright/test';
import { alcohol, helpNumbers, today } from '../packages/core/src/copy/health';
import { goTo, heading, seedOnboarded, waitForServiceWorkerControl } from './support/app';

// The Drinks screen in the production build (item 28 design 6.2 E1): PWA-04 (log a drink), NN-01,
// AL-01, AL-08, AL-12 and HS-13. Synthetic records from a finished setup (every answer "no").
// HS-20 for #/drinks is item 13's first-run spec, which deep-links to every route.

const region = (page: Page, name: string) => page.getByRole('region', { name, exact: true });
const SEEDED = 'Zero-sugar premix 330 mL, 5%, 94 kcal, 1.3 std';

test('PWA-04, NN-01, AL-01: a drink logged offline is saved, and after a reload it is listed and counted on Today', async ({
  page,
  context,
}) => {
  await seedOnboarded(page);
  await waitForServiceWorkerControl(page);
  await context.setOffline(true);
  await goTo(page, 'Drinks');
  const log = region(page, alcohol.log.cardLabel);
  await log.getByRole('button', { name: SEEDED }).click();
  await expect(log.getByTestId('drinks-added')).toContainText(
    'Added 1 × Zero-sugar premix (1.30 std)',
  );
  await page.reload();
  await expect(heading(page)).toHaveText('Drinks');
  await expect(region(page, alcohol.log.cardLabel).getByTestId('logged-today')).toContainText(
    '1 × Zero-sugar premix, 1.30 std, 94 kcal',
  );
  await goTo(page, 'Today');
  const card = region(page, today.cards.drinks);
  await expect(card).toContainText('1 drink · 1.30 std');
  await expect(card).toContainText('94 kcal');
});

test('AL-08, AL-12, HS-13: a ticked next-day note brings up the help card; the Help card lists every number', async ({
  page,
}) => {
  await seedOnboarded(page, './#/drinks');
  await expect(heading(page)).toHaveText('Drinks');
  const note = region(page, alcohol.dayNote.cardLabel);
  await expect(page.getByRole('region', { name: alcohol.helpCardLabel, exact: true })).toHaveCount(
    0,
  );
  await note.getByRole('checkbox', { name: alcohol.dayNote.withdrawalTick }).check();
  await note.getByRole('button', { name: alcohol.dayNote.save }).click();
  const talk = region(page, alcohol.helpCardLabel);
  await expect(talk).toBeVisible();
  await expect(talk).toContainText(helpNumbers.alcoholDrugHelpline.number);
  await expect(talk).toContainText(helpNumbers.alcoholDrugHelpline.text);
  const help = region(page, alcohol.help.cardLabel);
  for (const number of [
    helpNumbers.emergency.number,
    helpNumbers.healthline.number,
    helpNumbers.needToTalk.number,
  ]) {
    await expect(help).toContainText(number);
  }
});
