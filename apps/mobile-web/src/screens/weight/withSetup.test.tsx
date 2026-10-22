// Item 14 on item 13's setup and readiness code (integration): the one way a Kickstart ends when
// its conditions fail, in the same action as item 13's answer, profile and weigh-in writes (T5);
// item 14's current weight in item 13's gates and gate hook (HS-35); the Kickstart choice made at
// setup feeding Today's start card (W14); the reconciler during the repair questions (RD-08); a
// Kickstart whose first day has not come (item 12's 'not-started'). Real Dexie over
// fake-indexeddb; synthetic records only.
import {
  type KickstartPeriodRecord,
  type Snapshot,
  type WeightRecord,
  weightOverview,
} from '@diet/core';
import {
  garden,
  onboarding,
  privacy,
  profile,
  readiness,
  schedule,
  weight,
} from '@diet/core/copy/health';
import {
  onDay,
  scenarioInstant,
  SCENARIO_DAY1,
  SCENARIO_ZONE,
  WEIGHT_SCENARIOS,
  type WeightScenarioOptions,
  weightScenario,
} from '@diet/test-fixtures';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { StorageClockError } from '../../db/errors';
import { appStorageStore } from '../../db/runtime';
import { openSnapshotDb, openTestDb, type TestDb } from '../../db/testKit';
import {
  answerReadiness,
  FlowStaleError,
  saveSchedule,
  setConfirmation,
} from '../../onboarding/actions';
import { answerAll, headingIs, openApp, passNotice, tap } from '../../onboarding/flowTestKit';
import { gateInputOf, readOnboardingState } from '../../onboarding/state';
import { endLatchStore, weightStatusStore } from './stores';
import { currentWeightEnv, overviewInputFrom, readWeightInputs } from './useWeightView';
import { WeightScreen } from './WeightScreen';
import { weightWriteMessage } from './writeErrors';

let test: TestDb | undefined;

afterEach(() => {
  cleanup();
  appStorageStore.set(null);
  weightStatusStore.set(null);
  endLatchStore.set(new Map());
  test?.db.shutDown();
  test = undefined;
  window.location.hash = '';
});

async function seed(options: WeightScenarioOptions, day: number): Promise<TestDb> {
  const seen = onDay(options, day);
  test = await openSnapshotDb(weightScenario(seen), seen.now);
  appStorageStore.set(test.storage);
  return test;
}

async function seedSnapshot(snapshot: Snapshot, now: string): Promise<TestDb> {
  test = await openSnapshotDb(snapshot, now);
  appStorageStore.set(test.storage);
  return test;
}

const periods = async (db: TestDb) => db.repos.kickstart.listPeriods();
const phaseNow = async (db: TestDb) =>
  weightOverview(
    overviewInputFrom(await readWeightInputs(db.storage), currentWeightEnv(db.storage)),
  ).phase.kind;

/** The Weight screen alone: no reconciler is mounted, so any end is the action's own. */
async function weightScreen(): Promise<void> {
  render(<WeightScreen />);
  await screen.findByRole('region', { name: weight.phase.label });
}

/** K10 at 180 cm (floor 59.94 kg), started at 64 kg, so day 10 sits just above BMI 18.5. */
const NEAR_FLOOR = { ...WEIGHT_SCENARIOS.K10, startKg: 64 };

describe('T5: item 13’s readiness saves end a Kickstart in the same action (C56; one rule)', () => {
  it('answer 5 "yes" ends a running Kickstart at once; "no" again leaves it Steady', async () => {
    const db = await seed(WEIGHT_SCENARIOS.K10, 10);
    expect(await phaseNow(db)).toBe('kickstart');
    await answerReadiness(db.storage, 'q5', 'yes');
    expect(await periods(db)).toMatchObject([{ endReason: 'readiness-gated' }]);
    await answerReadiness(db.storage, 'q5', 'no');
    expect(await phaseNow(db)).toBe('steady');
    expect(await periods(db)).toHaveLength(1);
  });

  it('answer 3 "yes" ends it; the prescriber’s agreement afterwards does not resume it', async () => {
    const db = await seed(WEIGHT_SCENARIOS.K10, 10);
    await answerReadiness(db.storage, 'q3', 'yes');
    expect(await periods(db)).toMatchObject([{ endReason: 'readiness-gated' }]);
    await setConfirmation(db.storage, 'prescriberAgreed', 'yes');
    expect(await phaseNow(db)).toBe('steady');
  });

  it('the same rule ends a Kickstart left in balanced mode as left-keto', async () => {
    const db = await seed({ ...WEIGHT_SCENARIOS.K10, dietMode: 'balanced' }, 10);
    await answerReadiness(db.storage, 'q4', 'yes');
    expect(await periods(db)).toMatchObject([{ endReason: 'left-keto' }]);
  });
});

describe('a weigh-in below BMI 18.5 runs item 13’s gate effects in the same action (HS-35)', () => {
  it('Log weight: the current weight falls below the floor and the running Kickstart ends', async () => {
    const db = await seed(NEAR_FLOOR, 10);
    await weightScreen();
    const panel = screen.getByRole('region', { name: weight.card.logWeight });
    fireEvent.change(within(panel).getByRole('textbox', { name: weight.entry.fieldLabel }), {
      target: { value: '59.0' },
    });
    fireEvent.click(within(panel).getByRole('button', { name: weight.entry.save }));
    await waitFor(async () => {
      expect(await periods(db)).toMatchObject([{ endReason: 'readiness-gated' }]);
    });
  });

  it('a higher weigh-in timed later today (saved while the clock ran ahead) never hides it, before or after that time, and a fast is refused', async () => {
    const db = await seed(NEAR_FLOOR, 10);
    db.env.set(scenarioInstant(SCENARIO_DAY1, 10, '23:00'));
    await db.repos.weights.create({ kg: 62, source: 'manual', note: null });
    db.env.set(scenarioInstant(SCENARIO_DAY1, 10, '18:00'));
    await weightScreen();
    const panel = screen.getByRole('region', { name: weight.card.logWeight });
    fireEvent.change(within(panel).getByRole('textbox', { name: weight.entry.fieldLabel }), {
      target: { value: '59.0' },
    });
    fireEvent.click(within(panel).getByRole('button', { name: weight.entry.save }));
    await waitFor(async () => {
      expect(await periods(db)).toMatchObject([{ endReason: 'readiness-gated' }]);
    });
    await expect(db.repos.fasts.start()).rejects.toMatchObject({ rule: 'fasting-gated' });
    // The save says the clock may be wrong; once real time passes 11 pm, 59.0 still counts.
    await screen.findByText(weight.entry.clockWrong, { exact: false });
    db.env.set(scenarioInstant(SCENARIO_DAY1, 11, '08:00'));
    await expect(db.repos.fasts.start()).rejects.toMatchObject({ rule: 'fasting-gated' });
  });

  it('Weigh-ins: an edit to a low weight ends it; removing that weigh-in restarts the carb-ceiling clock', async () => {
    const db = await seed(NEAR_FLOOR, 10);
    const before = (await db.repos.profile.get()).carbCeilingStartedAt;
    await weightScreen();
    /** Today's weigh-in row in the Weigh-ins card. */
    const todayRow = () => {
      const rows = within(screen.getByRole('region', { name: weight.list.label })).getAllByRole(
        'listitem',
      );
      const row = rows.find((li) => li.textContent.includes('10 February 2000'));
      if (row === undefined) throw new Error('no row for 10 February 2000');
      return row;
    };
    fireEvent.click(within(todayRow()).getByRole('button', { name: weight.list.edit }));
    fireEvent.change(within(todayRow()).getByRole('textbox', { name: weight.entry.fieldLabel }), {
      target: { value: '59.0' },
    });
    fireEvent.click(within(todayRow()).getByRole('button', { name: weight.list.saveChanges }));
    await waitFor(async () => {
      expect(await periods(db)).toMatchObject([{ endReason: 'readiness-gated' }]);
    });
    db.env.advanceDays(0.01);
    await waitFor(() => {
      expect(within(todayRow()).queryByRole('button', { name: weight.list.delete })).not.toBeNull();
    });
    fireEvent.click(within(todayRow()).getByRole('button', { name: weight.list.delete }));
    fireEvent.click(within(todayRow()).getByRole('button', { name: weight.list.deleteYes }));
    await waitFor(async () => {
      expect((await db.repos.profile.get()).carbCeilingStartedAt).not.toBe(before);
    });
    expect((await db.repos.profile.get()).carbCeilingStartedAt).toBe(db.env.now());
  });
});

/**
 * 180 cm (floor 59.94 kg): 59.0 kg on days 1 to 7, then 60.5 kg on day 8. The latest weigh-in is
 * above the floor, the 7-day average (about 59.2 kg) below it.
 */
function lowAverage(): { readonly snapshot: Snapshot; readonly now: string } {
  const seen = onDay({ ...WEIGHT_SCENARIOS.PENDING, startKg: 59, days: (d: number) => d <= 8 }, 8);
  const snapshot = weightScenario(seen);
  const weights: WeightRecord[] = snapshot.weights.map((w, i, all) =>
    i === all.length - 1 ? { ...w, kg: 60.5 } : w,
  );
  return { snapshot: { ...snapshot, weights }, now: seen.now };
}

describe('item 13’s gates read item 14’s current weight: the lower of the 7-day average and the latest (HS-35)', () => {
  it('the gate hook’s input and the actions’ fresh read both see a low weight', async () => {
    const { snapshot, now } = lowAverage();
    const db = await seedSnapshot(snapshot, now);
    const read = await readOnboardingState(db.storage);
    if (!read.ok) throw new Error('unreadable');
    expect(read.state.latestWeightKg).toBe(60.5);
    expect(gateInputOf(read.state, db.env).lowWeight).toBe(true);
    await expect(
      saveSchedule(db.storage, {
        choice: '16:8',
        window: { start: '11:00', end: '19:00' },
        reflux: false,
      }),
    ).rejects.toEqual(new FlowStaleError('fasting-gated'));
  });

  it('the Weight screen takes its gates from item 13’s hook: no phase, the low-weight line with the readiness link, as Food’s notice says', async () => {
    const { snapshot, now } = lowAverage();
    await seedSnapshot(snapshot, now);
    await openApp('#/weight');
    const phase = await screen.findByRole('region', { name: weight.phase.label });
    await within(phase).findByText(weight.phase.lowWeight);
    expect(within(phase).queryByText(weight.phase.steadyChip)).toBeNull();
    expect(
      within(phase).getByRole('link', { name: weight.phase.readinessLink }).getAttribute('href'),
    ).toBe('#/readiness');
    // F31: the goal card gives the gate's own reason, the weight, not "your readiness answers".
    const goal = screen.getByRole('region', { name: weight.goal.label });
    expect((await within(goal).findByTestId('gate-notice-goalSetting')).textContent).toBe(
      'Weight goal setting is off because of what you told the app about your current weight.',
    );
    expect(goal.textContent).not.toMatch(/readiness/);
    window.location.hash = '#/food';
    window.dispatchEvent(new HashChangeEvent('hashchange'));
    expect(await screen.findByTestId('gate-notice-ketoCeiling')).toBeDefined();
  });
});

describe('the Kickstart choice made at setup feeds Today’s start card (W14; item 13 E15)', () => {
  async function setUpWithKickstart(chosen: boolean): Promise<TestDb> {
    test = await openTestDb();
    appStorageStore.set(test.storage);
    await passNotice();
    await answerAll();
    tap(onboarding.frame.continue);
    await headingIs(profile.title);
    fireEvent.change(screen.getByLabelText(profile.heightLabel), { target: { value: '175' } });
    fireEvent.change(screen.getByLabelText(profile.weightLabel), { target: { value: '100' } });
    fireEvent.change(screen.getByLabelText(profile.birthYearLabel), { target: { value: '1970' } });
    fireEvent.click(screen.getByRole('radio', { name: profile.sexOptions.female }));
    const kickstart = screen.getByRole<HTMLInputElement>('switch', {
      name: profile.kickstartLabel,
    });
    if (kickstart.checked !== chosen) fireEvent.click(kickstart);
    tap(onboarding.frame.continue);
    await headingIs(schedule.title);
    await screen.findByRole('radiogroup', { name: schedule.presetsLegend });
    tap(onboarding.frame.continue);
    await headingIs(garden.title);
    tap(garden.skip);
    await screen.findByRole('navigation', { name: 'Main' });
    return test;
  }

  it('chosen: Today offers "Start Kickstart today" with the 22:2 line, nothing has started, and the untouched 23:1 is stored as 22:2', async () => {
    const db = await setUpWithKickstart(true);
    const card = await screen.findByRole('region', { name: weight.start.pendingLabel });
    expect(within(card).getByRole('button', { name: weight.start.pendingAction })).toBeDefined();
    expect(within(card).getByText(weight.start.pendingIntro)).toBeDefined();
    expect(within(card).getByText(weight.start.pendingWindow)).toBeDefined();
    expect(await periods(db)).toEqual([]);
    await waitFor(async () => {
      expect(await db.repos.targets.get()).toMatchObject({
        fastingPreset: '22:2',
        presetChosenBy: 'default',
      });
    });
  });

  it('declined: no start card', async () => {
    await setUpWithKickstart(false);
    await screen.findByRole('region', { name: weight.card.label });
    expect(screen.queryByRole('region', { name: weight.start.pendingLabel })).toBeNull();
  });
});

describe('the reconciler runs beside the first-run guard (RD-08)', () => {
  it('while the repair questions show, a Kickstart whose answer went missing is ended', async () => {
    const db = await seed(WEIGHT_SCENARIOS.K10, 10);
    await db.repos.readiness.clear('q2');
    await openApp('#/today');
    await headingIs(readiness.questions.q2);
    await waitFor(async () => {
      expect(await periods(db)).toMatchObject([{ endReason: 'readiness-gated' }]);
    });
  });
});

describe('a Kickstart whose first day has not come (item 12’s kickstartPeriodState)', () => {
  /** PENDING on day 1, with a period started two days ahead (the clock was ahead, then put right). */
  function aheadSnapshot(): { readonly snapshot: Snapshot; readonly now: string } {
    const seen = onDay(WEIGHT_SCENARIOS.PENDING, 1);
    const snapshot = weightScenario(seen);
    const startedAt = scenarioInstant(SCENARIO_DAY1, 3, '07:30');
    const period: KickstartPeriodRecord = {
      id: '00000000-0000-4000-8000-000000099001',
      startedAt,
      timeZone: SCENARIO_ZONE,
      endedAt: null,
      endedTimeZone: null,
      endReason: null,
    };
    const [profileRow] = snapshot.profile;
    if (profileRow === undefined) throw new Error('A scenario always has a profile');
    return {
      snapshot: {
        ...snapshot,
        kickstart_periods: [period],
        profile: [{ ...profileRow, carbCeilingStartedAt: startedAt }],
      },
      now: seen.now,
    };
  }

  it('reads as Steady, says so plainly with its first day, offers no start, and End Kickstart ends it', async () => {
    const { snapshot, now } = aheadSnapshot();
    const db = await seedSnapshot(snapshot, now);
    const inputs = await readWeightInputs(db.storage);
    const overview = weightOverview(overviewInputFrom(inputs, currentWeightEnv(db.storage)));
    expect(overview.phase).toEqual({ kind: 'steady', lastKickstartEnd: null });
    expect(overview.kickstart.notStarted).toMatchObject({ day1: '2000-02-03' });
    expect(overview.kickstart.endNeeded).toBeNull();
    expect(overview.kickstart.start).toEqual({ available: false, reason: 'not-started' });
    expect(overview.cards.steadyExplainer).toBeNull();
    expect(overview.notes[0]).toBe('kickstart-not-started');
    await weightScreen();
    const phase = screen.getByRole('region', { name: weight.phase.label });
    expect(within(phase).getByText(weight.phase.notStartedNote)).toBeDefined();
    expect(
      within(phase).getByText("By this phone's date, its first day is 3 February 2000.", {
        exact: false,
      }),
    ).toBeDefined();
    expect(within(phase).queryByRole('button', { name: weight.start.action })).toBeNull();
    fireEvent.click(within(phase).getByRole('button', { name: weight.end.action }));
    fireEvent.click(within(phase).getByRole('button', { name: weight.end.yes }));
    await waitFor(async () => {
      expect(await periods(db)).toMatchObject([{ endReason: 'user-ended' }]);
    });
  });

  it('a closed gate ends it before it starts (the same rule as a running one)', async () => {
    const { snapshot, now } = aheadSnapshot();
    const db = await seedSnapshot(snapshot, now);
    await answerReadiness(db.storage, 'q2', 'yes');
    expect(await periods(db)).toMatchObject([{ endReason: 'readiness-gated' }]);
  });
});

describe('item 12’s clock refusal is shown in plain words', () => {
  it('StorageClockError reads as the clock message, never a code name', () => {
    for (const action of ['start', 'extension'] as const) {
      expect(weightWriteMessage(new StorageClockError(), action)).toEqual({
        text: privacy.clockBehind,
        tone: 'alert',
      });
    }
  });
});

describe('Today: item 13’s day-one help card stays first; the Weight card follows the reminders (item 16 sets the final order)', () => {
  it('with answer 7 "yes" and a running Kickstart, the help card is the first card and the Weight card comes after it', async () => {
    await seed({ ...WEIGHT_SCENARIOS.K10, readiness: { q7: 'yes' } }, 10);
    await openApp('#/today');
    const weightCard = await screen.findByRole('region', { name: weight.card.label });
    const help = (await screen.findByTestId('alcohol-help-card')).closest('section');
    expect(document.querySelector('section')).toBe(help);
    expect(
      (help as Node).compareDocumentPosition(weightCard) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });
});
