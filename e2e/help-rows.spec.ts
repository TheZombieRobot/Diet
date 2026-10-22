import { expect, type Page, test } from '@playwright/test';
import type { FastRecord } from '../packages/core/src/index';
import { alcohol, fasting, reflux, weight } from '../packages/core/src/copy/health';
import {
  fixtureId,
  onDay,
  SCENARIO_ZONE,
  scenarioInstant,
  WEIGHT_SCENARIOS,
  weightScenario,
} from '../packages/test-fixtures/src/index';
import { goTo } from './support/app';
import { helpRowProblems } from './support/helpRows';
import { seedRecords } from './support/seed';

// HS-13 at 200% text on a 360 px phone (180 px; DECISIONS row of 19 Oct): every help and
// emergency number row in the app keeps its words and numbers whole (full review F19). Setup's
// own rows (Welcome, the alcohol notice, About inside setup, the slow opening screen) are checked
// by first-run P8's sweep; this test reaches the rest with one synthetic phone.

test.use({ timezoneId: 'Pacific/Auckland' });

const region = (page: Page, name: string) => page.getByRole('region', { name, exact: true });
const callRows = (page: Page, name: string) =>
  region(page, name).locator('a[href^="tel:"], a[href^="sms:"]');

test('F19, HS-13: at 180 px every help and emergency number row reads whole: Today, Weight, Fasting and reflux, About', async ({
  page,
}) => {
  await page.setViewportSize({ width: 180, height: 740 });
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
  const problems = await helpRowProblems(page, 'Today');
  await goTo(page, 'Weight');
  await expect(callRows(page, weight.stopSigns.label)).toHaveCount(2);
  problems.push(...(await helpRowProblems(page, 'Weight')));
  await goTo(page, 'Fasting and reflux');
  await expect(callRows(page, fasting.stopSigns.label)).toHaveCount(2);
  await expect(callRows(page, reflux.label)).toHaveCount(2);
  problems.push(...(await helpRowProblems(page, 'Fasting and reflux')));
  await goTo(page, 'About');
  await expect(page.locator('a[href^="tel:"], a[href^="sms:"]')).toHaveCount(6);
  problems.push(...(await helpRowProblems(page, 'About')));
  expect(problems).toEqual([]);
});
