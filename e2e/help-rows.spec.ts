import { expect, type Page, test } from '@playwright/test';
import type { FastRecord } from '../packages/core/src/index';
import {
  alcohol,
  fasting,
  onboarding,
  privacy,
  reflux,
  targets,
  weight,
} from '../packages/core/src/copy/health';
import {
  fixtureId,
  onDay,
  SCENARIO_ZONE,
  scenarioInstant,
  WEIGHT_SCENARIOS,
  weightScenario,
} from '../packages/test-fixtures/src/index';
import { goTo, heading } from './support/app';
import { helpRowProblems } from './support/helpRows';
import { seedRecords } from './support/seed';

// HS-13 at 200% text on a 360, a 390 and a 412 px phone (180, 195 and 206 px; DECISIONS row of
// 19 Oct; re-check V11): every help and emergency number row in the app keeps its words and
// numbers whole (full review F19); on a 320 px phone at 200% text (160 px) its phone numbers stay
// whole and inside the row, and at 120 px they are still never split (re-check V20). Setup's own
// rows (the alcohol notice, About inside setup) are checked at 180 px by first-run P8's sweep,
// and the slow opening screen at every width by its own P8 test; this spec reaches the rest with
// synthetic phones.

test.use({ timezoneId: 'Pacific/Auckland' });

/** 200% text on a 360, a 390 and a 412 px phone. */
const WIDTHS = [180, 195, 206] as const;

const region = (page: Page, name: string) => page.getByRole('region', { name, exact: true });
const callRows = (page: Page, name: string) =>
  region(page, name).locator('a[href^="tel:"], a[href^="sms:"]');

/** helpRowProblems on the screen as it stands, at each width, then its phone numbers narrower. */
async function atEveryWidth(page: Page, where: string): Promise<string[]> {
  const problems: string[] = [];
  for (const width of WIDTHS) {
    await page.setViewportSize({ width, height: 740 });
    problems.push(...(await helpRowProblems(page, `${where} at ${width} px`)));
  }
  // 200% text on a 320 px phone: each number whole and inside its row. 120 px, narrower than any
  // phone at 200% text: still never split, though it may run past the row's edge.
  await page.setViewportSize({ width: 160, height: 740 });
  problems.push(...(await helpRowProblems(page, `${where} at 160 px`, { numbersOnly: true })));
  await page.setViewportSize({ width: 120, height: 740 });
  const narrowest = { numbersOnly: true, edges: false };
  problems.push(...(await helpRowProblems(page, `${where} at 120 px`, narrowest)));
  return problems;
}

test('F19, HS-13: at 200% text on a phone every help and emergency number row reads whole: Today, Weight, Fasting and reflux, About', async ({
  page,
}) => {
  // Kickstart day 10, readiness answer 7 "yes" (the "talk to someone" card) and a fast started
  // 26 hours ago, so Today shows the help card, the Kickstart stop-signs and the Fast card's rows.
  const seen = onDay({ ...WEIGHT_SCENARIOS.K10, readiness: { q7: 'yes' } }, 10, '09:00');
  const running: FastRecord = {
    id: fixtureId(41_000),
    startedAt: scenarioInstant(seen.day1, 9, '07:00'),
    timeZone: SCENARIO_ZONE,
    endedAt: null,
    endedTimeZone: null,
    plannedFastMinutes: null,
    snackTime: null,
    dinnerTime: null,
    note: null,
  };
  await seedRecords(page, { ...weightScenario(seen), fasts: [running] }, { now: seen.now });

  await expect(callRows(page, alcohol.helpCardLabel)).toHaveCount(3);
  await expect(callRows(page, weight.stopSigns.label)).toHaveCount(2);
  await expect(callRows(page, fasting.card.label)).toHaveCount(2);
  const problems = await atEveryWidth(page, 'Today');
  await goTo(page, 'Weight');
  await expect(callRows(page, weight.stopSigns.label)).toHaveCount(2);
  problems.push(...(await atEveryWidth(page, 'Weight')));
  await goTo(page, 'Fasting and reflux');
  await expect(callRows(page, fasting.stopSigns.label)).toHaveCount(2);
  await expect(callRows(page, reflux.label)).toHaveCount(2);
  problems.push(...(await atEveryWidth(page, 'Fasting and reflux')));
  await goTo(page, 'About');
  await expect(page.locator('a[href^="tel:"], a[href^="sms:"]')).toHaveCount(6);
  problems.push(...(await atEveryWidth(page, 'About')));
  expect(problems).toEqual([]);
});

test('F19, HS-13 (re-check V13): at 200% text on a phone the rows read whole on Welcome, on Diet and targets after a stop-sign answer, and on a storage failure screen', async ({
  page,
}) => {
  await page.goto('./');
  await expect(heading(page)).toHaveText(onboarding.welcome.title);
  await expect(page.locator('a[href^="tel:"]')).not.toHaveCount(0);
  const problems = await atEveryWidth(page, 'Welcome');

  // Kickstart day 19 with a palpitations "yes": Diet and targets shows the stop-sign lines and
  // the 111 and Healthline rows under its energy figures.
  const seen = onDay(
    { ...WEIGHT_SCENARIOS.K42, periods: [{ startDay: 1, stopSignOnDay: 19 }] },
    19,
  );
  await seedRecords(page, weightScenario(seen), { now: seen.now });
  await goTo(page, 'Diet and targets');
  await expect(callRows(page, targets.energy.label)).toHaveCount(2);
  problems.push(...(await atEveryWidth(page, 'Diet and targets')));

  // A newer version of the app upgraded the records (another tab, after an update): this tab
  // shows a storage failure screen, with every help number.
  await page.evaluate(
    () =>
      new Promise<void>((resolve, reject) => {
        const request = indexedDB.open('diet', 990);
        request.onupgradeneeded = () => {
          request.result.createObjectStore('example_newer');
        };
        request.onsuccess = () => {
          request.result.close();
          resolve();
        };
        request.onerror = () => {
          reject(new Error('upgrade failed'));
        };
      }),
  );
  await expect(page.getByTestId('storage-failure')).toHaveText(
    privacy.storageFailure['reload-needed'],
  );
  await expect(
    region(page, privacy.storageFailure.helpTitle).locator('a[href^="tel:"]'),
  ).toHaveCount(4);
  problems.push(...(await atEveryWidth(page, 'the storage failure screen')));
  expect(problems).toEqual([]);
});
