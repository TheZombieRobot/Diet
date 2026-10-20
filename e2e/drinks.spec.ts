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

test('F19: focus stays on a preset logged from the keyboard, and goes back to More after More then Add', async ({
  page,
}) => {
  await seedOnboarded(page, './#/drinks');
  await expect(heading(page)).toHaveText('Drinks');
  const log = region(page, alcohol.log.cardLabel);
  const preset = log.getByRole('button', { name: SEEDED });
  await preset.focus();
  await page.keyboard.press('Enter');
  await expect(log.getByTestId('drinks-added')).toContainText('Added 1 ×');
  await expect(preset).toBeFocused();
  const more = log.getByRole('button', { name: 'More options for Zero-sugar premix' });
  await more.focus();
  await page.keyboard.press('Enter');
  await log.getByRole('button', { name: alcohol.log.add }).focus();
  await page.keyboard.press('Enter');
  await expect(log.getByTestId('logged-today').locator('li')).toHaveCount(2);
  await expect(log.getByLabel(alcohol.log.countLabel)).toHaveCount(0);
  await expect(more).toBeFocused();
});

/** Where the Drinks screen's charts and open panels break at the current width, if anywhere. */
async function drinksLayoutProblems(page: Page, where: string): Promise<string[]> {
  return page.evaluate((label) => {
    const problems: string[] = [];
    const width = document.documentElement.clientWidth;
    if (document.documentElement.scrollWidth > width) problems.push(`${label}: scrolls sideways`);
    // F14: no two chart labels shown overlap, and none runs out of its chart.
    for (const row of document.querySelectorAll('.ui-bar-chart__ticks')) {
      const chart = row.getBoundingClientRect();
      const boxes = [...row.querySelectorAll<HTMLElement>('.ui-bar-chart__tick-text')]
        .filter((t) => t.textContent !== '' && t.dataset['hidden'] !== 'true')
        .map((t) => ({ text: t.textContent, box: t.getBoundingClientRect() }));
      boxes.forEach(({ text, box }, i) => {
        const next = boxes[i + 1];
        if (next !== undefined && box.right > next.box.left + 0.5) {
          problems.push(`${label}: tick ${text} overlaps ${next.text}`);
        }
        if (box.left < chart.left - 0.5 || box.right > chart.right + 0.5) {
          problems.push(`${label}: tick ${text} runs out of its chart`);
        }
      });
    }
    // F16: every field, fieldset and button of an open panel stays inside that panel, a typed
    // figure is not cut off, and a preset button keeps most of its row.
    for (const panel of document.querySelectorAll('.ui-subpanel')) {
      const outer = panel.getBoundingClientRect();
      for (const element of panel.querySelectorAll<HTMLElement>(
        'input, fieldset, button, select',
      )) {
        const box = element.getBoundingClientRect();
        if (box.width === 0) continue;
        if (box.left < outer.left - 0.5 || box.right > outer.right + 0.5) {
          problems.push(
            `${label}: ${element.tagName} ${element.getAttribute('aria-label') ?? ''} leaves its panel`,
          );
        }
        // A figure (size, strength, energy, count) must show whole; a long name may scroll.
        if (
          element instanceof HTMLInputElement &&
          ['decimal', 'numeric'].includes(element.inputMode) &&
          element.scrollWidth > element.clientWidth + 1
        ) {
          problems.push(`${label}: the value "${element.value}" is cut off`);
        }
      }
    }
    for (const button of document.querySelectorAll<HTMLElement>('.ui-preset-button')) {
      const row = button.closest('.ui-preset__row')?.getBoundingClientRect();
      if (row !== undefined && button.getBoundingClientRect().width < 0.75 * row.width) {
        problems.push(
          `${label}: a preset button is ${button.getBoundingClientRect().width} px of ${row.width}`,
        );
      }
    }
    return problems;
  }, where);
}

test('F14, F16, F21: at 360 px and at 200% text the chart labels never overlap, open panels fit, and a jump lands below the top bar', async ({
  page,
}) => {
  await seedOnboarded(page, './#/drinks');
  await expect(heading(page)).toHaveText('Drinks');
  const log = region(page, alcohol.log.cardLabel);
  await log.getByRole('button', { name: SEEDED }).click();
  await expect(log.getByTestId('drinks-added')).toBeVisible();
  const problems: string[] = [];
  // 360 px: a phone; 180 px: a 360 px phone at 200% text.
  for (const width of [360, 180]) {
    await page.setViewportSize({ width, height: 740 });
    await expect(region(page, alcohol.trends.cardLabel).locator('.ui-bar-chart')).toHaveCount(2);
    await log.getByRole('button', { name: 'More options for Zero-sugar premix' }).click();
    await log.getByRole('button', { name: alcohol.log.otherDrink }).click();
    await log.getByRole('button', { name: alcohol.log.somethingElse }).click();
    await log.getByRole('button', { name: alcohol.log.editPresets }).click();
    const presets = region(page, alcohol.presets.cardLabel);
    await presets.getByRole('button', { name: 'Edit Zero-sugar premix' }).click();
    await expect(presets.getByLabel(alcohol.presets.nameLabel)).toBeFocused();
    // The tick labels are fitted after layout, so let a frame pass.
    await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(resolve)));
    problems.push(...(await drinksLayoutProblems(page, `${width} px`)));
    await page
      .getByRole('navigation', { name: alcohol.screen.jumpTo })
      .getByRole('button', { name: alcohol.screen.jumpTrends })
      .click();
    const covered = await page.evaluate(() => {
      const bar = document.querySelector('.ui-topbar')?.getBoundingClientRect();
      const part = document.getElementById('drinks-trends')?.getBoundingClientRect();
      return bar === undefined || part === undefined ? 1 : bar.bottom - part.top;
    });
    if (covered > 0.5)
      problems.push(`${width} px: the Trends part starts ${covered} px under the top bar`);
    await page.reload();
    await expect(heading(page)).toHaveText('Drinks');
  }
  expect(problems).toEqual([]);
});
