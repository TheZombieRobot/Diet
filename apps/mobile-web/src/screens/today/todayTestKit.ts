// The Today fixture of item 16 design section 5.2, written through the repositories over
// fake-indexeddb with the test clock. Imported only by tests; every value is synthetic.
import { type Instant, READINESS_WORDING, type ReadinessQuestionId, type YesNo } from '@diet/core';
import { today, weight } from '@diet/core/copy/health';
import { act, render, screen } from '@testing-library/react';
import { createElement } from 'react';
import { appStorageStore } from '../../db/runtime';
import type { UpdatePatch } from '../../db/repos';
import { onboardForTests, openTestDb, type TestDb, testEnv } from '../../db/testKit';
import { storageStore } from '../../pwa/storage';
import { TodayScreen } from './TodayScreen';

const ZONE = 'Pacific/Auckland';

/** Wednesday 15 March 2000, 2:20 pm in Auckland (NZDT). */
export const TODAY_NOW: Instant = '2000-03-15T01:20:00.000Z';
/** Setup finished, the first low-carb day and the Kickstart start: 1 March 2000. */
export const SETUP_AT: Instant = '2000-03-01T00:00:00.000Z';
/** The running fast's start: 7:00 pm on 14 March. */
export const FAST_START: Instant = '2000-03-14T06:00:00.000Z';

export interface TodayFixture {
  /** Answers written before any record (default all "no"). */
  readonly answers?: Partial<Record<ReadinessQuestionId, YesNo>>;
  /** Answers written after the fast began (as when Q2, Q3 or Q5 turns yes mid-fast). */
  readonly answersLater?: Partial<Record<ReadinessQuestionId, YesNo>>;
  readonly profile?: UpdatePatch<'profile'>;
  readonly storage?: 'protected' | 'not-protected';
  /** When setup was finished (default SETUP_AT). */
  readonly completedAt?: Instant;
  /** Start a Kickstart at SETUP_AT (default true). */
  readonly kickstart?: boolean;
  /** Start a fast at FAST_START (default true), or at another instant. */
  readonly fast?: boolean | Instant;
  /** Write the fixture's water and steps (default true). */
  readonly logs?: boolean;
  readonly now?: Instant;
  /** Further writes, at the clock TODAY_NOW (or `now`), before Today opens. */
  readonly seed?: ((test: TestDb) => Promise<unknown>) | undefined;
}

/**
 * The fixture: setup finished on 1 March, q1–q7 "no", a female profile in keto mode with the
 * carb ceiling and first low-carb day on 1 March, a 100 kg onboarding weight, a Kickstart from 1
 * March (today is day 15), 23:1 from 6:00 pm as the Kickstart default, a fast from 7:00 pm on 14
 * March, water at 8:00 and 10:00 am with an electrolyte tick at 8:05 am, and 12,000 steps
 * yesterday.
 */
export async function todayFixture(fixture: TodayFixture = {}): Promise<TestDb> {
  const test = await openTestDb({ env: testEnv(fixture.completedAt ?? SETUP_AT) });
  await onboardForTests(test, {
    answers: fixture.answers ?? {},
    weightKg: 100,
    completedAt: fixture.completedAt ?? SETUP_AT,
    profile: {
      sex: 'female',
      heightCm: 170,
      birthYear: 1970,
      dietMode: 'keto',
      firstLowCarbAt: SETUP_AT,
      carbCeilingStartedAt: SETUP_AT,
      ...fixture.profile,
    },
  });
  await test.repos.targets.update({
    fastingPreset: '23:1',
    eatingWindow: { start: '18:00', end: '19:00' },
    presetChosenBy: 'kickstart-default',
  });
  // Records only: the Kickstart and readiness writers stay item 13's and 14's actions.
  if (fixture.kickstart ?? true) {
    await test.db.kickstart_periods.put({
      id: test.env.randomId(),
      startedAt: test.env.now(),
      timeZone: ZONE,
      endedAt: null,
      endedTimeZone: null,
      endReason: null,
    });
  }
  const fast = fixture.fast ?? true;
  if (fast !== false) {
    test.env.set(fast === true ? FAST_START : fast);
    await test.repos.fasts.start();
  }
  test.env.set(fixture.now ?? TODAY_NOW);
  for (const [q, answer] of Object.entries(fixture.answersLater ?? {})) {
    await test.db.readiness.put({
      questionId: q as ReadinessQuestionId,
      answer,
      wordingVersion: READINESS_WORDING[q as ReadinessQuestionId],
      answeredAt: test.env.now(),
    });
  }
  if (fixture.logs ?? true) {
    const water = (at: Instant, ml: number, electrolyte: boolean) =>
      test.repos.water.create({ ml, electrolyte, at, timeZone: ZONE });
    await water('2000-03-14T19:00:00.000Z', 250, false); // 8:00 am on 15 March
    await water('2000-03-14T19:05:00.000Z', 0, true);
    await water('2000-03-14T21:00:00.000Z', 250, false); // 10:00 am
    await test.repos.steps.create({ date: '2000-03-14', steps: 12000, source: 'manual' });
  }
  if (fixture.seed !== undefined) await fixture.seed(test);
  storageStore.set(fixture.storage ?? 'protected');
  appStorageStore.set(test.storage);
  return test;
}

/**
 * Today's cards appear after two reads in a row (Today's own, which holds the setup guard, then
 * each card's), so under a loaded test run they can take longer than the 1 s default to show.
 */
const LOADED = { timeout: 5000 };

/** Renders Today alone, in a `main` as in the app shell, and waits for its cards and status. */
export async function renderToday(): Promise<HTMLElement> {
  render(createElement('main', null, createElement(TodayScreen)));
  await screen.findByRole('region', { name: today.cards.movement }, LOADED);
  await screen.findByRole('region', { name: weight.card.label }, LOADED);
  // Item 15's card: Fast, or Fasting while switched off, or only the reflux log (F41).
  await screen.findByRole('region', { name: /^(Fast|Fasting|Reflux)$/ }, LOADED);
  return screen.getByRole('main');
}

/** Moves the clock and lets Today read it (as on return to the app). */
export async function clockTo(test: TestDb, at: Instant): Promise<void> {
  test.env.set(at);
  await act(async () => {
    window.dispatchEvent(new Event('focus'));
    await Promise.resolve();
  });
}

/** Resets what the fixture set outside the database. */
export function resetToday(test: TestDb | undefined): void {
  appStorageStore.set(null);
  storageStore.set('checking');
  window.location.hash = '';
  test?.db.shutDown();
}

/** The labels of the cards in `main`, in order (the card pair's two count as two). */
export function regionLabels(main: HTMLElement): string[] {
  return [...main.querySelectorAll('section')].map(
    (section) => section.querySelector('h2')?.textContent ?? '',
  );
}
