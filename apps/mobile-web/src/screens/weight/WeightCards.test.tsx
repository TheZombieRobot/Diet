// The Kickstart cards on Today (item 14 design sections 2.3 and 6.4): the extension check (WT-09),
// a stop-sign answer after the card was hidden (HS-27, W22, W33), the start card (W14, W31), the
// explanation of the Steady flip and the 22:2 move (WT-08, C55). jsdom over the real repositories
// on fake-indexeddb, seeded with synthetic scenarios.
import { READINESS_WORDING, readinessGates, weightGateInput } from '@diet/core';
import { readiness, weight } from '@diet/core/copy/health';
import {
  onDay,
  WEIGHT_SCENARIOS,
  type WeightScenarioOptions,
  weightScenario,
} from '@diet/test-fixtures';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { openSnapshotDb, type TestDb } from '../../db/testKit';
import { reconcileKickstart } from './kickstartActions';
import { preStartStopSignStore } from './preStartCheck';
import { presetMovedStore, weightStatusStore } from './stores';
import { currentWeightEnv, overviewInputFrom, readWeightInputs } from './useWeightView';
import { WeightCard } from './WeightCard';
import { weightOverview } from '@diet/core';

let test: TestDb | undefined;

afterEach(() => {
  cleanup();
  weightStatusStore.set(null);
  presetMovedStore.set(null);
  preStartStopSignStore.set(null);
  test?.db.shutDown();
  test = undefined;
});

async function today(options: WeightScenarioOptions, day: number): Promise<TestDb> {
  const seen = onDay(options, day);
  test = await openSnapshotDb(weightScenario(seen), seen.now);
  render(<WeightCard storage={test.storage} />);
  await screen.findByRole('region', { name: weight.card.label });
  return test;
}

const region = (name: string) => screen.getByRole('region', { name });
const queryRegion = (name: string) => screen.queryByRole('region', { name });
const statusLine = () =>
  screen
    .getAllByRole('status')
    .map((s) => s.textContent)
    .join(' ');

/** Answers the four questions in the open panel: "No" to each, or "Yes" to the named one. */
function answer(yesTo?: string): void {
  for (const q of [
    weight.check.dizzyOnStanding,
    weight.check.palpitations,
    weight.check.crampsNotSettling,
    weight.check.faintAtWork,
  ]) {
    const group = screen.getByRole('radiogroup', { name: q });
    fireEvent.click(
      within(group).getByRole('radio', { name: q === yesTo ? weight.check.yes : weight.check.no }),
    );
  }
}

/**
 * Writes a readiness answer behind the screen's back, as another tab would: raw IndexedDB, so no
 * live query on this screen sees it.
 */
function answerElsewhere(db: TestDb, questionId: 'q3', answer: 'yes'): Promise<void> {
  return new Promise((resolve, reject) => {
    const open = db.deps.indexedDB.open('diet');
    open.onerror = () => {
      reject(new Error('open failed'));
    };
    open.onsuccess = () => {
      const idb = open.result;
      const tx = idb.transaction('readiness', 'readwrite');
      tx.objectStore('readiness').put({
        questionId,
        answer,
        wordingVersion: READINESS_WORDING[questionId],
        answeredAt: db.env.now(),
      });
      tx.oncomplete = () => {
        idb.close();
        resolve();
      };
      tx.onerror = () => {
        reject(new Error('write failed'));
      };
    };
  });
}

/** The overview the reconciler would act on now. */
async function reconcile(db: TestDb): Promise<void> {
  const overview = weightOverview(
    overviewInputFrom(await readWeightInputs(db.storage), currentWeightEnv(db.storage)),
  );
  await act(async () => {
    await reconcileKickstart(db.storage, overview);
  });
}

describe('the extension offer and its check (WT-09, C59)', () => {
  it('asks the four questions first, writes nothing until all are answered, and four "no" extend by a week', async () => {
    const db = await today(WEIGHT_SCENARIOS.K42, 19);
    const offer = region(weight.extension.label);
    expect(within(offer).getByText(weight.rapidLoss.body)).toBeTruthy();
    fireEvent.click(within(offer).getByRole('button', { name: weight.extension.extend }));
    const confirm = within(offer).getByRole<HTMLButtonElement>('button', {
      name: weight.check.confirmExtend,
    });
    expect(confirm.disabled).toBe(true);
    expect(confirm.getAttribute('aria-describedby')).not.toBeNull();
    expect(await db.repos.kickstart.listChecks()).toEqual([]);
    answer();
    expect(confirm.disabled).toBe(false);
    fireEvent.click(confirm);
    await waitFor(() => {
      expect(statusLine()).toContain('Kickstart extended by one week. It is now week 3 of 4.');
    });
    expect(await db.repos.kickstart.listChecks()).toMatchObject([
      { outcome: 'extended', energyRating: null, sleepRating: null },
    ]);
    expect(
      await within(region(weight.card.label)).findByText('Kickstart, week 3 of 4'),
    ).toBeTruthy();
  });

  it('a palpitations "yes": no extension, the outcome line, and the stop-sign card expanded with End Kickstart now as the main button', async () => {
    const db = await today(WEIGHT_SCENARIOS.K42, 19);
    fireEvent.click(
      within(region(weight.extension.label)).getByRole('button', { name: weight.extension.extend }),
    );
    answer(weight.check.palpitations);
    fireEvent.click(screen.getByRole('button', { name: weight.check.confirmExtend }));
    await waitFor(() => {
      expect(statusLine()).toContain(weight.extension.stopSign);
    });
    // The card that takes focus says the rest; the outcome line does not say it twice.
    expect(statusLine()).not.toContain('Eating more today is fine');
    expect(await db.repos.kickstart.listChecks()).toMatchObject([{ outcome: 'stop-sign' }]);
    await screen.findByText(weight.stopSigns.afterCheckRunning);
    const card = region(weight.stopSigns.label);
    expect(within(card).getByRole('button', { name: weight.stopSigns.endNow }).className).toContain(
      'ui-button--primary',
    );
    expect(within(card).queryByRole('button', { name: weight.stopSigns.hideToday })).toBeNull();
    expect(queryRegion(weight.extension.label)).toBeNull();
    expect(within(region(weight.card.label)).getByText('Kickstart, week 3 of 3')).toBeTruthy();
  });

  it('Cancel records nothing; "Not now" dismisses this offer only', async () => {
    const db = await today(WEIGHT_SCENARIOS.K42, 19);
    const offer = region(weight.extension.label);
    fireEvent.click(within(offer).getByRole('button', { name: weight.extension.extend }));
    fireEvent.click(within(offer).getByRole('button', { name: weight.check.cancel }));
    expect(await db.repos.kickstart.listChecks()).toEqual([]);
    fireEvent.click(within(offer).getByRole('button', { name: weight.extension.notNow }));
    await waitFor(() => {
      expect(queryRegion(weight.extension.label)).toBeNull();
    });
    const [period] = await db.repos.kickstart.listPeriods();
    expect(
      await db.repos.cardState.get('kickstart-extension', `period:${period?.id ?? ''}:0`),
    ).toMatchObject({
      dismissedAt: db.env.now(),
    });
  });
});

describe('a stop-sign answer after the card was hidden for the day (HS-27, W22)', () => {
  it('brings the card back, expanded, with the action line, 111 and Healthline, and no way to hide it; the outcome line stays', async () => {
    await today(WEIGHT_SCENARIOS.K42, 19);
    fireEvent.click(
      within(region(weight.stopSigns.label)).getByRole('button', {
        name: weight.stopSigns.hideToday,
      }),
    );
    await waitFor(() => {
      expect(queryRegion(weight.stopSigns.label)).toBeNull();
    });
    fireEvent.click(
      within(region(weight.extension.label)).getByRole('button', { name: weight.extension.extend }),
    );
    answer(weight.check.palpitations);
    fireEvent.click(screen.getByRole('button', { name: weight.check.confirmExtend }));
    const card = await screen.findByRole('region', { name: weight.stopSigns.label });
    expect(within(card).getByText(weight.stopSigns.action)).toBeTruthy();
    expect(
      within(card)
        .getAllByRole('link')
        .map((l) => l.getAttribute('href')),
    ).toEqual(['tel:111', 'tel:0800611116']);
    expect(within(card).queryByRole('button', { name: weight.stopSigns.hideToday })).toBeNull();
    expect(statusLine()).toContain(weight.extension.stopSign);
  });
});

describe('starting a Kickstart chosen at setup (W14, W31)', () => {
  it('a "yes" starts nothing, says what to do, and blocks a start for the rest of the day', async () => {
    const db = await today(WEIGHT_SCENARIOS.PENDING, 1);
    const card = region(weight.start.pendingLabel);
    expect(within(card).getByText(weight.start.pendingWindow)).toBeTruthy();
    fireEvent.click(within(card).getByRole('button', { name: weight.start.pendingAction }));
    expect(within(card).getByText(weight.check.introStart)).toBeTruthy();
    answer(weight.check.dizzyOnStanding);
    fireEvent.click(screen.getByRole('button', { name: weight.check.confirmStart }));
    const after = await screen.findByText(weight.start.stopSign);
    const shown = after.closest('section');
    expect(shown?.textContent).toContain(weight.stopSigns.action);
    expect(
      within(shown as HTMLElement)
        .getAllByRole('link')
        .map((l) => l.getAttribute('href')),
    ).toEqual(['tel:111', 'tel:0800611116']);
    expect(await db.repos.kickstart.listPeriods()).toEqual([]);
    expect(preStartStopSignStore.get()).toBe('2000-02-01');
    expect(queryRegion(weight.start.pendingLabel)?.textContent ?? '').not.toContain(
      weight.start.pendingAction,
    );
  });

  it('four "no": the period, the carb-ceiling start and the 23:1 Kickstart window, each said', async () => {
    const db = await today({ ...WEIGHT_SCENARIOS.PENDING, targets: {} }, 1);
    fireEvent.click(
      within(region(weight.start.pendingLabel)).getByRole('button', {
        name: weight.start.pendingAction,
      }),
    );
    answer();
    fireEvent.click(screen.getByRole('button', { name: weight.check.confirmStart }));
    await waitFor(() => {
      expect(statusLine()).toContain(weight.start.started);
    });
    expect(statusLine()).toContain(weight.start.presetSet);
    const [period] = await db.repos.kickstart.listPeriods();
    expect((await db.repos.profile.get()).carbCeilingStartedAt).toBe(period?.startedAt);
    expect(await db.repos.targets.get()).toMatchObject({
      fastingPreset: '23:1',
      presetChosenBy: 'kickstart-default',
    });
    expect(await screen.findByText('Kickstart, week 1 of 3')).toBeTruthy();
    expect(region(weight.stopSigns.label)).toBeTruthy();
  });

  it('the start re-checks the records: answer 3 turned "yes" in another tab while the questions were open starts nothing, and says why', async () => {
    const db = await today(WEIGHT_SCENARIOS.PENDING, 1);
    fireEvent.click(
      within(region(weight.start.pendingLabel)).getByRole('button', {
        name: weight.start.pendingAction,
      }),
    );
    answer();
    await answerElsewhere(db, 'q3', 'yes');
    // This screen has not seen the answer: the button is still there.
    fireEvent.click(screen.getByRole('button', { name: weight.check.confirmStart }));
    await waitFor(() => {
      expect(statusLine()).toContain(weight.start.unavailableGated);
    });
    expect(await db.repos.kickstart.listPeriods()).toEqual([]);
  });

  it('F35: the offer is true to what a start plans: no "bigger deficit" at 0%, no Kickstart figures without a rough guide', async () => {
    const { PENDING } = WEIGHT_SCENARIOS;
    const offer = () => region(weight.start.pendingLabel).textContent;
    await today(PENDING, 1);
    expect(offer()).toContain(weight.start.offer);
    cleanup();
    test?.db.shutDown();
    await today({ ...PENDING, targets: { ...PENDING.targets, kickstartDeficitPct: 0 } }, 1);
    expect(offer()).toContain(weight.start.offerNoDeficit);
    expect(offer()).not.toContain('bigger deficit');
    cleanup();
    test?.db.shutDown();
    await today({ ...PENDING, heightCm: null }, 1);
    expect(offer()).toContain(weight.start.offerNoGuide);
  });

  it('"Not now" clears the choice and says a Kickstart can start later', async () => {
    const db = await today(WEIGHT_SCENARIOS.PENDING, 1);
    fireEvent.click(
      within(region(weight.start.pendingLabel)).getByRole('button', { name: weight.start.notNow }),
    );
    await waitFor(() => {
      expect(statusLine()).toContain(weight.start.declined);
    });
    expect((await db.repos.profile.get()).kickstartOptIn).toBe(false);
  });
});

describe('the Steady flip is explained and the 23:1 Kickstart default moves to 22:2 (WT-08, C55)', () => {
  it('on day 22 the explainer shows the 22:2 line at once; OK before the move still lets it land, never silently', async () => {
    const db = await today(WEIGHT_SCENARIOS.K42, 22);
    const card = region(weight.steadyExplainer.label);
    expect(within(card).getByText(weight.steadyExplainer.window)).toBeTruthy();
    expect(within(card).getByText('Net carbs go back to your own ceiling of 30 g.')).toBeTruthy();
    expect(card.textContent).not.toContain('%');
    // The pace and rebound notes are on the Weight card beside it, not said twice.
    expect(card.textContent).not.toContain(weight.phase.steadyPace);
    fireEvent.click(within(card).getByRole('button', { name: weight.steadyExplainer.ok }));
    await waitFor(() => {
      expect(queryRegion(weight.steadyExplainer.label)).toBeNull();
    });
    await reconcile(db);
    expect(await db.repos.targets.get()).toMatchObject({
      fastingPreset: '22:2',
      eatingWindow: { start: '17:00', end: '19:00' },
      presetChosenBy: 'default',
    });
    // The explainer is gone, so the move is explained again by the eating-window notice.
    expect(await screen.findByRole('region', { name: weight.presetMoved.label })).toBeTruthy();
  });

  it('"Use 23:1 instead" keeps one meal as the owner’s own choice and says so', async () => {
    const db = await today(WEIGHT_SCENARIOS.K42, 22);
    fireEvent.click(
      within(region(weight.steadyExplainer.label)).getByRole('button', {
        name: weight.steadyExplainer.use231,
      }),
    );
    await waitFor(() => {
      expect(statusLine()).toContain(weight.steadyExplainer.kept231);
    });
    expect(await db.repos.targets.get()).toMatchObject({
      fastingPreset: '23:1',
      presetChosenBy: 'user',
    });
  });

  it('with a preset the owner chose there is no window line and nothing moves', async () => {
    const own = {
      fastingPreset: '18:6' as const,
      eatingWindow: { start: '13:00', end: '19:00' },
      presetChosenBy: 'user' as const,
    };
    const db = await today({ ...WEIGHT_SCENARIOS.K42, targets: own }, 22);
    expect(
      within(region(weight.steadyExplainer.label)).queryByText(weight.steadyExplainer.window),
    ).toBeNull();
    await reconcile(db);
    expect(await db.repos.targets.get()).toMatchObject(own);
  });

  it('when nothing else explains the move, the eating-window notice does, until OK', async () => {
    const options = WEIGHT_SCENARIOS.K42;
    const snapshot = weightScenario(onDay(options, 22));
    const trigger = `period:${snapshot.kickstart_periods[0]?.id ?? ''}`;
    const done = {
      cardId: 'steady-explainer' as const,
      trigger,
      firstShownAt: null,
      dismissedAt: null,
      dismissedTimeZone: null,
      doneAt: '2000-02-21T19:00:00.000Z',
    };
    const db = await today({ ...options, cardStates: [done] }, 22);
    await reconcile(db);
    const notice = await screen.findByRole('region', { name: weight.presetMoved.label });
    expect(within(notice).getByText(weight.presetMoved.body)).toBeTruthy();
    fireEvent.click(within(notice).getByRole('button', { name: weight.presetMoved.ok }));
    await waitFor(() => {
      expect(queryRegion(weight.presetMoved.label)).toBeNull();
    });
  });
});

describe('answer 4 and the 23:1 Kickstart default (C07; item 14 review)', () => {
  it('a finished Kickstart offers no one-tap 23:1, and the move to 22:2 is explained without one', async () => {
    const db = await today({ ...WEIGHT_SCENARIOS.K42, readiness: { q4: 'yes' } }, 22);
    const card = region(weight.steadyExplainer.label);
    expect(within(card).queryByText(weight.steadyExplainer.window)).toBeNull();
    expect(within(card).queryByRole('button', { name: weight.steadyExplainer.use231 })).toBeNull();
    await reconcile(db);
    expect(await db.repos.targets.get()).toMatchObject({
      fastingPreset: '22:2',
      presetChosenBy: 'default',
    });
    const notice = await screen.findByRole('region', { name: weight.presetMoved.label });
    expect(within(notice).getByText(weight.presetMoved.answer4)).toBeTruthy();
    expect(within(notice).queryByRole('button', { name: weight.presetMoved.use231 })).toBeNull();
  });
});

describe('the gates read the readiness rows through item 13’s gate function', () => {
  it('answer 4 "yes" gives the blood-pressure stop-sign wording', async () => {
    const db = await today({ ...WEIGHT_SCENARIOS.K10, readiness: { q4: 'yes' } }, 10);
    const inputs = await readWeightInputs(db.storage);
    expect(
      readinessGates(
        weightGateInput({ ...inputs, homeTimeZone: inputs.settings.homeTimeZone }, '2000-02-10'),
      ).bloodPressureSaltWording,
    ).toBe(true);
    expect(
      within(region(weight.stopSigns.label)).getByText(readiness.bloodPressure.stopSign),
    ).toBeTruthy();
  });
});
