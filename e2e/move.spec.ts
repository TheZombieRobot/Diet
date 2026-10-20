import { expect, type Page, test } from '@playwright/test';
import { move, moveScreen, today } from '../packages/core/src/copy/health';
import { commerceRules, healthPhraseRules } from '../tools/scans/rules';
import { scanText } from '../tools/scans/scan';
import {
  goTo,
  heading,
  patchRecords,
  renderedText,
  seedOnboarded,
  waitForServiceWorkerControl,
} from './support/app';
import { lowContrastText } from './support/contrast';
import { seedMovePlan } from './support/move';
import { startAudit } from './support/network';

// The Move screens in the production build (item 27 design section 5.4, E1 to E7): HS-28 on every
// route into a session, EX-02 and EX-04 with PWA-04's Move part offline, HS-29, RD-05, the
// rendered wording, tap sizes, narrow screens, contrast and the network. Synthetic records from a
// finished setup with seedMovePlan's week: Session A and the beach walk today, Session B later.

const region = (page: Page, name: string) => page.getByRole('region', { name, exact: true });
const main = (page: Page) => page.getByRole('main');

async function stopSignsFirst(page: Page): Promise<void> {
  await expect(heading(page)).toHaveText('Session');
  const first = main(page).locator('section').first();
  await expect(first.locator('h2')).toHaveText(move.safety.stopRules.title);
  await expect(first.locator('a[href="tel:111"]')).toBeVisible();
  await expect(first.locator('a[href="tel:0800611116"]')).toBeVisible();
}

async function answerAll(page: Page, yes: readonly string[] = []): Promise<void> {
  const card = region(page, move.preCheck.title);
  for (const [key, question] of Object.entries(move.preCheck.questions)) {
    await card
      .getByRole('radiogroup', { name: question })
      .getByRole('radio', { name: yes.includes(key) ? 'Yes' : 'No', exact: true })
      .check();
  }
}

test('E1 HS-28: every way into a session shows the stop signs first', async ({ page }) => {
  await seedOnboarded(page);
  await seedMovePlan(page);
  const movement = region(page, today.cards.movement);
  await movement.getByRole('link', { name: 'Start Session A' }).click();
  await stopSignsFirst(page);
  await page.goBack();
  await expect(heading(page)).toHaveText('Today');

  await page.getByRole('button', { name: today.quickActions.title }).click();
  await page.getByRole('link', { name: today.quickActions.labels['complete-workout'] }).click();
  await stopSignsFirst(page);
  await region(page, moveScreen.chooser.title)
    .getByRole('link', { name: 'Start Beach walk' })
    .click();
  await expect(region(page, move.safety.beachPrompts.title)).toBeVisible();
  await stopSignsFirst(page);
  // The chooser replaced its own address: Back returns to Today.
  await page.goBack();
  await expect(heading(page)).toHaveText('Today');

  await goTo(page, 'Move');
  await region(page, move.week.title).getByRole('link', { name: 'Start Session A' }).click();
  await stopSignsFirst(page);
});

test('E2 to E4: a beach walk logged and seen offline, the lighter session after a yes, and RD-05', async ({
  page,
  context,
}) => {
  await seedOnboarded(page);
  await seedMovePlan(page);
  await waitForServiceWorkerControl(page);

  // E2 (EX-02, EX-04): every beach bullet before the check; log the walk and rate it.
  await goTo(page, 'Move');
  await region(page, move.week.title).getByRole('link', { name: 'Start Beach walk' }).click();
  const prompts = region(page, move.safety.beachPrompts.title);
  // Six bullets, and the electrolytes line after the hydration one: a new profile is keto.
  await expect(prompts.getByRole('listitem')).toHaveCount(7);
  await expect(prompts.getByRole('listitem').nth(4)).toHaveText(
    move.safety.beachPrompts.electrolytes,
  );
  for (const text of [
    'red and yellow flags',
    'Rips: relax and float',
    'before 10 am or after 4 pm',
    '500 mL per hour',
    'firm, wet sand',
    'Never swim alone, never after drinking.',
  ]) {
    await expect(prompts).toContainText(text);
  }
  await answerAll(page);
  await page.getByRole('button', { name: 'Planned session' }).click();
  await page.getByRole('button', { name: moveScreen.session.walkDone }).click();
  await expect(page.getByRole('button', { name: moveScreen.session.undoWalk })).toBeVisible();
  await page.getByRole('button', { name: moveScreen.session.finish }).click();
  const finish = region(page, move.finish.title);
  await finish
    .getByRole('radiogroup', { name: 'Effort' })
    .getByRole('radio', { name: '3', exact: true })
    .check();
  await finish
    .getByRole('radiogroup', { name: 'Soreness' })
    .getByRole('radio', { name: '3', exact: true })
    .check();
  await finish.getByLabel(moveScreen.finish.noteLabel).fill('Firm sand');
  await finish.getByRole('button', { name: moveScreen.finish.save }).click();
  await expect(page.getByText(moveScreen.finish.saved)).toBeVisible();

  // PWA-04 (Move part): offline, after a reload, the history still holds it.
  await context.setOffline(true);
  await page.reload();
  await goTo(page, 'Move');
  const history = region(page, moveScreen.history.title);
  await expect(history).toContainText('Beach walk');
  await expect(history).toContainText('15 minutes');
  await expect(history).toContainText('Effort 3, soreness 3');
  await expect(history).toContainText('Note: Firm sand');

  // E3 (HS-29), still offline: a hot-day yes leaves only the lighter session or rest.
  await region(page, move.week.title).getByRole('link', { name: 'Start Session A' }).click();
  await answerAll(page, ['heatOrSun']);
  const choices = page.getByTestId('choice').getByRole('button');
  await expect(choices).toHaveText(['Lighter session', 'Rest today']);
  await page.getByRole('button', { name: 'Lighter session' }).click();
  await expect(page.getByRole('button', { name: moveScreen.session.finish })).toBeVisible();
  await expect(page.getByRole('button', { name: moveScreen.session.changeVersion })).toHaveCount(0);
  await page.reload();
  await expect(page.getByRole('button', { name: moveScreen.session.finish })).toBeVisible();
  await expect(page.getByRole('button', { name: moveScreen.session.changeVersion })).toHaveCount(0);

  // E4 (RD-05): answer 6 hides Move, the Today card and the quick action, with the reason.
  await context.setOffline(false);
  await patchRecords(page, { readiness: { q6: 'yes' } });
  await goTo(page, 'Move');
  await expect(page.getByTestId('gate-notice-exercisePlans')).toBeVisible();
  await expect(main(page).locator('a[href="tel:111"]')).toBeVisible();
  await expect(page.getByTestId('week-strip')).toHaveCount(0);
  await goTo(page, 'Today');
  const movement = region(page, today.cards.movement);
  await expect(movement.getByTestId('gate-notice-exercisePlans')).toBeVisible();
  await expect(movement.locator('a[href="tel:0800611116"]')).toBeVisible();
  await page.getByRole('button', { name: today.quickActions.title }).click();
  const off = page.locator('.ui-fab-panel').getByRole('button', {
    name: new RegExp(today.quickActions.labels['complete-workout']),
  });
  await expect(off).toHaveAttribute('aria-disabled', 'true');
  await expect(page.locator('.ui-fab-panel')).toContainText('exercise warning signs');
});

/** Opens each Move view in turn: the tab, a beach walk's check with the choice, the log, the finish and the editor. */
async function visitMoveViews(page: Page, onView: (where: string) => Promise<void>): Promise<void> {
  await goTo(page, 'Move');
  await onView('Move');
  await region(page, move.week.title).getByRole('link', { name: 'Start Beach walk' }).click();
  await answerAll(page);
  await expect(page.getByTestId('choice')).toBeVisible();
  await onView('the beach walk before start, with the choice');
  await page.getByRole('button', { name: 'Planned session' }).click();
  await expect(page.getByRole('button', { name: moveScreen.session.walkDone })).toBeVisible();
  await onView('the session log');
  await page.getByRole('button', { name: moveScreen.session.finish }).click();
  await expect(region(page, move.finish.title)).toBeVisible();
  await onView('the finish card');
  await page.goto('./#/move-plan');
  await page.getByRole('button', { name: /^Tuesday: / }).click();
  await expect(page.getByRole('radiogroup', { name: 'Strength session on Tuesday' })).toBeVisible();
  await onView('the weekly plan editor with a day open');
}

test('E6, E7: the Move views show no banned wording, keep 48 px controls and stay within the network rules', async ({
  page,
  context,
  baseURL,
  request,
}) => {
  const audit = await startAudit(context, request, baseURL);
  await page.setViewportSize({ width: 360, height: 780 });
  await seedOnboarded(page);
  await seedMovePlan(page);
  const found: string[] = [];
  await visitMoveViews(page, async (where) => {
    found.push(
      ...scanText(where, await renderedText(page), [...healthPhraseRules, ...commerceRules]).map(
        (v) => `${where}: ${v.ruleId}`,
      ),
    );
    const small = await page
      .locator('main a:visible, main button:visible')
      .evaluateAll((controls) =>
        controls
          .map((c) => ({ name: c.textContent, box: c.getBoundingClientRect() }))
          .filter(({ box }) => box.width < 48 || box.height < 48)
          .map(({ name }) => name),
      );
    found.push(...small.map((name) => `${where}: "${name}" under 48 px`));
  });
  expect(found).toEqual([]);
  await audit.verify();
});

test('E7: the week strip never overlaps or runs off at 360, 320 and 195 px', async ({ page }) => {
  await seedOnboarded(page);
  await seedMovePlan(page);
  const problems: string[] = [];
  for (const width of [360, 320, 195]) {
    await page.setViewportSize({ width, height: 700 });
    await goTo(page, 'Move');
    problems.push(
      ...(await page.evaluate((w) => {
        const found: string[] = [];
        const overflow =
          document.documentElement.scrollWidth - document.documentElement.clientWidth;
        if (overflow > 0) found.push(`${w} px: scrolls sideways by ${overflow} px`);
        const intersect = (a: DOMRect, b: DOMRect) =>
          a.left < b.right - 0.5 &&
          b.left < a.right - 0.5 &&
          a.top < b.bottom - 0.5 &&
          b.top < a.bottom - 0.5;
        for (const selector of ['.ui-week__chip', '.ui-week__day']) {
          const boxes = [...document.querySelectorAll(selector)].map((e) =>
            e.getBoundingClientRect(),
          );
          boxes.forEach((box, i) => {
            boxes.slice(i + 1).forEach((other, j) => {
              if (intersect(box, other)) {
                found.push(`${w} px: ${selector} ${i} and ${i + j + 1} overlap`);
              }
            });
          });
        }
        for (const item of document.querySelectorAll('.ui-week__item')) {
          const li = item.getBoundingClientRect();
          const chip = item.querySelector('.ui-week__chip')?.getBoundingClientRect();
          if (chip !== undefined && (chip.left < li.left - 0.5 || chip.right > li.right + 0.5)) {
            found.push(`${w} px: a chip runs outside its day`);
          }
        }
        return found;
      }, width)),
    );
  }
  expect(problems).toEqual([]);
});

for (const colorScheme of ['light', 'dark'] as const) {
  test(`E7 ${colorScheme}: every piece of text on the Move views has AA contrast, today's ink chip included`, async ({
    page,
  }) => {
    await page.emulateMedia({ colorScheme });
    await page.setViewportSize({ width: 360, height: 780 });
    await seedOnboarded(page);
    await seedMovePlan(page);
    const low: string[] = [];
    await visitMoveViews(page, async (where) => {
      low.push(...(await lowContrastText(page, `${colorScheme}: ${where}`)).low);
    });
    expect(low).toEqual([]);
  });
}
