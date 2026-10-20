import { expect, type Page, test } from '@playwright/test';
import { weight } from '../packages/core/src/copy/health';
import {
  onDay,
  WEIGHT_SCENARIOS,
  type WeightScenarioOptions,
  weightScenario,
} from '../packages/test-fixtures/src/index';
import { commerceRules, healthPhraseRules } from '../tools/scans/rules';
import { scanText } from '../tools/scans/scan';
import { goTo, renderedText, returnToApp, waitForServiceWorkerControl } from './support/app';
import { restoreSnapshot } from './support/scenario';

// The weight log, phases and trend in the production build (item 14 design section 6.6): NN-03,
// WT-03, WT-04, WT-08, WT-09, WT-10, HS-21, HS-26, HS-27, W14, W31, 200% text and logging
// offline. Each test restores a synthetic scenario onto a new phone (item 13's restore inside
// setup) with the clock fixed at the scenario's moment. A restore never lowers the phone's
// Kickstart history (item 12), so each scenario gets its own test, and so its own new phone.

// The scenarios live in New Zealand time, as the owner's phone does.
test.use({ timezoneId: 'Pacific/Auckland' });

const region = (page: Page, name: string) => page.getByRole('region', { name, exact: true });
const weightCard = (page: Page) => region(page, weight.card.label);

/** Opens the app with the clock fixed at a scenario's day `day` (09:00 local) and restores it. */
async function scenario(
  page: Page,
  options: WeightScenarioOptions,
  day: number,
  time = '09:00',
): Promise<void> {
  const seen = onDay(options, day, time);
  await page.clock.setFixedTime(new Date(seen.now));
  await page.goto('./');
  await restoreSnapshot(page, weightScenario(seen), seen.now);
}

/** The stored targets row, read with raw IndexedDB. */
function storedTargets(page: Page): Promise<{ fastingPreset: string; presetChosenBy: string }> {
  return page.evaluate(
    () =>
      new Promise((resolve, reject) => {
        const request = indexedDB.open('diet');
        request.onerror = () => {
          reject(new Error('open failed'));
        };
        request.onsuccess = () => {
          const db = request.result;
          const get = db.transaction('targets', 'readonly').objectStore('targets').get('singleton');
          get.onsuccess = () => {
            db.close();
            resolve(get.result as { fastingPreset: string; presetChosenBy: string });
          };
        };
      }),
  );
}

/** Answers the four questions of the open check: "No" to each, or "Yes" to the named one. */
async function answer(page: Page, yesTo?: string): Promise<void> {
  for (const question of [
    weight.check.dizzyOnStanding,
    weight.check.palpitations,
    weight.check.crampsNotSettling,
    weight.check.faintAtWork,
  ]) {
    await page
      .getByRole('radiogroup', { name: question })
      .getByRole('radio', { name: question === yesTo ? weight.check.yes : weight.check.no })
      .check();
  }
}

test('NN-03, WT-03, HS-21: Kickstart day 10 with a long-term goal 22% below, as the owner sees it', async ({
  page,
}) => {
  await scenario(page, WEIGHT_SCENARIOS.NN03, 10);
  const card = weightCard(page);
  await expect(card.getByText('Kickstart, week 2 of 3')).toBeVisible();
  await expect(card.getByRole('group', { name: weight.card.goalStat })).toContainText('78.0 kg');
  await expect(card.getByText('Next milestone 78.3 kg')).toBeVisible();
  await expect(card.getByText(weight.chart.trendLine)).toBeVisible();
  await expect(card.getByText(weight.chart.bandLegend)).toBeVisible();
  await expect(card.getByText(weight.phase.kickstartNote)).toBeVisible();
  await expect(region(page, weight.rapidLoss.label)).toHaveCount(0);

  const found: string[] = [];
  for (const screen of ['Today', 'Weight'] as const) {
    if (screen === 'Weight') await goTo(page, 'Weight');
    const text = await renderedText(page);
    found.push(
      ...scanText(screen, text, [...healthPhraseRules, ...commerceRules]).map((v) => v.ruleId),
    );
    // C18: no line pairs a kg figure with a date after today.
    for (const line of text.split('\n')) {
      const date = /\b\d{1,2} \w+ \d{4}\b/.exec(line)?.[0];
      if (
        /\d kg\b/.test(line) &&
        date !== undefined &&
        Date.parse(date) > Date.parse('2000-02-10')
      ) {
        found.push(`${screen}: ${line}`);
      }
    }
  }
  expect(found).toEqual([]);
});

test('WT-10, HS-26: the band is an unstroked filled shape with no text', async ({ page }) => {
  await scenario(page, WEIGHT_SCENARIOS.K10, 10);
  const chart = weightCard(page).locator('.ui-trend-chart__svg');
  expect(
    await weightCard(page)
      .locator('.ui-trend-chart__band')
      .evaluate((band) => getComputedStyle(band).stroke),
  ).toBe('none');
  await expect(chart.locator('text, title, desc')).toHaveCount(0);
});

test('WT-10, HS-26: under answer 5 there is no band, goal or chip, and the line still draws', async ({
  page,
}) => {
  await scenario(page, { ...WEIGHT_SCENARIOS.K10, readiness: { q5: 'yes' } }, 10);
  await expect(weightCard(page).locator('.ui-trend-chart__band')).toHaveCount(0);
  await expect(weightCard(page).locator('.ui-trend-chart__line')).toHaveCount(1);
  await expect(weightCard(page).locator('.ui-pill--teal')).toHaveCount(0);
  await expect(weightCard(page).getByRole('group', { name: weight.card.goalStat })).toHaveCount(0);
});

test('WT-04, HS-11: the weight check-in card on day 42 hides for the day only, through a reload', async ({
  page,
}) => {
  await scenario(page, WEIGHT_SCENARIOS.K42, 42, '21:00');
  const card = region(page, weight.rapidLoss.label);
  await expect(card.getByText(weight.rapidLoss.body)).toBeVisible();
  await card.getByRole('button', { name: weight.rapidLoss.hideToday }).click();
  await expect(card).toHaveCount(0);
  await page.reload();
  await expect(weightCard(page)).toBeVisible();
  await expect(card).toHaveCount(0);
  // Past local midnight (00:30 on 14 March, NZDT) it is back.
  await page.clock.setFixedTime(new Date('2000-03-13T11:30:00.000Z'));
  await returnToApp(page);
  await expect(card).toBeVisible();
});

test('WT-08: opened first on day 23, the phase is Steady, the flip is explained without a percentage, and the stored 23:1 becomes 22:2', async ({
  page,
}) => {
  await scenario(page, WEIGHT_SCENARIOS.K42, 23);
  await expect(weightCard(page).getByText('Steady', { exact: true })).toBeVisible();
  const explainer = region(page, weight.steadyExplainer.label);
  await expect(explainer).toContainText('smaller Steady deficit');
  await expect(explainer).not.toContainText('%');
  await expect(explainer.getByText(weight.steadyExplainer.window)).toBeVisible();
  await expect(
    explainer.getByRole('button', { name: weight.steadyExplainer.use231 }),
  ).toBeVisible();
  await expect
    .poll(() => storedTargets(page), { timeout: 60_000 })
    .toMatchObject({ fastingPreset: '22:2', presetChosenBy: 'default' });
});

test('WT-09: four "no" extend by a week', async ({ page }) => {
  await scenario(page, WEIGHT_SCENARIOS.K42, 19);
  await region(page, weight.extension.label)
    .getByRole('button', { name: weight.extension.extend })
    .click();
  await answer(page);
  await page.getByRole('button', { name: weight.check.confirmExtend }).click();
  await expect(weightCard(page).getByText('Kickstart, week 3 of 4')).toBeVisible();
  await goTo(page, 'Weight');
  await expect(
    region(page, weight.phase.label).getByText('Extensions used: 1 of 3.'),
  ).toBeVisible();
});

test('WT-09: a palpitations "yes" does not extend, the stop-sign card stays with 111, and after End no restart is promised for tomorrow', async ({
  page,
}) => {
  await scenario(page, WEIGHT_SCENARIOS.K42, 19);
  await region(page, weight.extension.label)
    .getByRole('button', { name: weight.extension.extend })
    .click();
  await answer(page, weight.check.palpitations);
  await page.getByRole('button', { name: weight.check.confirmExtend }).click();
  await expect(
    page.getByRole('status').filter({ hasText: weight.extension.stopSign }),
  ).toBeVisible();
  const stopSigns = region(page, weight.stopSigns.label);
  await expect(stopSigns.getByText(weight.stopSigns.afterCheckRunning)).toBeVisible();
  await expect(stopSigns.locator('a[href="tel:111"]')).toBeVisible();
  await expect(weightCard(page).getByText('Kickstart, week 3 of 3')).toBeVisible();
  // Ended a minute later: the Phase card gives the 14-day wait, never "from tomorrow" (item 14
  // review). The clock moves on, as a real one would (an end must come after the check).
  await page.clock.setFixedTime(new Date(onDay(WEIGHT_SCENARIOS.K42, 19, '09:01').now));
  await stopSigns.getByRole('button', { name: weight.stopSigns.endNow }).click();
  await stopSigns.getByRole('button', { name: weight.end.yes }).click();
  await expect(weightCard(page).getByText('Steady', { exact: true })).toBeVisible();
  await goTo(page, 'Weight');
  const phase = region(page, weight.phase.label);
  await expect(phase.getByText(weight.start.unavailableRecentStopSign)).toBeVisible();
  await expect(phase.getByText(weight.start.unavailableToday)).toHaveCount(0);
});

test('W14: Kickstart chosen at setup starts only after "Start Kickstart today" and four "no"', async ({
  page,
}) => {
  await scenario(page, WEIGHT_SCENARIOS.PENDING, 1);
  const start = region(page, weight.start.pendingLabel);
  await start.getByRole('button', { name: weight.start.pendingAction }).click();
  await answer(page);
  await page.getByRole('button', { name: weight.check.confirmStart }).click();
  await expect(weightCard(page).getByText('Kickstart, week 1 of 3')).toBeVisible();
  await expect(region(page, weight.stopSigns.label)).toBeVisible();
  expect(await storedTargets(page)).toMatchObject({
    fastingPreset: '23:1',
    presetChosenBy: 'kickstart-default',
  });
});

test('W31: after a pre-start "yes" the eat, salt and 111 guidance stays on Today and the Weight screen until OK', async ({
  page,
}) => {
  await scenario(page, WEIGHT_SCENARIOS.PENDING, 1);
  await region(page, weight.start.pendingLabel)
    .getByRole('button', { name: weight.start.pendingAction })
    .click();
  await answer(page, weight.check.palpitations);
  await page.getByRole('button', { name: weight.check.confirmStart }).click();
  const guidance = region(page, weight.start.pendingLabel).filter({
    hasText: weight.start.stopSign,
  });
  await expect(guidance.locator('a[href="tel:111"]')).toBeVisible();
  await goTo(page, 'Weight');
  await expect(guidance.locator('a[href="tel:111"]')).toBeVisible();
  await expect(
    region(page, weight.phase.label).getByText(weight.start.unavailableStopSignToday),
  ).toBeVisible();
  await goTo(page, 'Today');
  await expect(guidance.locator('a[href="tel:111"]')).toBeVisible();
  await guidance.getByRole('button', { name: weight.steadyExplainer.ok }).click();
  await expect(guidance).toHaveCount(0);
  await page.reload();
  await expect(weightCard(page)).toBeVisible();
  await expect(guidance).toHaveCount(0);
});

/** What runs off the screen or overlaps on the page, if anything. */
function layoutProblems(page: Page, where: string): Promise<string[]> {
  return page.evaluate((label) => {
    const problems: string[] = [];
    const width = document.documentElement.clientWidth;
    const overflow = document.documentElement.scrollWidth - width;
    if (overflow > 0) problems.push(`${label}: scrolls sideways by ${String(overflow)} px`);
    for (const element of document.querySelectorAll('main *')) {
      const box = element.getBoundingClientRect();
      if (box.width > 0 && box.right > width + 0.5) {
        problems.push(
          `${label}: ${element.className || element.tagName} ends at ${String(box.right)}`,
        );
      }
    }
    // A figure or a week label wider than its own column runs into the next one.
    for (const element of document.querySelectorAll(
      '.ui-stat__value, .ui-stat__label, .ui-trend-chart__labels > span, .ui-pill',
    )) {
      if (element.scrollWidth > element.clientWidth + 0.5) {
        problems.push(`${label}: "${element.textContent}" is wider than its box`);
      }
    }
    return problems;
  }, where);
}

test('200% text on a 360 px phone (180 px): the Weight card and the Weight screen with a running Kickstart fit, with nothing cut off', async ({
  page,
}) => {
  await page.setViewportSize({ width: 180, height: 740 });
  await scenario(page, WEIGHT_SCENARIOS.K42, 19);
  await expect(weightCard(page).getByText('Kickstart, week 3 of 3')).toBeVisible();
  const problems = await layoutProblems(page, 'Today');
  await goTo(page, 'Weight');
  problems.push(...(await layoutProblems(page, 'Weight')));
  expect(problems).toEqual([]);
});

test('PWA-04 (weight): a weigh-in logged offline is there after an offline reload', async ({
  page,
  context,
}) => {
  await scenario(page, WEIGHT_SCENARIOS.K10, 10);
  await waitForServiceWorkerControl(page);
  await context.setOffline(true);
  await weightCard(page).getByRole('button', { name: weight.card.logWeight }).click();
  await weightCard(page).getByRole('button', { name: weight.entry.more }).click();
  await weightCard(page).getByRole('button', { name: weight.entry.save }).click();
  await expect(weightCard(page).getByText(/^Saved 96\.9 kg at /)).toBeVisible();
  await page.reload();
  await expect(weightCard(page).getByRole('group', { name: weight.card.latest })).toContainText(
    '96.9 kg',
  );
});
