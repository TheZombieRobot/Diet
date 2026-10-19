// The Weight screen (item 14 design sections 2.4 to 2.6 and 6.4): the long-term goal (WT-01,
// WT-02, HS-01), the weigh-ins list and its zones (W6), the Phase card (W24, W31) and the screen's
// wording. jsdom over the real repositories on fake-indexeddb.
import { weight } from '@diet/core/copy/health';
import {
  onDay,
  WEIGHT_SCENARIOS,
  type WeightScenarioOptions,
  weightScenario,
} from '@diet/test-fixtures';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { commerceRules, healthPhraseRules } from '../../../../../tools/scans/rules';
import { scanText } from '../../../../../tools/scans/scan';
import { appStorageStore } from '../../db/runtime';
import { openSnapshotDb, type TestDb } from '../../db/testKit';
import { preStartStopSignStore } from './preStartCheck';
import { weightStatusStore } from './stores';
import { WeightScreen } from './WeightScreen';

let test: TestDb | undefined;

afterEach(() => {
  cleanup();
  appStorageStore.set(null);
  weightStatusStore.set(null);
  preStartStopSignStore.set(null);
  test?.db.shutDown();
  test = undefined;
});

async function open(options: WeightScenarioOptions, day: number, zone?: string): Promise<TestDb> {
  const seen = onDay(options, day);
  test = await openSnapshotDb(weightScenario(seen), seen.now, zone);
  appStorageStore.set(test.storage);
  render(<WeightScreen />);
  await screen.findByRole('region', { name: weight.goal.label });
  return test;
}

const goalCard = () => screen.getByRole('region', { name: weight.goal.label });
const typeGoal = (value: string) => {
  fireEvent.change(within(goalCard()).getByRole('textbox', { name: weight.goal.fieldLabel }), {
    target: { value },
  });
  fireEvent.click(within(goalCard()).getByRole('button', { name: weight.goal.save }));
};
/** One weigh-in of 100.0 kg on day 1, a 180 cm height and no goal, seen on day 1. */
const oneWeighIn = { ...WEIGHT_SCENARIOS.PENDING, goalKg: null };

describe('the long-term goal (WT-01, WT-02, HS-01)', () => {
  it('WT-01: refuses a goal below BMI 18.5 without naming the floor, and one at or above the current weight; writes nothing', async () => {
    const db = await open(oneWeighIn, 1);
    const update = vi.spyOn(db.repos.profile, 'update');
    typeGoal('55');
    const refusal = await within(goalCard()).findByText(weight.goal.belowBmiFloor);
    expect(refusal.textContent).not.toMatch(/\bkg\b|59\.\d/);
    typeGoal('100');
    expect(await within(goalCard()).findByText(weight.goal.notBelowWeight)).toBeTruthy();
    expect(update).not.toHaveBeenCalled();
  });

  it('WT-01: needs a height first', async () => {
    await open({ ...oneWeighIn, heightCm: null }, 1);
    typeGoal('78');
    expect(await within(goalCard()).findAllByText(weight.goal.needsHeight)).not.toHaveLength(0);
  });

  it('a goal 22% below is saved as the trio, labelled long-term, with the next milestone; Remove clears all three', async () => {
    const db = await open(oneWeighIn, 1);
    typeGoal('78');
    await waitFor(async () => {
      expect(await db.repos.profile.get()).toMatchObject({
        goalKg: 78,
        goalSetAt: db.env.now(),
        goalReferenceKg: 100,
      });
    });
    const goal = await within(goalCard()).findByRole('group', { name: weight.goal.label });
    expect(goal.textContent).toContain('78.0 kg');
    expect(within(goalCard()).getByText('Next milestone 80.0 kg')).toBeTruthy();
    expect(
      within(goalCard()).getByText(
        'The long-term goal is approached a step at a time. Your next milestone is 80.0 kg, no more than 20% below your current weight.',
      ),
    ).toBeTruthy();
    fireEvent.click(within(goalCard()).getByRole('button', { name: weight.goal.remove }));
    expect(within(goalCard()).getByText(weight.goal.removeConfirm)).toBeTruthy();
    fireEvent.click(within(goalCard()).getByRole('button', { name: weight.goal.remove }));
    await waitFor(async () => {
      expect(await db.repos.profile.get()).toMatchObject({
        goalKg: null,
        goalSetAt: null,
        goalReferenceKg: null,
      });
    });
  });

  it('WT-02: with the only weigh-in 20 days old, no milestone figure, only a prompt to weigh in', async () => {
    await open({ ...WEIGHT_SCENARIOS.PENDING, today: '2000-02-21' }, 21);
    expect(within(goalCard()).getByText(weight.goal.milestoneNeedsWeighIn)).toBeTruthy();
    expect(goalCard().textContent).not.toContain('Next milestone');
  });
});

describe('the weigh-ins list keeps each record in its own zone (W6; storage spec 3.1)', () => {
  /** One weigh-in made in Perth (device zone Auckland when it is edited). */
  async function perth(): Promise<{ db: TestDb; id: string }> {
    const options = { ...WEIGHT_SCENARIOS.PENDING, goalKg: null };
    const seen = onDay(options, 1);
    const snapshot = weightScenario(seen);
    const row = {
      ...snapshot.weights[0],
      id: snapshot.weights[0]?.id ?? '',
      at: '2000-01-30T23:00:00.000Z',
      timeZone: 'Australia/Perth',
      kg: 100,
      source: 'manual' as const,
      note: null,
    };
    test = await openSnapshotDb({ ...snapshot, weights: [row] }, seen.now);
    appStorageStore.set(test.storage);
    render(<WeightScreen />);
    await screen.findByRole('region', { name: weight.list.label });
    return { db: test, id: row.id };
  }
  const list = () => screen.getByRole('region', { name: weight.list.label });

  it('shows the time in Perth; a kg-only edit sends no time and no zone, and the row stays in Perth', async () => {
    const { db, id } = await perth();
    expect(within(list()).getByText('31 January 2000, 7:00 am: 100.0 kg')).toBeTruthy();
    const update = vi.spyOn(db.repos.weights, 'update');
    fireEvent.click(within(list()).getByRole('button', { name: weight.list.edit }));
    fireEvent.change(within(list()).getByRole('textbox', { name: weight.entry.fieldLabel }), {
      target: { value: '99.5' },
    });
    fireEvent.click(within(list()).getByRole('button', { name: weight.list.saveChanges }));
    await waitFor(() => {
      expect(update).toHaveBeenCalledWith(id, { kg: 99.5, note: null });
    });
    await waitFor(async () => {
      expect(await db.repos.weights.get(id)).toMatchObject({
        kg: 99.5,
        timeZone: 'Australia/Perth',
        at: '2000-01-30T23:00:00.000Z',
      });
    });
  });

  it('a time edit is read in Perth and sent with the record’s own zone', async () => {
    const { db, id } = await perth();
    fireEvent.click(within(list()).getByRole('button', { name: weight.list.edit }));
    fireEvent.change(within(list()).getByLabelText(weight.entry.timeLabel), {
      target: { value: '06:00' },
    });
    fireEvent.click(within(list()).getByRole('button', { name: weight.list.saveChanges }));
    await waitFor(async () => {
      expect(await db.repos.weights.get(id)).toMatchObject({
        at: '2000-01-30T22:00:00.000Z',
        timeZone: 'Australia/Perth',
      });
    });
  });

  it('Delete asks first', async () => {
    const { db, id } = await perth();
    fireEvent.click(within(list()).getByRole('button', { name: weight.list.delete }));
    expect(within(list()).getByText(weight.list.deleteConfirm)).toBeTruthy();
    expect(await db.repos.weights.get(id)).toBeDefined();
    fireEvent.click(within(list()).getByRole('button', { name: weight.list.deleteYes }));
    await waitFor(async () => {
      expect(await db.repos.weights.get(id)).toBeUndefined();
    });
  });
});

describe('the Phase card (W24, W31)', () => {
  const phaseCard = () => screen.getByRole('region', { name: weight.phase.label });

  it('during Kickstart: the due date, the extensions used, and End Kickstart now after a confirmation', async () => {
    const db = await open(WEIGHT_SCENARIOS.K10, 10);
    expect(
      within(phaseCard()).getByText('Kickstart is due to finish on 21 February 2000.'),
    ).toBeTruthy();
    expect(within(phaseCard()).getByText('Extensions used: 0 of 3.')).toBeTruthy();
    fireEvent.click(within(phaseCard()).getByRole('button', { name: weight.end.action }));
    expect(within(phaseCard()).getByText(weight.end.confirm)).toBeTruthy();
    fireEvent.click(within(phaseCard()).getByRole('button', { name: weight.end.yes }));
    await waitFor(async () => {
      expect((await db.repos.kickstart.listPeriods())[0]).toMatchObject({
        endReason: 'user-ended',
      });
    });
    expect(await screen.findByText(weight.end.ended)).toBeTruthy();
  });

  it('after a pre-start "yes" the Phase card says a new Kickstart cannot start yet', async () => {
    await open({ ...WEIGHT_SCENARIOS.K42, today: '2000-03-01' }, 30);
    fireEvent.click(within(phaseCard()).getByRole('button', { name: weight.start.action }));
    for (const q of [
      weight.check.dizzyOnStanding,
      weight.check.palpitations,
      weight.check.crampsNotSettling,
      weight.check.faintAtWork,
    ]) {
      const group = within(phaseCard()).getByRole('radiogroup', { name: q });
      fireEvent.click(
        within(group).getByRole('radio', {
          name: q === weight.check.palpitations ? weight.check.yes : weight.check.no,
        }),
      );
    }
    fireEvent.click(within(phaseCard()).getByRole('button', { name: weight.check.confirmStart }));
    expect(
      await within(phaseCard()).findByText(weight.start.unavailableRecentStopSign),
    ).toBeTruthy();
    expect(screen.getByText(weight.start.stopSign)).toBeTruthy();
  });
});

describe('the Weight screen’s wording', () => {
  it('passes every health and commerce rule on Kickstart day 19, with every card shown', async () => {
    await open(WEIGHT_SCENARIOS.K42, 19);
    const labels = [...document.querySelectorAll('[aria-label]')].map(
      (e) => e.getAttribute('aria-label') ?? '',
    );
    const found = scanText('weight screen', [document.body.textContent, ...labels].join('\n'), [
      ...healthPhraseRules,
      ...commerceRules,
    ]);
    expect(found.map((v) => v.ruleId)).toEqual([]);
  });
});
