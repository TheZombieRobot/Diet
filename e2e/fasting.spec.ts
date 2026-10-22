import { expect, type Page, test } from '@playwright/test';
import {
  drinkFigures,
  type FastRecord,
  parseClockTime,
  type PlanDayRecord,
  type Snapshot,
  type SymptomRecord,
  zonedWallTimeToInstant,
} from '../packages/core/src/index';
import { fasting, privacy, readiness, reflux, schedule } from '../packages/core/src/copy/health';
import { fixtureId } from '../packages/test-fixtures/src/index';
import { commerceRules, healthPhraseRules } from '../tools/scans/rules';
import { scanText } from '../tools/scans/scan';
import {
  goTo,
  heading,
  renderedText,
  returnToApp,
  waitForServiceWorkerControl,
} from './support/app';
import { fastingSetup, seedRecords } from './support/seed';

// The fasting timer, history and reflux log in the production build (item 15 design 7.4): FS-01
// to FS-05, FS-08, FL-12 (wiring), FL-14, FL-15, HS-02, HS-03, HS-17, HS-18 and the timer offline
// across a restart. Every test seeds synthetic records on a new phone, with the clock fixed.

test.use({ timezoneId: 'Pacific/Auckland' });

const NZ = 'Pacific/Auckland';
const D = '2000-01-04';
const at = (date: string, time: string): string =>
  new Date(zonedWallTimeToInstant(date, parseClockTime(time), NZ)).toISOString();

const region = (page: Page, name: string) => page.getByRole('region', { name, exact: true });
const fastCard = (page: Page) => region(page, fasting.card.label);
const ONE_MEAL = {
  fastingPreset: '23:1',
  eatingWindow: { start: '18:00', end: '19:00' },
  presetChosenBy: 'user',
} as const;

let nextId = 31_000;
function fast(startedAt: string, endedAt: string | null): FastRecord {
  return {
    id: fixtureId(nextId++),
    startedAt,
    timeZone: NZ,
    endedAt,
    endedTimeZone: endedAt === null ? null : NZ,
    plannedFastMinutes: null,
    snackTime: null,
    dinnerTime: null,
    note: null,
  };
}

/** Moves the fixed clock and brings the app back into view, as on return to the phone. */
async function clockTo(page: Page, instant: string): Promise<void> {
  await page.clock.setFixedTime(new Date(instant));
  await returnToApp(page);
}

/** The plan_days rows, read with raw IndexedDB. */
function planDays(page: Page): Promise<PlanDayRecord[]> {
  return page.evaluate(
    () =>
      new Promise((resolve, reject) => {
        const request = indexedDB.open('diet');
        request.onerror = () => {
          reject(new Error('open failed'));
        };
        request.onsuccess = () => {
          const db = request.result;
          const all = db.transaction('plan_days', 'readonly').objectStore('plan_days').getAll();
          all.onsuccess = () => {
            db.close();
            resolve(all.result as PlanDayRecord[]);
          };
        };
      }),
  );
}

test('FS-01, HS-17, FL-14: the pattern form on the Fasting screen, with a Kickstart running', async ({
  page,
}) => {
  const snapshot = fastingSetup(D, {
    periods: [{ startDay: 1 }],
    profile: { kickstartOptIn: true },
  });
  await seedRecords(page, snapshot, { now: at(D, '09:00') });
  await expect(fastCard(page).getByText('23:1 · One meal')).toBeVisible();
  await page.goto('./#/fasting/pattern');
  // FS-04: the stop-signs are on the screen before any fast is started.
  const signs = region(page, fasting.stopSigns.label);
  await expect(signs.locator('.ui-plain-list li')).toHaveText([...fasting.stopSigns.signs]);
  await expect(signs.locator('a[href="tel:111"]')).toBeVisible();
  const card = region(page, fasting.pattern.label);
  const choices = card.getByRole('radiogroup', { name: schedule.presetsLegend });
  await expect(choices.locator('.ui-choice__label')).toHaveText([
    '16:8',
    '18:6',
    '20:4',
    '22:2',
    '23:1',
    schedule.custom,
    schedule.none,
  ]);
  await expect(choices.getByRole('radio', { name: /^23:1/ })).toBeChecked();
  await expect(choices.getByText(schedule.kickstartChip)).toBeVisible();
  await expect(page).toHaveURL(/#\/fasting$/);
  await choices.getByRole('radio', { name: /^22:2/ }).check();
  await card.getByRole('button', { name: schedule.save }).click();
  await expect(card.getByText('2 h eating, 22 h fasting')).toBeVisible();

  await card.getByRole('button', { name: fasting.pattern.change }).click();
  await card.getByRole('radio', { name: /^23:1/ }).check();
  await card.getByRole('button', { name: schedule.save }).click();
  await expect(card.getByText('1 h eating, 23 h fasting')).toBeVisible();
  await expect(page.getByText(fasting.card.overCeiling)).toHaveCount(0);

  await card.getByRole('button', { name: fasting.pattern.change }).click();
  await card.getByRole('radio', { name: new RegExp(`^${schedule.custom}`) }).check();
  await card.getByLabel(schedule.startLabel).fill('18:00');
  await card.getByLabel(schedule.endLabel).fill('18:00');
  await expect(card.getByText(schedule.errors.sameTime)).toBeVisible();
});

test('FS-01, C07: with readiness answer 4, no pattern is chosen for the owner and the pharmacist note comes first', async ({
  page,
}) => {
  const snapshot = fastingSetup(D, {
    readiness: { q4: 'yes' },
    targets: { fastingPreset: null, eatingWindow: null, presetChosenBy: null },
  });
  await seedRecords(page, snapshot, { now: at(D, '09:00') });
  await page.goto('./#/fasting/pattern');
  const card = region(page, fasting.pattern.label);
  const choices = card.getByRole('radiogroup', { name: schedule.presetsLegend });
  for (const name of ['16:8', '18:6', '20:4', '22:2', '23:1']) {
    await expect(choices.getByRole('radio', { name: new RegExp(`^${name}`) })).not.toBeChecked();
  }
  const note = card.getByText(schedule.pharmacistNote);
  await expect(note).toBeVisible();
  expect(
    await note.evaluate(
      (n, legend) =>
        n.compareDocumentPosition(
          [...document.querySelectorAll('legend')].find((l) => l.textContent === legend) ?? n,
        ) & Node.DOCUMENT_POSITION_FOLLOWING,
      schedule.presetsLegend,
    ),
  ).toBeTruthy();
});

test('FS-03: the timer survives closing the app, offline, and reads from the stored start', async ({
  page,
  context,
}) => {
  await seedRecords(page, fastingSetup(D, { targets: ONE_MEAL }), { now: at(D, '18:59') });
  await waitForServiceWorkerControl(page);
  await context.setOffline(true);
  await clockTo(page, at(D, '19:00'));
  await fastCard(page).getByRole('button', { name: fasting.card.start }).click();
  await expect(fastCard(page).getByText(fasting.card.started)).toBeVisible();
  await page.close();

  const second = await context.newPage();
  await second.clock.setFixedTime(new Date(at('2000-01-05', '09:30')));
  await second.goto('./');
  await expect(heading(second)).toHaveText('Today');
  await expect(fastCard(second).getByTestId('fast-timer')).toContainText('14 h 30 m');
  await second.reload();
  await expect(fastCard(second).getByTestId('fast-timer')).toContainText('14 h 30 m');
  await expect(fastCard(second).getByRole('button', { name: fasting.card.end })).toBeEnabled();
});

test('FS-02, HS-02: past 24 hours the warning shows, the history tags it, and the streak is neither added to nor reset', async ({
  page,
}) => {
  const snapshot: Snapshot = {
    ...fastingSetup('2000-01-02', { today: D, targets: ONE_MEAL }),
    fasts: [
      fast(at('2000-01-02', '19:00'), at('2000-01-03', '18:00')),
      fast(at('2000-01-03', '19:00'), at(D, '18:00')),
    ],
  };
  await seedRecords(page, snapshot, { now: at(D, '19:00') });
  await fastCard(page).getByRole('button', { name: fasting.card.start }).click();
  await clockTo(page, at('2000-01-05', '19:01'));
  await expect(fastCard(page).getByText(fasting.card.overCeiling)).toBeVisible();
  await expect(fastCard(page).getByText(fasting.card.overCeilingUnit)).toBeVisible();
  await expect(fastCard(page).getByText(fasting.card.fineToEat)).toBeVisible();
  await goTo(page, 'Fasting and reflux');
  await expect(fastCard(page).getByText(fasting.card.overCeiling)).toBeVisible();
  // FS-04: the stop-signs and their call rows.
  const signs = region(page, fasting.stopSigns.label);
  await expect(signs.locator('.ui-plain-list li')).toHaveText([...fasting.stopSigns.signs]);
  await expect(signs.getByText(fasting.stopSigns.action)).toBeVisible();
  await expect(signs.locator('a[href="tel:111"]')).toBeVisible();
  await expect(signs.locator('a[href="tel:0800611116"]')).toBeVisible();
  await fastCard(page).getByRole('button', { name: fasting.card.end }).click();
  const history = region(page, fasting.history.label);
  await expect(history.getByText(fasting.history.over24)).toHaveCount(1);
  await expect(history.getByText('2 days in a row with a completed fast.')).toBeVisible();
});

test('FS-02, HS-02: ending a fast and starting another a minute later does not reset the 24 hours', async ({
  page,
}) => {
  const snapshot: Snapshot = {
    ...fastingSetup('2000-01-03', { today: D, targets: ONE_MEAL }),
    fasts: [fast(at('2000-01-03', '19:00'), null)],
  };
  await seedRecords(page, snapshot, { now: at(D, '18:50') });
  await fastCard(page).getByRole('button', { name: fasting.card.end }).click();
  await clockTo(page, at(D, '18:51'));
  await fastCard(page).getByRole('button', { name: fasting.card.start }).click();
  // F21: Start within the hour says it would join the last fast, and asks first.
  await fastCard(page).getByRole('button', { name: fasting.card.joinAskStart }).click();
  // The end may be stamped a moment late, so the gap reads 1 m or less than a minute.
  const joined =
    /^This fast started (?:1 m|less than a minute) after your last fast ended, so it counts as part of the same fast\./;
  await expect(fastCard(page).getByText(joined)).toBeVisible();
  await clockTo(page, new Date(Date.parse(at(D, '18:51')) + (23 * 60 + 49) * 60_000).toISOString());
  await expect(fastCard(page).getByText(fasting.card.overCeiling)).toBeVisible();
  await expect(fastCard(page).getByRole('button', { name: fasting.card.end })).toBeEnabled();
  // The note names the gap between the fasts, so it is still true a day later (review).
  await expect(fastCard(page).getByText(joined)).toBeVisible();
});

test('FS-05: a drink during the fast shows the neutral note, with no penalty or streak wording', async ({
  page,
}) => {
  const beverage = { volumeMl: 330, abvPercent: 5, label: null };
  const snapshot: Snapshot = {
    ...fastingSetup('2000-01-03', { today: D, targets: ONE_MEAL }),
    fasts: [fast(at('2000-01-03', '19:00'), null)],
    drinks_log: [
      {
        id: fixtureId(32_000),
        at: at('2000-01-03', '21:00'),
        timeZone: NZ,
        beverageId: null,
        name: 'Example lager',
        count: 1,
        beverage,
        ...drinkFigures(beverage),
      },
    ],
  };
  await seedRecords(page, snapshot, { now: at(D, '09:00') });
  await expect(fastCard(page).getByText(fasting.alcoholNote)).toBeVisible();
  const text = await renderedText(page);
  expect(text).not.toMatch(/streak|penalt|broke/i);
  expect(scanText('Today', text, [...healthPhraseRules, ...commerceRules])).toEqual([]);
  await expect(fastCard(page).getByRole('button', { name: fasting.card.end })).toBeEnabled();
});

test('FS-08, HS-03, RD-04: with an eating-disorder answer there is no fasting on Today, only the reflux log; an open fast can be ended', async ({
  page,
}) => {
  const snapshot = fastingSetup(D, { readiness: { q5: 'yes' }, targets: ONE_MEAL });
  await seedRecords(page, snapshot, { now: at(D, '09:00'), expectGated: true });
  await expect(region(page, reflux.label)).toBeVisible();
  await expect(fastCard(page)).toHaveCount(0);
  await expect(page.getByRole('button', { name: fasting.card.start })).toHaveCount(0);
  await region(page, reflux.label).getByRole('link', { name: fasting.card.refluxLink }).click();
  await expect(heading(page)).toHaveText('Fasting and reflux');
  await expect(page.getByRole('region').first()).toHaveAccessibleName(reflux.label);
  await expect(page.getByRole('link', { name: readiness.changeAnswersLink })).toHaveCount(0);
  await page.goto('./#/fasting');
  await expect(page.getByText(fasting.gated.title)).toBeVisible();
  await expect(page.getByTestId('fast-timer')).toHaveCount(0);
  await expect(region(page, fasting.history.label)).toHaveCount(0);

  const open: Snapshot = { ...snapshot, fasts: [fast(at('2000-01-03', '19:00'), null)] };
  await seedRecords(page, open, { now: at(D, '09:00'), expectGated: true });
  const card = region(page, fasting.card.gatedLabel);
  await expect(card.getByText(fasting.card.fineToEat)).toBeVisible();
  await expect(card.locator('a[href="tel:111"]')).toBeVisible();
  await card.getByRole('button', { name: fasting.gated.endOpenFast }).click();
  await expect(page.getByRole('button', { name: fasting.gated.endOpenFast })).toHaveCount(0);
  await expect(region(page, reflux.label)).toBeVisible();
});

test('FL-12, C73: on 23:1 with no meals planned, the 5 pm snack is one tap, moves the running plan, and Undo removes it', async ({
  page,
}) => {
  const snapshot: Snapshot = {
    ...fastingSetup('2000-01-03', { today: D, targets: ONE_MEAL }),
    fasts: [fast(at('2000-01-03', '19:00'), null)],
  };
  await seedRecords(page, snapshot, { now: at(D, '09:00') });
  const card = fastCard(page);
  await expect(card.getByText(fasting.mealCheck.unavailableOneMeal)).toBeVisible();
  await expect(card.getByText('Eat 6:00 pm – 7:00 pm', { exact: true })).toBeVisible();
  await card.getByRole('button', { name: fasting.mealCheck.addSnack }).click();
  await expect(
    card.getByText('5 pm snack added for tonight. Eat 5:00 pm – 7:00 pm.'),
  ).toBeVisible();
  await expect(card.getByText('Eat 5:00 pm – 7:00 pm', { exact: true })).toBeVisible();
  expect(await planDays(page)).toEqual([
    expect.objectContaining({ date: D, meals: [], eatingWindow: { start: '17:00', end: '19:00' } }),
  ]);
  await card.getByRole('button', { name: fasting.mealCheck.undo }).click();
  await expect(card.getByText('Eat 6:00 pm – 7:00 pm', { exact: true })).toBeVisible();
  expect(await planDays(page)).toEqual([]);
  await expect(card.getByRole('button', { name: fasting.card.end })).toBeEnabled();
});

test('FL-15: a reflux symptom brings the options that day and the next, not the day after', async ({
  page,
}) => {
  const symptom: SymptomRecord = {
    id: fixtureId(33_000),
    at: at(D, '08:00'),
    timeZone: NZ,
    symptom: 'heartburn',
    severity: null,
    note: null,
  };
  await seedRecords(
    page,
    { ...fastingSetup(D, { targets: ONE_MEAL }), symptom_log: [symptom] },
    { now: at(D, '09:00') },
  );
  const options = () => fastCard(page).getByTestId('reflux-options');
  /** Waits for the day's own view (its date, its window line, the Nutrition card read), so a
   * check never passes on the day before's view still on screen (review F46). */
  const dayShown = async (date: string) => {
    await expect(page.getByTestId('today-date')).toHaveText(date);
    await expect(fastCard(page).getByText('Eat 6:00 pm – 7:00 pm', { exact: true })).toBeVisible();
    await expect(page.getByText(privacy.backupCard.notReady)).toHaveCount(0);
  };
  await dayShown('Tuesday 4 January');
  await expect(options().getByText(reflux.options.title.today)).toBeVisible();
  await clockTo(page, at('2000-01-05', '09:00'));
  await dayShown('Wednesday 5 January');
  await expect(options()).toBeVisible();
  await clockTo(page, at('2000-01-06', '09:00'));
  await dayShown('Thursday 6 January');
  await expect(options()).toHaveCount(0);
});
