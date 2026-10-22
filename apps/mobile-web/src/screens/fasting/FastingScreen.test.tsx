// The Fast card and the Fasting screen (item 15 design 7.3): the whole app over the real
// repositories on fake-indexeddb, with the test clock. Synthetic records only.
import { fillTemplate, type Instant, parseClockTime, zonedWallTimeToInstant } from '@diet/core';
import { fasting, privacy, readiness, reflux, schedule } from '@diet/core/copy/health';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { appStorageStore } from '../../db/runtime';
import type { UpdatePatch } from '../../db/repos';
import {
  type OnboardOptions,
  onboardForTests,
  openTestDb,
  seedPlanDay,
  type TestDb,
  testEnv,
} from '../../db/testKit';
import { GateNotice } from '../../onboarding/GateNotice';
import { openApp } from '../../onboarding/flowTestKit';
import { storageStore } from '../../pwa/storage';
import { presetMovedStore } from '../weight/stores';
import { FastingScreen } from './FastingScreen';

const NZ = 'Pacific/Auckland';
const SECOND = 1000;
const MIN = 60 * SECOND;
const HOUR = 60 * MIN;
const D = '2000-01-04';
const at = (date: string, time: string): number =>
  zonedWallTimeToInstant(date, parseClockTime(time), NZ);
const iso = (ms: number): Instant => new Date(ms).toISOString();
const ONE_MEAL: UpdatePatch<'targets'> = {
  fastingPreset: '23:1',
  eatingWindow: { start: '18:00', end: '19:00' },
  presetChosenBy: 'user',
};

let test: TestDb | undefined;
beforeEach(() => {
  storageStore.set('protected');
});
afterEach(() => {
  vi.restoreAllMocks();
  cleanup();
  appStorageStore.set(null);
  storageStore.set('checking');
  presetMovedStore.set(null);
  test?.db.shutDown();
  test = undefined;
  window.location.hash = '';
});

const db = (): TestDb => {
  if (test === undefined) throw new Error('no test database');
  return test;
};

interface SetUp extends OnboardOptions {
  readonly now: number;
  readonly targets?: UpdatePatch<'targets'>;
  /** Writes made before the app opens, at the clock they set. */
  readonly seed?: (t: TestDb) => Promise<void>;
}

/** A finished setup (every answer "no" unless given), the seeded records, then the app at `route`. */
async function setUp(
  route: string,
  { now, targets = ONE_MEAL, seed, ...options }: SetUp,
): Promise<TestDb> {
  test = await openTestDb({ env: testEnv(iso(now)) });
  await onboardForTests(test, { weightKg: null, ...options });
  await test.repos.targets.update(targets);
  if (seed !== undefined) await seed(test);
  test.env.set(iso(now));
  appStorageStore.set(test.storage);
  await openApp(route);
  return test;
}

/** Moves the clock and lets the screens read it (as on return to the app). */
async function clockTo(ms: number): Promise<void> {
  db().env.set(iso(ms));
  await act(async () => {
    window.dispatchEvent(new Event('focus'));
    await new Promise((resolve) => setTimeout(resolve, 20));
  });
}

/** A completed fast written through the repository at the given instants. */
async function completedFast(t: TestDb, startMs: number, endMs: number): Promise<void> {
  t.env.set(iso(startMs));
  const fast = await t.repos.fasts.start();
  t.env.set(iso(endMs));
  await t.repos.fasts.end(fast.id);
}

/** A Kickstart started today with its untouched 23:1 default stored, keto since before it. */
const KICKSTART_DEFAULT: Omit<SetUp, 'now'> = {
  profile: { kickstartOptIn: true, carbCeilingStartedAt: iso(at('2000-01-02', '00:00')) },
  targets: { ...ONE_MEAL, presetChosenBy: 'kickstart-default' },
  seed: async (s) => {
    await s.repos.kickstart.startPeriod();
  },
};

const region = (name: string) => screen.getByRole('region', { name });
const fastCard = () => region(fasting.card.label);
const tap = (container: HTMLElement, name: string | RegExp) => {
  fireEvent.click(within(container).getByRole('button', { name }));
};
const timer = () => within(fastCard()).getByTestId('fast-timer').textContent;
const enabled = (container: HTMLElement, name: string) =>
  !within(container).getByRole('button', { name }).hasAttribute('disabled');
/** Waits for focus to land on an element with this text (after an action replaced a button). */
const focusOn = (text: string) =>
  waitFor(() => {
    expect(document.activeElement?.textContent).toContain(text);
  });
/** A running fast started at `startMs`, written before the app opens. */
const runningFrom =
  (startMs: number) =>
  async (t: TestDb): Promise<void> => {
    t.env.set(iso(startMs));
    await t.repos.fasts.start();
  };

describe('the Fast card on Today (design 3.3; FS-02, FS-03, HS-02, HS-18)', () => {
  it('Start, the timer from the stored start, Undo for 60 s, and End in every phase', async () => {
    await setUp('#/today', { now: at(D, '19:00') });
    const card = await screen.findByRole('region', { name: fasting.card.label });
    expect(within(card).getByText('23:1 · One meal')).toBeTruthy();
    // Tonight's window has just closed: the next one is named as tomorrow's (review).
    expect(within(card).getByText('Eat tomorrow 6:00 pm – 7:00 pm')).toBeTruthy();
    tap(card, fasting.card.start);
    await within(card).findByText(fasting.card.started);
    // Focus moves to the line that replaced Start; Undo brings Start back, focused (review).
    await focusOn(fasting.card.started);
    tap(fastCard(), fasting.card.undo);
    await waitFor(() => {
      expect(document.activeElement?.textContent).toBe(fasting.card.start);
    });
    tap(fastCard(), fasting.card.start);
    await within(fastCard()).findByText(fasting.card.started);
    expect(timer()).toBe('0 h 0 mof 23 h');
    expect(within(fastCard()).getByText('Eat tomorrow 6:00 pm – 7:00 pm')).toBeTruthy();
    await clockTo(at(D, '19:01'));
    expect(within(fastCard()).queryByText(fasting.card.started)).toBeNull();
    // FS-03: always the stored start to now.
    await clockTo(at('2000-01-05', '09:30'));
    expect(timer()).toContain('14 h 30 m');
    // Today's date moves with the new day's read, so the line is waited for.
    expect(await within(fastCard()).findByText('Eat 6:00 pm – 7:00 pm')).toBeTruthy();
    await clockTo(at('2000-01-05', '18:00'));
    expect(within(fastCard()).getByText(fasting.card.nearCeiling)).toBeTruthy();
    await clockTo(at('2000-01-05', '19:00'));
    expect(within(fastCard()).queryByText(fasting.card.overCeiling)).toBeNull();
    await clockTo(at('2000-01-05', '19:00') + 1);
    const over = fastCard();
    expect(within(over).getByText(fasting.card.overCeiling)).toBeTruthy();
    expect(within(over).getByText(fasting.card.fineToEat)).toBeTruthy();
    expect(within(over).getByText(fasting.card.overCeilingUnit)).toBeTruthy();
    expect(within(over).queryByText(/^Eat /)).toBeNull();
    expect(over.querySelector('.ui-fast-meter--over')).not.toBeNull();
    const calls = [...over.querySelectorAll('a[href^="tel:"]')].map((a) => a.getAttribute('href'));
    expect(calls).toEqual(['tel:111', 'tel:0800611116']);
    tap(over, fasting.card.end);
    await within(fastCard()).findByText('Fast ended after 24 h.');
    expect(within(fastCard()).getByText(fasting.card.overCeiling)).toBeTruthy();
    // The underlying state stays: Start is there while the "ended" line shows.
    expect(within(fastCard()).getByRole('button', { name: fasting.card.start })).toBeTruthy();
  });

  it('no restart trick: a fast a minute after the last counts as the same fast (C30)', async () => {
    await setUp('#/today', {
      now: at(D, '18:51'),
      seed: (t) => completedFast(t, at('2000-01-03', '19:00'), at(D, '18:50')),
    });
    tap(await screen.findByRole('region', { name: fasting.card.label }), fasting.card.start);
    // F21: Start asks first; "Start now" starts it as part of the last fast.
    tap(fastCard(), fasting.card.joinAskStart);
    const joined =
      "This fast started 1 m after your last fast ended, so it counts as part of the same fast. It's fine to eat before starting another.";
    await within(fastCard()).findByText(joined);
    expect(timer()).toContain('23 h 51 m');
    // HS-18: End stays on a joined fast.
    expect(enabled(fastCard(), fasting.card.end)).toBe(true);
    await clockTo(at(D, '18:51') + 23 * HOUR + 49 * MIN);
    expect(within(fastCard()).getByText(fasting.card.overCeiling)).toBeTruthy();
    expect(timer()).toContain('47 h 40 m');
    // The note gives the gap between the two fasts, so it is still true hours later (review).
    expect(within(fastCard()).getByText(joined)).toBeTruthy();
  });

  it('F21: Start within the hour after a 23:1 dinner asks first; Not now writes nothing, and from an hour after the end a new fast stands alone', async () => {
    await setUp('#/today', {
      now: at(D, '19:05'),
      seed: (t) => completedFast(t, at('2000-01-03', '19:00'), at(D, '18:20')),
    });
    tap(await screen.findByRole('region', { name: fasting.card.label }), fasting.card.start);
    const ask =
      'Your last fast ended at 6:20 pm, less than an hour ago, so a fast started now counts as part of it. A fast started from 7:20 pm counts on its own.';
    await focusOn(ask);
    tap(fastCard(), fasting.card.joinAskWait);
    await waitFor(() => {
      expect(document.activeElement?.textContent).toBe(fasting.card.start);
    });
    expect((await db().repos.fasts.list()).filter((f) => f.endedAt === null)).toEqual([]);
    await clockTo(at(D, '19:20'));
    tap(fastCard(), fasting.card.start);
    await within(fastCard()).findByText(fasting.card.started);
    expect(within(fastCard()).queryByText(/counts as part of the same fast/)).toBeNull();
    await clockTo(at('2000-01-05', '07:00'));
    expect(timer()).toContain('11 h 40 m');
    expect(within(fastCard()).queryByText(fasting.card.overCeiling)).toBeNull();
  });

  it('Undo after End goes at 60 s from the stored end; the note editor stays open and saves', async () => {
    const t = await setUp('#/today', {
      now: at(D, '18:00'),
      seed: async (s) => {
        s.env.set(iso(at('2000-01-03', '19:00')));
        await s.repos.fasts.start();
      },
    });
    tap(await screen.findByRole('region', { name: fasting.card.label }), fasting.card.end);
    await within(fastCard()).findByText('Fast ended after 23 h.');
    // Focus follows the line that replaced End, and Undo gives End back, focused (review).
    await focusOn('Fast ended after 23 h.');
    tap(fastCard(), fasting.card.undo);
    await waitFor(() => {
      expect(document.activeElement?.textContent).toBe(fasting.card.end);
    });
    tap(fastCard(), fasting.card.end);
    await within(fastCard()).findByText('Fast ended after 23 h.');
    await clockTo(at(D, '18:00') + 59 * SECOND);
    tap(fastCard(), fasting.card.addNote);
    expect(within(fastCard()).getByRole('button', { name: fasting.card.undo })).toBeTruthy();
    await clockTo(at(D, '18:00') + 60 * SECOND);
    expect(within(fastCard()).queryByRole('button', { name: fasting.card.undo })).toBeNull();
    fireEvent.change(within(fastCard()).getByLabelText(fasting.card.noteLabel), {
      target: { value: '  Felt fine  ' },
    });
    tap(fastCard(), fasting.card.saveNote);
    await within(fastCard()).findByText(fasting.card.noteSaved);
    expect((await t.repos.fasts.list())[0]?.note).toBe('Felt fine');
  });

  it('FS-05: a drink inside the running fast shows the neutral note, and nothing about a streak', async () => {
    await setUp('#/today', {
      now: at(D, '09:00'),
      seed: async (t) => {
        t.env.set(iso(at('2000-01-03', '19:00')));
        await t.repos.fasts.start();
        t.env.set(iso(at('2000-01-03', '21:00')));
        await t.repos.drinks.log({
          beverageId: null,
          name: 'Example lager',
          beverage: { volumeMl: 330, abvPercent: 5, label: null },
          count: 1,
        });
      },
    });
    const card = await screen.findByRole('region', { name: fasting.card.label });
    expect(await within(card).findByText(fasting.alcoholNote)).toBeTruthy();
    expect(card.textContent).not.toMatch(/streak|penalt|broke/i);
    expect(within(card).getByRole('button', { name: fasting.card.end })).toBeTruthy();
  });

  it('R-clock: with the phone clock behind the start, End works and the clock note stays, never "invalid" (HS-18, review)', async () => {
    const t = await setUp('#/today', { now: at(D, '16:00'), seed: runningFrom(at(D, '19:00')) });
    const card = await screen.findByRole('region', { name: fasting.card.label });
    expect(within(card).getByText(fasting.card.clockBehind)).toBeTruthy();
    expect(timer()).toBe('0 h 0 m');
    tap(card, fasting.card.end);
    await within(fastCard()).findByText(fasting.card.endedAtStart);
    expect(within(fastCard()).getByText(fasting.card.clockBehind)).toBeTruthy();
    expect(screen.queryByText(fasting.card.invalid)).toBeNull();
    expect(await t.repos.fasts.running()).toBeUndefined();
  });

  it('HS-18: End is enabled with the window open, and while a short plan is offered', async () => {
    await setUp('#/today', {
      now: at(D, '17:30'),
      targets: {
        fastingPreset: '22:2',
        eatingWindow: { start: '17:00', end: '19:00' },
        presetChosenBy: 'user',
      },
      seed: runningFrom(at('2000-01-03', '19:00')),
    });
    const card = await screen.findByRole('region', { name: fasting.card.label });
    expect(within(card).getByText(fasting.card.windowOpen)).toBeTruthy();
    expect(enabled(card, fasting.card.end)).toBe(true);
    cleanup();
    // Item 22: a planned dinner whose figures are not loaded yet (the shipped data) is short.
    await seedPlanDay(db(), {
      date: D,
      dietMode: 'keto',
      meals: [
        {
          slot: 'dinner',
          recipeId: 'seed:recipe-chicken-silverbeet-traybake',
          myServes: 1,
          householdServes: 1,
        },
      ],
      eatingWindow: null,
    });
    db().env.set(iso(at(D, '09:00')));
    await openApp('#/today');
    const offered = await screen.findByRole('region', { name: fasting.card.label });
    expect(await within(offered).findByText(fasting.mealCheck.widen)).toBeTruthy();
    expect(enabled(offered, fasting.card.end)).toBe(true);
  });

  it('FS-06: a fast started inside the window on the April night is planned to "Eat by 5:30 pm", and says why (C30)', async () => {
    await setUp('#/today', {
      now: at('2026-04-04', '18:31'),
      seed: runningFrom(at('2026-04-04', '18:30')),
    });
    const card = await screen.findByRole('region', { name: fasting.card.label });
    expect(within(card).getByText('Eat by 5:30 pm tomorrow')).toBeTruthy();
    await clockTo(at('2026-04-05', '09:00'));
    expect(await within(fastCard()).findByText('Eat by 5:30 pm')).toBeTruthy();
    expect(
      within(fastCard()).getByText(fillTemplate(fasting.card.cappedPlan, { time: '5:30 pm' })),
    ).toBeTruthy();
  });

  it('with no meal figures yet, a 23:1 day offers only the snack, and Add writes a window-only day (F28, C73)', async () => {
    const t = await setUp('#/today', { now: at(D, '10:00') });
    const check = await within(
      await screen.findByRole('region', { name: fasting.card.label }),
    ).findByTestId('meal-check');
    expect(check.textContent).toBe(
      fasting.mealCheck.unavailableOneMeal + fasting.mealCheck.addSnack,
    );
    expect(check.textContent).not.toMatch(/\d+\s*(?:g|kJ)\b/);
    tap(check, fasting.mealCheck.addSnack);
    await within(fastCard()).findByText('5 pm snack added for tonight. Eat 5:00 pm – 7:00 pm.');
    expect(await t.repos.planDays.get(D)).toMatchObject({
      meals: [],
      eatingWindow: { start: '17:00', end: '19:00' },
    });
    tap(fastCard(), fasting.mealCheck.undo);
    await waitFor(async () => {
      expect(await t.repos.planDays.get(D)).toBeUndefined();
    });
  });

  it('FL-15: after a symptom, the options show that day and the next, not the day after', async () => {
    await setUp('#/today', {
      now: at('2000-01-05', '09:00'),
      seed: async (t) => {
        t.env.set(iso(at(D, '21:00')));
        await t.repos.symptoms.create({ symptom: 'heartburn', severity: null, note: null });
      },
    });
    const options = await within(
      await screen.findByRole('region', { name: fasting.card.label }),
    ).findByTestId('reflux-options');
    expect(within(options).getByText(reflux.options.title.today)).toBeTruthy();
    // 23:1 an hour earlier leaves a 24-hour fast, so the next day opens earlier too (C30).
    expect(options.textContent).toContain(
      "Eat an hour earlier: 5:00 pm – 6:00 pm. The next day's window then opens at 5:00 pm",
    );
    expect(within(options).getByText(reflux.options.split)).toBeTruthy();
    expect(options.textContent).not.toContain(reflux.options.why);
    // The snack added from the meal check is named once, by the options (review).
    tap(fastCard(), fasting.mealCheck.addSnack);
    expect(
      await within(fastCard()).findByText('Changed for today: eat 5:00 pm – 7:00 pm.'),
    ).toBeTruthy();
    expect(fastCard().textContent).not.toContain('5 pm snack added');
    await clockTo(at('2000-01-06', '09:00'));
    // The new day's records are read again; until they arrive the card shows the last read.
    await waitFor(() => {
      expect(within(fastCard()).queryByTestId('reflux-options')).toBeNull();
    });
  });

  it('F46: two date changes in quick succession land on the second new day: the Fast card and Nutrition card read it', async () => {
    await setUp('#/today', {
      now: at(D, '09:00'),
      seed: async (t) => {
        t.env.set(iso(at(D, '08:00')));
        await t.repos.symptoms.create({ symptom: 'heartburn', severity: null, note: null });
      },
    });
    await within(await screen.findByRole('region', { name: fasting.card.label })).findByTestId(
      'reflux-options',
    );
    // The next day starts its reads; before they return the clock moves on again with no event,
    // so the render that follows comes from the next day's own result.
    act(() => {
      db().env.set(iso(at('2000-01-05', '09:00')));
      window.dispatchEvent(new Event('focus'));
    });
    db().env.set(iso(at('2000-01-06', '09:00')));
    await waitFor(() => {
      expect(within(fastCard()).queryByTestId('reflux-options')).toBeNull();
      expect(screen.queryByText(privacy.backupCard.notReady)).toBeNull();
    });
  });

  it('the pharmacist line shows on the open card when answer 4 is yes, never on a gated card (C07)', async () => {
    await setUp('#/today', { now: at(D, '10:00'), answers: { q4: 'yes' } });
    const card = await screen.findByRole('region', { name: fasting.card.label });
    expect(within(card).getByText(fasting.pharmacist)).toBeTruthy();
    // F38: on the Fasting screen it shows once, on the Eating pattern card, fast running or not.
    const noFast = () => Promise.resolve();
    for (const seed of [noFast, runningFrom(at('2000-01-03', '19:00'))]) {
      cleanup();
      db().db.shutDown();
      await setUp('#/fasting', { now: at(D, '10:00'), answers: { q4: 'yes' }, seed });
      const pattern = await screen.findByRole('region', { name: fasting.pattern.label });
      expect(within(pattern).getByText(fasting.pharmacist)).toBeTruthy();
      expect(screen.getAllByText(fasting.pharmacist)).toHaveLength(1);
    }
    cleanup();
    db().db.shutDown();
    await setUp('#/today', { now: at(D, '10:00'), answers: { q4: 'yes', q3: 'yes' } });
    const gated = await screen.findByRole('region', { name: fasting.card.gatedLabel });
    expect(within(gated).queryByText(fasting.pharmacist)).toBeNull();
  });

  it('C07: with answer 4, a stored 23:1 Kickstart default reads as 22:2 at once on Today and the Fasting screen, even while Kickstart runs, and is then moved to 22:2 with the reason', async () => {
    const t = await setUp('#/today', { now: at(D, '10:00'), ...KICKSTART_DEFAULT });
    // Without answer 4 the running Kickstart uses its 23:1 default.
    const card = await screen.findByRole('region', { name: fasting.card.label });
    expect(within(card).getByText('23:1 · One meal')).toBeTruthy();
    cleanup();
    await t.repos.readiness.answer('q4', 'yes');
    await openApp('#/today');
    const today = await screen.findByRole('region', { name: fasting.card.label });
    expect(within(today).getByText('22:2 · 5 pm snack + dinner')).toBeTruthy();
    expect(today.textContent).not.toContain('One meal');
    // Item 14's reconciler moves the stored default too (item 14 review), so a later "no" to
    // answer 4 never brings one meal a day back unasked; Today's notice gives the reason.
    expect(await screen.findByText(schedule.kickstartDefaultSetAside)).toBeTruthy();
    expect(await t.repos.targets.get()).toMatchObject({
      fastingPreset: '22:2',
      presetChosenBy: 'default',
    });
    cleanup();
    await openApp('#/fasting');
    const pattern = await screen.findByRole('region', { name: fasting.pattern.label });
    expect(within(pattern).getByText('2 h eating, 22 h fasting')).toBeTruthy();
    expect(within(fastCard()).getByText('22:2 · 5 pm snack + dinner')).toBeTruthy();
    expect(within(pattern).queryByText(schedule.kickstartWhen)).toBeNull();
    expect((await t.repos.kickstart.listPeriods())[0]?.endedAt).toBeNull();
  });
});

describe('while fasting is switched off (FS-08, HS-03, RD-03, RD-04, C41, F41)', () => {
  it('a stated eating-disorder answer: Today has only the reflux link; the screen leads with the log and offers no answer change', async () => {
    await setUp('#/today', { now: at(D, '10:00'), answers: { q5: 'yes' } });
    const card = await screen.findByRole('region', { name: reflux.label });
    expect(
      within(card).getByRole('link', { name: fasting.card.refluxLink }).getAttribute('href'),
    ).toBe('#/fasting/reflux');
    const main = screen.getByRole('main');
    expect(main.textContent).not.toContain(fasting.card.gatedLabel);
    expect(screen.queryByRole('button', { name: fasting.card.start })).toBeNull();
    cleanup();
    await openApp('#/fasting');
    await screen.findByRole('region', { name: reflux.label });
    const labels = screen
      .getAllByRole('region')
      .map((r) => within(r).getAllByRole('heading')[0]?.textContent);
    expect(labels).toEqual([reflux.label, fasting.card.gatedLabel]);
    expect(await screen.findByTestId('gate-notice-fasting')).toBeTruthy();
    expect(screen.queryByRole('link', { name: readiness.changeAnswersLink })).toBeNull();
    expect(screen.queryByRole('link', { name: readiness.answerQuestionsLink })).toBeNull();
    expect(screen.getByText(reflux.chestPain)).toBeTruthy();
    expect(screen.queryByRole('region', { name: fasting.history.label })).toBeNull();
    expect(screen.queryByRole('switch')).toBeNull();
  });

  it('HS-02: a fast still open past 24 hours shows the warning, fine to eat, 111 and "End it now", never the pharmacist line', async () => {
    await setUp('#/today', {
      now: at(D, '21:00'),
      seed: async (s) => {
        await runningFrom(at('2000-01-03', '19:00'))(s);
        await s.repos.readiness.answer('q5', 'yes');
        await s.repos.readiness.answer('q4', 'yes');
      },
    });
    const card = await screen.findByRole('region', { name: fasting.card.gatedLabel });
    expect(within(card).getByText(fasting.card.overCeiling)).toBeTruthy();
    expect(within(card).getByText(fasting.card.fineToEat)).toBeTruthy();
    expect(card.querySelector('a[href="tel:111"]')).not.toBeNull();
    expect(enabled(card, fasting.gated.endOpenFast)).toBe(true);
    expect(within(card).queryByText(fasting.pharmacist)).toBeNull();
  });

  it('answer 3 without the agreement: the reason, the hint, "Change your answers", and the hypoglycaemia text', async () => {
    await setUp('#/today', { now: at(D, '10:00'), answers: { q3: 'yes' } });
    const card = await screen.findByRole('region', { name: fasting.card.gatedLabel });
    expect(
      await within(card).findByText(/because of what you told the app about diabetes medication/),
    ).toBeTruthy();
    expect(within(card).getByText(readiness.confirmationHints.prescriberAgreed)).toBeTruthy();
    expect(
      within(card).getByRole('link', { name: readiness.changeAnswersLink }).getAttribute('href'),
    ).toBe('#/readiness');
    cleanup();
    await openApp('#/fasting');
    expect(await screen.findByText(readiness.ifYes.q3)).toBeTruthy();
  });

  it('answer 3 beside an answer that closes the deficit: its line never says meals keep one (item 13 review)', async () => {
    await setUp('#/fasting', { now: at(D, '10:00'), answers: { q3: 'yes', q5: 'yes' } });
    expect(await screen.findByText(readiness.ifYesAlsoOff.q3)).toBeTruthy();
    expect(screen.queryByText(readiness.ifYes.q3)).toBeNull();
  });

  it('a question nobody answered is never stated as a fact, and the link asks for the answers (C41)', async () => {
    test = await openTestDb();
    appStorageStore.set(test.storage);
    render(<GateNotice feature="fasting" link linkWhen="actionable" />);
    const notice = await screen.findByTestId('gate-notice-fasting');
    expect(notice.textContent).toBe(
      'Fasting stays off until you answer the questions about being under 18, pregnancy or breastfeeding, diabetes medication and an eating disorder or low weight.',
    );
    // Item 13 review: the prescriber hint only when that confirmation is the one reason left.
    expect(screen.queryByTestId('gate-hint-fasting')).toBeNull();
    expect(screen.getByRole('link', { name: readiness.answerQuestionsLink })).toBeTruthy();
  });

  it('F41: with a stated eating-disorder answer, no answer-change link even beside the diabetes reason', async () => {
    test = await openTestDb();
    await onboardForTests(test, { answers: { q5: 'yes', q3: 'yes' }, weightKg: null });
    appStorageStore.set(test.storage);
    render(<GateNotice feature="fasting" link linkWhen="actionable" />);
    expect((await screen.findByTestId('gate-notice-fasting')).textContent).toContain(
      'diabetes medication and an eating disorder or low weight',
    );
    expect(screen.queryByRole('link')).toBeNull();
  });

  it('a fast still open can be ended: "End it now", fine to eat, the stop-signs, 111 and the hypoglycaemia text (RD-03)', async () => {
    const t = await setUp('#/fasting', {
      now: at(D, '09:00'),
      seed: async (s) => {
        await runningFrom(at('2000-01-03', '19:00'))(s);
        await s.repos.readiness.answer('q3', 'yes');
      },
    });
    await screen.findByText(fasting.gated.openFast);
    const card = region(fasting.card.gatedLabel);
    expect(within(card).getByText(fasting.card.fineToEat)).toBeTruthy();
    expect(within(card).getByText(readiness.ifYes.q3)).toBeTruthy();
    expect(within(card).queryByTestId('fast-timer')).toBeNull();
    const signs = region(fasting.stopSigns.label);
    expect(signs.querySelector('a[href="tel:111"]')).not.toBeNull();
    tap(card, fasting.gated.endOpenFast);
    await waitFor(async () => {
      expect(await t.repos.fasts.running()).toBeUndefined();
    });
    await waitFor(() => {
      expect(screen.queryByRole('button', { name: fasting.gated.endOpenFast })).toBeNull();
    });
  });
});

describe('the Fasting screen (design 3.4 to 3.8)', () => {
  it('opening, a failed read and a failed view each show a card, never a blank screen', async () => {
    render(<FastingScreen />);
    expect(screen.getByRole('status').textContent).toBe('The records are still opening.');
    cleanup();
    const t = await setUp('#/today', { now: at(D, '10:00') });
    vi.spyOn(t.repos.fasts, 'list').mockRejectedValue(new Error('read failed'));
    cleanup();
    await openApp('#/fasting');
    expect(await screen.findByText(fasting.card.readFailed)).toBeTruthy();
    expect(document.querySelector('a[href="tel:111"]')).not.toBeNull();
    vi.spyOn(t.repos.fasts, 'list').mockResolvedValue([
      { ...(await t.repos.fasts.start()), startedAt: 'not an instant' },
    ]);
    cleanup();
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    await openApp('#/fasting');
    expect(await screen.findByText(fasting.card.readFailed)).toBeTruthy();
  });

  it('FS-04: the stop-signs card is there with no fast running, and during one', async () => {
    await setUp('#/fasting', { now: at(D, '10:00') });
    const expectSigns = async () => {
      const signs = await screen.findByRole('region', { name: fasting.stopSigns.label });
      expect([...signs.querySelectorAll('.ui-plain-list li')].map((li) => li.textContent)).toEqual([
        ...fasting.stopSigns.signs,
      ]);
      expect(within(signs).getByText(fasting.stopSigns.action)).toBeTruthy();
      expect(
        [...signs.querySelectorAll('a[href^="tel:"]')].map((a) => a.getAttribute('href')),
      ).toEqual(['tel:111', 'tel:0800611116']);
    };
    await expectSigns();
    tap(await screen.findByRole('region', { name: fasting.card.label }), fasting.card.start);
    await within(fastCard()).findByTestId('fast-timer');
    await clockTo(at(D, '10:00') + 14 * HOUR);
    expect(timer()).toContain('14 h 0 m');
    await expectSigns();
  });

  it('#/fasting/reflux focuses the Reflux heading and leaves one history entry, at #/fasting', async () => {
    await setUp('#/today', { now: at(D, '10:00') });
    const entries = window.history.length;
    cleanup();
    await openApp('#/fasting/reflux');
    await waitFor(() => {
      expect(document.activeElement?.textContent).toBe(reflux.label);
    });
    expect(window.location.hash).toBe('#/fasting');
    expect(window.history.length).toBe(entries + 1);
  });

  it('#/fasting/pattern opens the form; Cancel closes it without a new history entry', async () => {
    await setUp('#/fasting/pattern', { now: at(D, '10:00') });
    const legend = await screen.findByText(schedule.presetsLegend);
    await waitFor(() => {
      expect(document.activeElement).toBe(legend);
    });
    const entries = window.history.length;
    const card = region(fasting.pattern.label);
    tap(card, fasting.card.cancel);
    expect(within(region(fasting.pattern.label)).queryByRole('radiogroup')).toBeNull();
    tap(region(fasting.pattern.label), fasting.pattern.change);
    expect(within(region(fasting.pattern.label)).getByRole('radiogroup')).toBeTruthy();
    // The legend takes focus, not the page (review).
    await waitFor(() => {
      expect(document.activeElement?.textContent).toBe(schedule.presetsLegend);
    });
    expect(window.history.length).toBe(entries);
    expect(window.location.hash).toBe('#/fasting');
  });

  it('with no pattern: "No fasting plan for now" once that is saved, never "No eating schedule is saved yet"', async () => {
    const t = await setUp('#/fasting', {
      now: at(D, '10:00'),
      targets: { fastingPreset: null, eatingWindow: null, presetChosenBy: null },
    });
    const card = await screen.findByRole('region', { name: fasting.pattern.label });
    expect(within(card).getByText(schedule.none)).toBeTruthy();
    expect(within(card).queryByText(schedule.noneSaved)).toBeNull();
    // The Fast card names the choice too, with a quiet way to change it (review).
    expect(within(fastCard()).getByText(schedule.none)).toBeTruthy();
    expect(
      within(fastCard()).getByRole('link', { name: fasting.pattern.change }).getAttribute('href'),
    ).toBe('#/fasting/pattern');
    cleanup();
    await t.repos.settings.update({ scheduleConfirmedAt: null });
    await openApp('#/fasting');
    const unsaved = await screen.findByRole('region', { name: fasting.pattern.label });
    expect(within(unsaved).getByText(fasting.card.noPattern)).toBeTruthy();
    expect(within(fastCard()).getByRole('link', { name: fasting.card.choosePattern })).toBeTruthy();
  });

  it('E19, F39: the open form carries the Kickstart line, once, with the running Kickstart’s due date, and drops it when another pattern is picked', async () => {
    await setUp('#/fasting', { now: at(D, '10:00'), ...KICKSTART_DEFAULT });
    const line =
      'Kickstart is due to finish on 24 January 2000. After that, the app uses 22:2 (5 pm snack + dinner) instead.';
    const card = await screen.findByRole('region', { name: fasting.pattern.label });
    expect(within(card).getByText(line)).toBeTruthy();
    expect(within(card).queryByText(schedule.kickstartWhen)).toBeNull();
    tap(card, fasting.pattern.change);
    expect(await within(region(fasting.pattern.label)).findByText(line)).toBeTruthy();
    expect(within(region(fasting.pattern.label)).getAllByText(line)).toHaveLength(1);
    fireEvent.click(within(region(fasting.pattern.label)).getByRole('radio', { name: /^18:6/ }));
    expect(within(region(fasting.pattern.label)).queryByText(line)).toBeNull();
  });

  it('FL-14, HS-17: the 23:1 window is 1 h eating and 23 h fasting, with no over-24 text', async () => {
    await setUp('#/fasting', { now: at(D, '10:00') });
    const card = await screen.findByRole('region', { name: fasting.pattern.label });
    expect(within(card).getByText('1 h eating, 23 h fasting')).toBeTruthy();
    expect(within(card).getByText('Next eating window: today at 6:00 pm.')).toBeTruthy();
    expect(screen.getByRole('main').textContent).not.toContain(fasting.card.overCeiling);
  });

  it('F20: after a Kickstart stop-sign answer the pattern card names no next window, and the snack added for today no time', async () => {
    // Day 20 of a Kickstart, with a "yes" to dizziness at 8 am.
    const day20 = '2000-01-24';
    await setUp('#/fasting', {
      now: at(day20, '10:00'),
      seed: async (t) => {
        await t.repos.planDays.setWindows([
          { date: day20, window: { start: '17:00', end: '19:00' } },
        ]);
        const periodId = t.env.randomId();
        await t.db.kickstart_periods.put({
          id: periodId,
          startedAt: iso(at('2000-01-05', '08:00')),
          timeZone: NZ,
          endedAt: null,
          endedTimeZone: null,
          endReason: null,
        });
        await t.db.kickstart_checks.add({
          id: t.env.randomId(),
          periodId,
          askedAt: iso(at(day20, '08:00')),
          timeZone: NZ,
          dizzyOnStanding: 'yes',
          palpitations: 'no',
          crampsNotSettling: 'no',
          faintAtWork: 'no',
          energyRating: null,
          sleepRating: null,
          outcome: 'stop-sign',
        });
      },
    });
    await within(await screen.findByRole('region', { name: fasting.card.label })).findByText(
      fasting.card.stopSignPause,
    );
    const pattern = region(fasting.pattern.label);
    expect(within(pattern).getByText('1 h eating, 23 h fasting')).toBeTruthy();
    expect(within(pattern).getByText(fasting.mealCheck.snackAddedNoRange.today)).toBeTruthy();
    expect(pattern.textContent).not.toMatch(/Next eating window|Eat \d/);
  });

  it('C55: a preset stored at other times reads from its clock times and saves back unchanged', async () => {
    const t = await setUp('#/fasting', {
      now: at(D, '10:00'),
      targets: {
        ...ONE_MEAL,
        eatingWindow: { start: '17:30', end: '18:30' },
        refluxPreferEarlier: true,
        refluxPreferSplit: false,
      },
    });
    const card = await screen.findByRole('region', { name: fasting.pattern.label });
    expect(within(card).getByText('23:1 · One meal')).toBeTruthy();
    expect(screen.getByRole('main').textContent).not.toMatch(
      /5 pm snack \+ dinner|5 pm snack, dinner/,
    );
    tap(card, fasting.pattern.change);
    expect(screen.getByLabelText<HTMLInputElement>(schedule.startLabel).value).toBe('17:30');
    tap(region(fasting.pattern.label), schedule.save);
    await waitFor(() => {
      expect(within(region(fasting.pattern.label)).queryByRole('radiogroup')).toBeNull();
    });
    // In Settings the two reflux switches are the Reflux card's: a pattern save leaves them (F8).
    expect(await t.repos.targets.get()).toMatchObject({
      fastingPreset: '23:1',
      eatingWindow: { start: '17:30', end: '18:30' },
      presetChosenBy: 'user',
      refluxPreferEarlier: true,
      refluxPreferSplit: false,
    });
  });

  it('C55: 22:2 at 6 to 8 pm is "22:2" with no snack wording, and the split adds 5 to 8 pm', async () => {
    const t = await setUp('#/fasting', {
      now: at(D, '10:00'),
      targets: {
        fastingPreset: '22:2',
        eatingWindow: { start: '18:00', end: '20:00' },
        presetChosenBy: 'user',
        refluxPreferSplit: true,
      },
    });
    const card = await screen.findByRole('region', { name: fasting.card.label });
    expect(within(card).getByText('22:2')).toBeTruthy();
    expect(within(card).getByText('Eat 6:00 pm – 8:00 pm')).toBeTruthy();
    expect(card.textContent).not.toContain('5 pm snack, dinner by');
    tap(region(reflux.label), reflux.options.splitAction);
    await waitFor(async () => {
      expect((await t.repos.planDays.get(D))?.eatingWindow).toEqual({
        start: '17:00',
        end: '20:00',
      });
    });
  });

  it('FS-01, C07: the seven choices in order; with answer 4 no pattern is chosen for them and the note comes first', async () => {
    const t = await setUp('#/fasting', {
      now: at(D, '10:00'),
      answers: { q4: 'yes' },
      targets: { fastingPreset: null, eatingWindow: null, presetChosenBy: null },
    });
    await t.repos.settings.update({ scheduleConfirmedAt: null });
    tap(await screen.findByRole('region', { name: fasting.pattern.label }), fasting.pattern.change);
    const card = region(fasting.pattern.label);
    const radios = within(card).getAllByRole('radio');
    expect(
      radios.map((r) => r.closest('label')?.querySelector('.ui-choice__label')?.textContent),
    ).toEqual(['16:8', '18:6', '20:4', '22:2', '23:1', schedule.custom, schedule.none]);
    // After setup, nothing stored starts at "No fasting plan for now" (item 13): never a pattern.
    expect(
      radios
        .filter((r) => (r as HTMLInputElement).checked)
        .map((r) => (r as HTMLInputElement).value),
    ).toEqual(['none']);
    const note = within(card).getByText(schedule.pharmacistNote);
    expect(note.compareDocumentPosition(within(card).getByRole('radiogroup'))).toBe(
      Node.DOCUMENT_POSITION_FOLLOWING,
    );
    fireEvent.click(within(card).getByRole('radio', { name: new RegExp(`^${schedule.custom}`) }));
    fireEvent.change(within(card).getByLabelText(schedule.startLabel), {
      target: { value: '18:00' },
    });
    fireEvent.change(within(card).getByLabelText(schedule.endLabel), {
      target: { value: '18:00' },
    });
    expect(within(card).getByText(schedule.errors.sameTime)).toBeTruthy();
    expect((await t.repos.targets.get()).fastingPreset).toBeNull();
  });

  it('C30: Save names the per-day changes the new pattern no longer fits, removes them, and keeps a wider one', async () => {
    const t = await setUp('#/fasting', {
      now: at(D, '10:00'),
      seed: (s) =>
        s.repos.planDays.setWindows([
          { date: D, window: { start: '17:00', end: '19:00' } },
          { date: '2000-01-05', window: { start: '17:00', end: '18:00' } },
        ]),
    });
    tap(await screen.findByRole('region', { name: fasting.pattern.label }), fasting.pattern.change);
    const card = region(fasting.pattern.label);
    fireEvent.change(within(card).getByLabelText(schedule.startLabel), {
      target: { value: '17:30' },
    });
    fireEvent.change(within(card).getByLabelText(schedule.endLabel), {
      target: { value: '18:30' },
    });
    expect(
      await within(card).findByText('Saving also removes the change made for tomorrow.'),
    ).toBeTruthy();
    tap(card, schedule.save);
    await waitFor(async () => {
      expect(await t.repos.planDays.get('2000-01-05')).toBeUndefined();
    });
    expect((await t.repos.planDays.get(D))?.eatingWindow).toEqual({ start: '17:00', end: '19:00' });
  });

  it('HS-18: a new pattern saved inside an open window says nothing about stopping, and plans from now', async () => {
    const t = await setUp('#/fasting', { now: at(D, '18:30') });
    // F50: inside the window Start is never the strongest action.
    expect(
      within(await screen.findByRole('region', { name: fasting.card.label })).getByRole('button', {
        name: fasting.card.start,
      }).className,
    ).toContain('ui-button--secondary');
    tap(await screen.findByRole('region', { name: fasting.pattern.label }), fasting.pattern.change);
    const card = region(fasting.pattern.label);
    fireEvent.change(within(card).getByLabelText(schedule.startLabel), {
      target: { value: '06:00' },
    });
    fireEvent.change(within(card).getByLabelText(schedule.endLabel), {
      target: { value: '07:00' },
    });
    tap(card, schedule.save);
    expect(
      await within(region(fasting.pattern.label)).findByText(
        'Next eating window: tomorrow at 6:00 am.',
      ),
    ).toBeTruthy();
    expect(screen.getByRole('main').textContent).not.toMatch(/\b(?:stop|don't) eat/i);
    tap(region(fasting.card.label), fasting.card.start);
    await waitFor(async () => {
      expect((await t.repos.fasts.running())?.plannedFastMinutes).toBe(690);
    });
  });

  it('FL-11: the reflux log, its help lines and both options; a logged symptom is rated, noted and undone', async () => {
    const t = await setUp('#/fasting', {
      now: at(D, '10:00'),
      targets: { ...ONE_MEAL, refluxPreferEarlier: true, refluxPreferSplit: true },
    });
    const card = await screen.findByRole('region', { name: reflux.label });
    for (const name of Object.values(reflux.symptoms)) {
      expect(within(card).getByRole('button', { name })).toBeTruthy();
    }
    expect(within(card).getByText(reflux.chestPain)).toBeTruthy();
    expect(card.querySelector('a[href="tel:111"]')).not.toBeNull();
    expect(within(card).getByText(reflux.gpLine)).toBeTruthy();
    expect(within(card).getByText(reflux.noDiagnosis)).toBeTruthy();
    expect(within(card).getByRole('button', { name: reflux.options.earlierAction })).toBeTruthy();
    expect(within(card).getByRole('button', { name: reflux.options.splitAction })).toBeTruthy();
    tap(card, reflux.symptoms.heartburn);
    await within(region(reflux.label)).findByText('Logged: Heartburn at 10:00 am.');
    tap(region(reflux.label), reflux.severity['2']);
    await waitFor(async () => {
      expect((await t.repos.symptoms.list())[0]?.severity).toBe(2);
    });
    // The screen shows what is stored once the live read comes back.
    expect(
      await within(region(reflux.label)).findByText('Tue 4 Jan, 10:00 am · Heartburn · Moderate'),
    ).toBeTruthy();
    expect(
      within(region(reflux.label))
        .getByRole('button', { name: reflux.severity['2'] })
        .getAttribute('aria-pressed'),
    ).toBe('true');
    tap(region(reflux.label), reflux.undo);
    await waitFor(async () => {
      expect(await t.repos.symptoms.list()).toEqual([]);
    });
  });

  it('FL-16: symptoms on 3 days in 2 weeks bring the GP nudge; Not now puts it away', async () => {
    await setUp('#/fasting', {
      now: at(D, '10:00'),
      seed: async (t) => {
        for (const day of ['2000-01-01', '2000-01-02', '2000-01-03']) {
          t.env.set(iso(at(day, '21:00')));
          await t.repos.symptoms.create({ symptom: 'night-cough', severity: null, note: null });
        }
      },
    });
    const card = await screen.findByRole('region', { name: reflux.label });
    expect(await within(card).findByText(reflux.nudge.action)).toBeTruthy();
    expect(
      within(card).getByText('You have logged reflux symptoms on 3 days in the last 2 weeks.'),
    ).toBeTruthy();
    tap(card, reflux.nudge.notNow);
    await waitFor(() => {
      expect(within(region(reflux.label)).queryByText(reflux.nudge.action)).toBeNull();
    });
  });

  it('History explains a joined span on each of its rows, and tags each over 24 hours (review)', async () => {
    await setUp('#/fasting', {
      now: at(D, '20:00'),
      seed: async (s) => {
        await completedFast(s, at('2000-01-02', '07:00'), at('2000-01-03', '03:00'));
        await completedFast(s, at('2000-01-03', '03:30'), at('2000-01-03', '13:30'));
      },
    });
    const card = await screen.findByRole('region', { name: fasting.history.label });
    expect(within(card).getAllByText(fasting.history.over24)).toHaveLength(2);
    expect(
      within(card).getByText(
        'Started 30 m after the fast before it, so it counts as part of one fast of 30 h 30 m.',
      ),
    ).toBeTruthy();
    expect(
      within(card).getByText(
        'The next fast started less than an hour after this one ended, so this counts as part of one fast of 30 h 30 m.',
      ),
    ).toBeTruthy();
  });

  it('FS-07: History shows the streak from 2 days, actual lengths, the over-24 tag, and refuses an end after now', async () => {
    const t = await setUp('#/fasting', {
      now: at(D, '20:00'),
      seed: async (s) => {
        await completedFast(s, at('2000-01-01', '19:00'), at('2000-01-02', '18:00'));
        await completedFast(s, at('2000-01-02', '19:00'), at('2000-01-03', '20:00'));
        await completedFast(s, at('2000-01-03', '21:30'), at(D, '18:00'));
      },
    });
    const card = await screen.findByRole('region', { name: fasting.history.label });
    // The 2nd is 25 hours (neutral days); the 1st and 3rd count.
    expect(within(card).getByText('2 days in a row with a completed fast.')).toBeTruthy();
    expect(within(card).getAllByText(fasting.history.over24)).toHaveLength(1);
    expect(card.textContent).toContain('Tue 4 Jan · 20 h 30 m');
    tap(within(card).getAllByRole('listitem')[0] ?? card, fasting.history.edit);
    fireEvent.change(within(card).getByLabelText(fasting.history.endTime), {
      target: { value: '21:00' },
    });
    tap(card, fasting.history.save);
    expect(within(card).getByText(fasting.history.future)).toBeTruthy();
    // The form's own check takes focus, like a failed write (design 3.9; review).
    expect(document.activeElement?.textContent).toBe(fasting.history.future);
    expect(
      (await t.repos.fasts.list()).find((f) => f.endedAt === iso(at(D, '21:00'))),
    ).toBeUndefined();
  });
});
