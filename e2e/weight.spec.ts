import { expect, type Page, test } from '@playwright/test';
import { buildBackupPayload, plainBackupText, type Snapshot } from '../packages/core/src/index';
import { alcohol, onboarding, privacy, weight } from '../packages/core/src/copy/health';
import {
  onDay,
  WEIGHT_SCENARIOS,
  type WeightScenarioOptions,
  weightScenario,
} from '../packages/test-fixtures/src/index';
import { commerceRules, healthPhraseRules } from '../tools/scans/rules';
import { scanText } from '../tools/scans/scan';
import {
  goTo,
  heading,
  renderedText,
  returnToApp,
  waitForServiceWorkerControl,
} from './support/app';

// The weight log, phases and trend in the production build (item 14 design section 6.6): NN-03,
// WT-03, WT-04, WT-08, WT-09, WT-10, HS-21, HS-26, HS-27, W14 and logging offline. Each test
// restores a synthetic scenario onto a new phone (item 13's restore inside setup) with the clock
// fixed at the scenario's moment. A restore never lowers the phone's Kickstart history (item 12),
// so each scenario gets its own test, and so its own new phone.

// The scenarios live in New Zealand time, as the owner's phone does.
test.use({ timezoneId: 'Pacific/Auckland' });

const region = (page: Page, name: string) => page.getByRole('region', { name, exact: true });
const weightCard = (page: Page) => region(page, weight.card.label);

/**
 * Restores `snapshot` the way a new phone does (item 13; C53): Welcome, the alcohol notice, then
 * "Restore from a backup instead". The file holds a finished setup, so the reload opens Settings,
 * Readiness answers (E64); then Today.
 */
async function restore(page: Page, snapshot: Snapshot, exportedAt: string): Promise<void> {
  const text = plainBackupText(
    buildBackupPayload(snapshot, { kind: 'backup', exportedAt, appVersion: '0.1.0' }),
  );
  await expect(heading(page)).toHaveText(onboarding.welcome.title);
  await page.getByRole('button', { name: onboarding.frame.continue }).click();
  await page.getByRole('button', { name: alcohol.notice.acknowledge }).click();
  await page.getByRole('button', { name: onboarding.frame.restoreLink }).click();
  await expect(heading(page)).toHaveText(onboarding.frame.restoreTitle);
  const [chooser] = await Promise.all([
    page.waitForEvent('filechooser'),
    page.getByRole('button', { name: privacy.importBackup.chooseFile }).click(),
  ]);
  await chooser.setFiles({
    name: 'diet-backup-2000-02-01.json',
    mimeType: 'application/json',
    buffer: Buffer.from(text),
  });
  const confirm = page.getByTestId('restore-confirm');
  await expect(confirm).toBeVisible();
  await Promise.all([
    page.waitForEvent('load'),
    confirm.getByRole('button', { name: privacy.importBackup.replace }).click(),
  ]);
  await expect(heading(page)).toHaveText('Readiness answers');
  await goTo(page, 'Today');
  await expect(weightCard(page)).toBeVisible();
}

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
  await restore(page, weightScenario(seen), seen.now);
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

test('WT-09: a palpitations "yes" does not extend, and the stop-sign card stays with 111', async ({
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
