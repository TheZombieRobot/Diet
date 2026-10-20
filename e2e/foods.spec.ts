import { expect, test, type Page } from '@playwright/test';
import { foods } from '../packages/core/src/copy/health';
import {
  goTo,
  heading,
  openFoodPanel,
  seedOnboarded,
  waitForServiceWorkerControl,
} from './support/app';

// Foods in the app (checklist item 18; UX 7a): every figure of a food reads "not known" while no
// food database is approved, the footer says no figure is from one, and it all works offline.

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
