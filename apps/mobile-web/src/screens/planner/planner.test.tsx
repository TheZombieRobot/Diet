// The planner screens in the whole app (item 22 design 6.3): the real repositories on
// fake-indexeddb and core's synthetic planner fixtures through the mocked dataset entry point.
// The onboarded owner is synthetic: female, 175 cm, born 1970, 100 kg, keto, the 22:2 window; the
// clock is Wednesday 1 March 2000, 13:00 in New Zealand (week 28 February to 5 March). Steady
// figures: 10,968 kJ, a 120 g protein check, a 29 g saturated-fat budget, a 30 g carb ceiling.
import type { MealSlot, PlanWriteKind } from '@diet/core';
import { fasting, planner, readiness, recipes, targets } from '@diet/core/copy/health';
import { foodId, R } from '@diet/core/planner/testData';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from '../../App';
import { appStorageStore } from '../../db/runtime';
import { type OnboardOptions, onboardForTests, openTestDb, type TestDb } from '../../db/testKit';
import { screenTitleStore } from '../../screenTitle';
import { setPlannerData } from '../../testSetup/plannerData';
import { recordPreStartStopSign } from '../weight/preStartCheck';
import { planWeekStore } from './stores';

vi.mock('../../planner/planData', async () =>
  (await import('../../testSetup/plannerData')).plannerDataMock(),
);

const TODAY = '2000-03-01';
const TOMORROW = '2000-03-02';
let test: TestDb;

beforeEach(() => {
  window.matchMedia = vi.fn(
    (query: string) => ({ matches: false, media: query }) as MediaQueryList,
  );
  setPlannerData({});
});
afterEach(() => {
  cleanup();
  appStorageStore.set(null);
  screenTitleStore.set(null);
  planWeekStore.set(null);
  test.db.shutDown();
  window.location.hash = '';
});

async function open(
  options: OnboardOptions & { readonly seed?: (t: TestDb) => Promise<unknown> } = {},
): Promise<TestDb> {
  test = await openTestDb();
  await onboardForTests(test, options);
  await options.seed?.(test);
  appStorageStore.set(test.storage);
  return test;
}

async function show(hash: string): Promise<void> {
  window.location.hash = hash;
  render(<App />);
  await screen.findByRole('heading', { level: 1 });
}

function go(hash: string): void {
  act(() => {
    window.location.hash = hash;
    window.dispatchEvent(new HashChangeEvent('hashchange'));
  });
}

const plan = (
  t: TestDb,
  date: string,
  slot: MealSlot,
  recipeId: string,
  myServes = 1,
  householdServes = 1,
  kind: PlanWriteKind = 'owner-meal',
) =>
  t.repos.planDays.writeMeals({
    kind,
    writes: [{ date, slot, meal: { recipeId, myServes, householdServes } }],
    labelChecked: [],
    conflictConfirmed: [],
  });

const weekCard = async () => {
  await screen.findByTestId('plan-week-heading');
  return screen.getByRole('region', { name: planner.week.label });
};
const slotBlock = async (slot: string) => screen.findByTestId(`slot-${slot}`);
const oneMealSchedule = (t: TestDb) =>
  t.repos.targets.update({
    fastingPreset: '23:1',
    eatingWindow: { start: '18:00', end: '19:00' },
    presetChosenBy: 'user',
  });

describe('the Meal plan card (item 22 K1, K2, K7)', () => {
  it('K1, K2: seven days Monday to Sunday, today marked, past days marked, and week navigation', async () => {
    await open();
    await show('#/food');
    const card = await weekCard();
    expect(within(card).getByTestId('plan-week-heading').textContent).toBe('Week of 28 February');
    const rows = within(card)
      .getAllByRole('link')
      .filter((a) => a.getAttribute('href')?.startsWith('#/plan/'));
    expect(rows.map((a) => a.getAttribute('href'))).toEqual(
      ['02-28', '02-29', '03-01', '03-02', '03-03', '03-04', '03-05'].map(
        (d) => `#/plan/2000-${d}`,
      ),
    );
    expect(rows[2]?.getAttribute('aria-current')).toBe('date');
    expect(rows[2]?.textContent).toContain(planner.week.today);
    expect(rows[0]?.textContent).toContain(planner.week.past);
    expect(within(card).getByText(planner.week.intro)).toBeDefined();
    fireEvent.click(within(card).getByRole('button', { name: planner.week.previous }));
    expect(within(card).getByTestId('plan-week-heading').textContent).toBe('Week of 21 February');
    expect(within(card).getByText(planner.week.readOnly)).toBeDefined();
    expect(within(card).queryByRole('button', { name: planner.week.fill })).toBeNull();
    fireEvent.click(within(card).getByRole('button', { name: planner.week.thisWeek }));
    fireEvent.click(within(card).getByRole('button', { name: planner.week.next }));
    expect(within(card).getByTestId('plan-week-heading').textContent).toBe('Week of 6 March');
    expect(within(card).queryByRole('button', { name: planner.week.next })).toBeNull();
    // The pressed Next week is gone: focus is on the new week's heading.
    await waitFor(() => {
      expect(document.activeElement).toBe(within(card).getByTestId('plan-week-heading'));
    });
  });

  it('K2: a planned day shows its meals and an under-the-floor chip; K7: the household line', async () => {
    await open({
      profile: { householdSize: 3 },
      seed: (t) => plan(t, TOMORROW, 'dinner', R.gardenF, 1, 3),
    });
    await show('#/food');
    const card = await weekCard();
    expect(within(card).getByText('Dinner for 3; my portion shown separately.')).toBeDefined();
    const row = within(card).getByRole('link', { name: /Thursday 2 March/ });
    expect(row.textContent).toContain('Dinner: Example garden dinner F');
    expect(row.textContent).toContain(planner.week.chips.underFloor);
  });

  it('K1: a dataset that cannot be loaded says so, with Reload', async () => {
    setPlannerData(null);
    await open();
    await show('#/food');
    expect(await screen.findByText(planner.screen.dataFailed)).toBeDefined();
  });
});

describe('a planned day (item 22 K3, K5, K6, K7, K12, K18)', () => {
  it('K3 NN-02: a 22:2 day plans the 5 pm snack and dinner in "Eat 5:00 pm – 7:00 pm."', async () => {
    await open();
    await show(`#/plan/${TOMORROW}`);
    const window = await screen.findByRole('region', { name: planner.day.windowLabel });
    expect(window.textContent).toContain('Eat 5:00 pm – 7:00 pm.');
    const meals = screen.getByRole('region', { name: planner.day.mealsLabel });
    expect(
      within(meals)
        .getAllByRole('heading', { level: 3 })
        .map((h) => h.textContent),
    ).toEqual(['5 pm snack', 'Dinner']);
  });

  it('K3 RD-01 to RD-04: with answer 5 "yes" the day plans breakfast, lunch, dinner and a snack, names no window and gives no readiness link', async () => {
    await open({ answers: { q5: 'yes' } });
    await show(`#/plan/${TOMORROW}`);
    const meals = await screen.findByRole('region', { name: planner.day.mealsLabel });
    expect(
      within(meals)
        .getAllByRole('heading', { level: 3 })
        .map((h) => h.textContent),
    ).toEqual(['Breakfast', 'Lunch', 'Snack', 'Dinner']);
    expect(within(meals).getByRole('button', { name: planner.day.addSnackMeal })).toBeDefined();
    const window = screen.getByRole('region', { name: planner.day.windowLabel });
    expect(window.textContent).toContain(planner.day.fastingOff);
    expect(await within(window).findByTestId('gate-notice-fasting')).toBeDefined();
    expect(document.body.textContent).not.toMatch(/Eat \d/);
    expect(within(window).queryByRole('link', { name: readiness.changeAnswersLink })).toBeNull();
  });

  it('K3 V48: with answer 4 "yes" a windowed day shows the pharmacist line', async () => {
    await open({ answers: { q4: 'yes' } });
    await show(`#/plan/${TOMORROW}`);
    const window = await screen.findByRole('region', { name: planner.day.windowLabel });
    expect(window.textContent).toContain(fasting.pharmacist);
  });

  it('K5 HS-R20: with peanuts listed, a "check labels" recipe asks first; Cancel writes nothing; Confirm writes one meal', async () => {
    await open({ profile: { allergens: ['peanut'] } });
    await show(`#/plan/${TOMORROW}`);
    fireEvent.click(
      within(await slotBlock('dinner')).getByRole('button', { name: planner.day.choose }),
    );
    const labels = await screen.findByRole('radiogroup', {
      name: new RegExp(planner.picker.checkLabelsLegend),
    });
    fireEvent.click(within(labels).getByRole('radio', { name: /Example packed dinner G/ }));
    fireEvent.click(screen.getByRole('button', { name: /Add to Thursday 2 March/ }));
    const check = await screen.findByTestId('label-check');
    expect(check.textContent).toContain('peanuts');
    expect(within(check).getByText('Example packed food')).toBeDefined();
    fireEvent.click(within(check).getByRole('button', { name: planner.labelCheck.cancel }));
    await screen.findByTestId('meal-picker');
    expect(await test.repos.planDays.get(TOMORROW)).toBeUndefined();
    fireEvent.click(screen.getByRole('radio', { name: /Example packed dinner G/ }));
    fireEvent.click(screen.getByRole('button', { name: /Add to Thursday 2 March/ }));
    fireEvent.click(
      within(await screen.findByTestId('label-check')).getByRole('button', {
        name: planner.labelCheck.confirm,
      }),
    );
    await screen.findByText('Added Example packed dinner G.');
    expect((await test.repos.planDays.get(TOMORROW))?.meals).toHaveLength(1);
    expect(
      await within(await slotBlock('dinner')).findByText(recipes.chips.checkLabels),
    ).toBeDefined();
  });

  it('K6 NU-05: a day over the saturated-fat budget fills amber with no word; HS-R18: unknown figures read "not known"', async () => {
    await open({
      seed: async (t) => {
        await plan(t, TOMORROW, 'dinner', R.dinnerA, 2);
        await plan(t, TOMORROW, 'snack', R.snackB, 2);
      },
    });
    await show(`#/plan/${TOMORROW}`);
    const figures = await screen.findByRole('region', { name: planner.figures.label });
    const over = figures.querySelector('[data-state="over"]');
    expect(over?.textContent).toContain(targets.today.satFat);
    expect(figures.textContent).not.toMatch(/\bbad\b|fail|over budget|warning/i);
    cleanup();
    setPlannerData({ loaded: false });
    await show(`#/plan/${TOMORROW}`);
    const unknown = await screen.findByRole('region', { name: planner.figures.label });
    expect(unknown.textContent).toContain('not known');
    expect(unknown.textContent).toContain(planner.figures.notLoaded);
  });

  it('K7 FL-05 HS-23: Cooking for 3 → 4 leaves every planned figure unchanged', async () => {
    await open({
      profile: { householdSize: 3 },
      seed: (t) => plan(t, TOMORROW, 'dinner', R.dinnerA, 1, 3),
    });
    await show(`#/plan/${TOMORROW}`);
    const figures = await screen.findByRole('region', { name: planner.figures.label });
    const before = figures.textContent;
    fireEvent.click(
      within(await slotBlock('dinner')).getByRole('button', { name: planner.day.change }),
    );
    fireEvent.click(screen.getByRole('button', { name: /One more person/ }));
    fireEvent.click(screen.getByRole('button', { name: planner.picker.save }));
    await screen.findByText(planner.day.saved);
    await waitFor(async () => {
      expect((await test.repos.planDays.get(TOMORROW))?.meals[0]?.householdServes).toBe(4);
    });
    expect(screen.getByRole('region', { name: planner.figures.label }).textContent).toBe(before);
  });

  it('K12 FL-12 HS-18: a short 23:1 dinner offers the 5 pm snack, with item 15’s action', async () => {
    await open({
      seed: async (t) => {
        await oneMealSchedule(t);
        await plan(t, TOMORROW, 'dinner', R.gardenF);
      },
    });
    await show(`#/plan/${TOMORROW}`);
    const window = await screen.findByRole('region', { name: planner.day.windowLabel });
    expect(within(window).getByTestId('plan-sitting').textContent).toBe(
      "This day's dinner carries 54 g protein.",
    );
    expect(window.textContent).toContain('One meal needs about 120 g.');
    expect(window.textContent).not.toMatch(/broken fast|streak/i);
    fireEvent.click(within(window).getByRole('button', { name: fasting.mealCheck.addSnack }));
    await waitFor(async () => {
      expect((await test.repos.planDays.get(TOMORROW))?.eatingWindow).toEqual({
        start: '17:00',
        end: '19:00',
      });
    });
    expect(
      await screen.findByText('5 pm snack added for this day. Eat 5:00 pm – 7:00 pm.'),
    ).toBeDefined();
    expect(await slotBlock('snack')).toBeDefined();
  });

  it('K12 V50: once 5 pm has passed, today’s short sitting shows the widen line and the eating schedule, no snack', async () => {
    await open({
      seed: async (t) => {
        await oneMealSchedule(t);
        await plan(t, TODAY, 'dinner', R.gardenF);
      },
    });
    test.env.set('2000-03-01T04:30:00.000Z'); // 17:30 in New Zealand
    await show(`#/plan/${TODAY}`);
    const window = await screen.findByRole('region', { name: planner.day.windowLabel });
    await within(window).findByText(fasting.mealCheck.widen);
    expect(within(window).getByText(fasting.mealCheck.widenDetail)).toBeDefined();
    expect(within(window).queryByRole('button', { name: fasting.mealCheck.addSnack })).toBeNull();
  });

  it('V44: a reflux day points to item 15’s reflux options', async () => {
    await open({
      seed: async (t) => {
        await oneMealSchedule(t);
        await t.repos.symptoms.create({ symptom: 'heartburn', severity: null, note: null });
      },
    });
    await show(`#/plan/${TODAY}`);
    const window = await screen.findByRole('region', { name: planner.day.windowLabel });
    expect(await within(window).findByText(planner.day.refluxNote)).toBeDefined();
    expect(within(window).getByRole('link', { name: fasting.pattern.refluxLink })).toBeDefined();
  });

  it('F20 (DECISIONS 2026-10-22): during a stop-sign pause the day names no window time and offers no snack or reflux option', async () => {
    await open({
      seed: async (t) => {
        await oneMealSchedule(t);
        await plan(t, TODAY, 'dinner', R.gardenF);
        await t.repos.symptoms.create({ symptom: 'heartburn', severity: null, note: null });
        await recordPreStartStopSign(t.storage, TODAY);
      },
    });
    await show(`#/plan/${TODAY}`);
    const window = await screen.findByRole('region', { name: planner.day.windowLabel });
    expect(window.textContent).toContain(fasting.card.stopSignPause);
    expect(window.textContent).not.toMatch(/\d:\d\d [ap]m/);
    expect(within(window).queryByRole('button', { name: /snack/i })).toBeNull();
    expect(window.textContent).toContain(fasting.mealCheck.widen);
    expect(window.textContent).not.toContain(planner.day.refluxNote);
    expect(within(window).queryByRole('link', { name: fasting.pattern.refluxLink })).toBeNull();
  });

  it('V19: Remove asks first, with focus on the question; Keep it goes back to Change; Yes removes', async () => {
    await open({ seed: (t) => plan(t, TOMORROW, 'dinner', R.dinnerA) });
    await show(`#/plan/${TOMORROW}`);
    const block = await slotBlock('dinner');
    fireEvent.click(await within(block).findByRole('button', { name: planner.day.remove }));
    const question = await within(block).findByText(/^Remove Example dinner A from /);
    await waitFor(() => {
      expect(document.activeElement).toBe(question);
    });
    fireEvent.click(within(block).getByRole('button', { name: planner.day.removeNo }));
    await waitFor(() => {
      expect(document.activeElement).toBe(
        within(block).getByRole('button', { name: planner.day.change }),
      );
    });
    expect((await test.repos.planDays.get(TOMORROW))?.meals).toHaveLength(1);
    fireEvent.click(within(block).getByRole('button', { name: planner.day.remove }));
    fireEvent.click(await within(block).findByRole('button', { name: planner.day.removeYes }));
    await waitFor(async () => {
      expect(await test.repos.planDays.get(TOMORROW)).toBeUndefined();
    });
  });

  it('V3: a past day with no saved window has no empty Eating window card, and its figures line has no "yet"', async () => {
    await open();
    await show('#/plan/2000-02-28');
    await screen.findByRole('region', { name: planner.day.mealsLabel });
    expect(screen.queryByRole('region', { name: planner.day.windowLabel })).toBeNull();
    expect(screen.getByRole('region', { name: planner.figures.label }).textContent).toContain(
      planner.figures.nonePast,
    );
  });

  it('K18 V41: a date after the planning range opens read-only', async () => {
    await open();
    await show('#/plan/2000-03-13');
    const meals = await screen.findByRole('region', { name: planner.day.mealsLabel });
    expect(meals.textContent).toContain(planner.day.tooFar);
    expect(within(meals).queryByRole('button')).toBeNull();
  });
});

describe('Fill and Copy (item 22 K8, K13; NU-06, HS-R18, T3, V39, V40)', () => {
  it('K8 HS-R18: before food figures are loaded every editable day is "not filled" and nothing can be used', async () => {
    setPlannerData({ loaded: false });
    await open();
    await show('#/food');
    const card = await weekCard();
    expect(within(card).getByText(planner.week.noFillFigures)).toBeDefined();
    fireEvent.click(within(card).getByRole('button', { name: planner.week.fill }));
    const panel = await screen.findByTestId('plan-fillWeek-panel');
    expect(within(panel).getByText(planner.week.noFillFigures)).toBeDefined();
    const refused = within(panel).getAllByRole('listitem');
    expect(refused).toHaveLength(5);
    expect(refused[0]?.textContent).toMatch(
      /^Wednesday 1 March: The planner did not fill this day: the energy in some of its meals is not known yet/,
    );
    expect(within(panel).getByRole('button', { name: planner.fill.use })).toHaveProperty(
      'disabled',
      true,
    );
  });

  it('K8: Use this plan writes the proposed days and reports the count', async () => {
    await open();
    await show('#/food');
    const card = await weekCard();
    fireEvent.click(within(card).getByRole('button', { name: planner.week.fill }));
    const panel = await screen.findByTestId('plan-fillWeek-panel');
    expect(within(panel).getByText(planner.fill.proposedHeading)).toBeDefined();
    fireEvent.click(within(panel).getByRole('button', { name: planner.fill.use }));
    const done = await within(card).findByText(/^Filled \d+ days?\.$/);
    const count = Number(/\d+/.exec(done.textContent)?.[0]);
    expect(count).toBeGreaterThan(0);
    expect((await test.repos.planDays.list()).filter((d) => d.meals.length > 0)).toHaveLength(
      count,
    );
  });

  it('T3, V39: with no rough guide Fill and Copy are off with the reason and link; under 18 with no link', async () => {
    await open({ weightKg: null, seed: (t) => plan(t, TODAY, 'dinner', R.dinnerA) });
    await show('#/food');
    const card = await weekCard();
    const fill = within(card).getByRole('button', { name: planner.week.fill });
    expect(fill.getAttribute('aria-disabled')).toBe('true');
    fireEvent.click(fill);
    expect(screen.queryByTestId('plan-fillWeek-panel')).toBeNull();
    expect(within(card).getByText(targets.plannerFloor.noGuide)).toBeDefined();
    expect(within(card).getByRole('link', { name: targets.settingsRow.title })).toBeDefined();
    expect(
      within(card).getByRole('button', { name: planner.week.copy }).getAttribute('aria-disabled'),
    ).toBe('true');
    cleanup();
    test.db.shutDown();
    await open({ answers: { q1: 'yes' } });
    await show('#/food');
    const minor = await weekCard();
    expect(within(minor).getByText(planner.week.noFillNoEstimate)).toBeDefined();
    expect(within(minor).queryByRole('link', { name: targets.settingsRow.title })).toBeNull();
  });

  it('P41: the label line shows for an owner who lists an allergen', async () => {
    await open({ profile: { allergens: ['peanut'] } });
    await show('#/food');
    expect(within(await weekCard()).getByText(planner.week.noFillLabels)).toBeDefined();
  });

  it('K13 T25 V40: under answer 5 the figures show no target and the Fill preview names no target', async () => {
    await open({ answers: { q5: 'yes' }, seed: (t) => plan(t, TOMORROW, 'dinner', R.gardenF) });
    await show(`#/plan/${TOMORROW}`);
    const figures = await screen.findByRole('region', { name: planner.figures.label });
    expect(figures.querySelector('svg')).toBeNull();
    expect(figures.textContent).not.toMatch(/ of \d/);
    go('#/food');
    const card = await weekCard();
    fireEvent.click(within(card).getByRole('button', { name: planner.week.fill }));
    const panel = await screen.findByTestId('plan-fillWeek-panel');
    expect(panel.textContent).not.toMatch(/target/i);
  });
});

describe('the Food tab’s reminders and budget (item 22 K9, K11)', () => {
  it('K9 NU-08: the lipid test shows on Food; hiding it there hides it on Today', async () => {
    await open();
    await show('#/food');
    const reminder = await screen.findByTestId('reminder-cholesterol');
    expect(reminder.textContent).toContain('Lipid test');
    const hide = within(reminder).getByRole('button');
    hide.focus();
    fireEvent.click(hide);
    await waitFor(() => {
      expect(screen.queryByTestId('reminder-cholesterol')).toBeNull();
    });
    // Design 2.4: with the last reminder hidden, focus goes on to the week, never the page.
    await waitFor(() => {
      expect(document.activeElement).toBe(screen.getByTestId('plan-week-heading'));
    });
    go('#/today');
    await screen.findByRole('heading', { level: 1, name: 'Today' });
    expect(screen.queryByTestId('reminder-cholesterol')).toBeNull();
  });

  it('K11 HS-16 NN-05: the budget note shows as typed, as the owner’s text; the card shows no price', async () => {
    await open();
    await show('#/food');
    const budget = await screen.findByRole('region', { name: planner.budget.label });
    expect(budget.textContent).toContain(planner.budget.noPrices);
    fireEvent.change(within(budget).getByLabelText(planner.budget.noteLabel), {
      target: { value: '$80 a week' },
    });
    fireEvent.click(within(budget).getByRole('button', { name: planner.budget.save }));
    const own = await within(budget).findByText('Your note: $80 a week');
    // Save is now disabled: focus is on "Saved." rather than the page.
    await waitFor(() => {
      expect(document.activeElement?.textContent).toBe(planner.budget.saved);
    });
    expect(own.hasAttribute('data-owner-text')).toBe(true);
    const outside = [...budget.querySelectorAll('p')].filter(
      (p) => !p.hasAttribute('data-owner-text'),
    );
    expect(outside.map((p) => p.textContent).join(' ')).not.toMatch(/\$/);
    fireEvent.change(within(budget).getByLabelText(planner.budget.noteLabel), {
      target: { value: 'x'.repeat(201) },
    });
    fireEvent.click(within(budget).getByRole('button', { name: planner.budget.save }));
    expect(await within(budget).findByText(planner.budget.tooLong)).toBeDefined();
  });
});

describe('the Fast card reads the plan (item 22 K17; FL-12, C23, V42)', () => {
  it('FL-12: a planned 54 g dinner on a 23:1 day is short on the Fast card, against the Day screen’s target', async () => {
    await open({
      seed: async (t) => {
        await oneMealSchedule(t);
        await plan(t, TODAY, 'dinner', R.gardenF);
      },
    });
    await show('#/today');
    const card = await screen.findByRole('region', { name: fasting.card.label });
    expect(await within(card).findByText("Tonight's dinner carries 54 g protein.")).toBeDefined();
    expect(card.textContent).toContain('One meal needs about 120 g.');
    go(`#/plan/${TODAY}`);
    const window = await screen.findByRole('region', { name: planner.day.windowLabel });
    expect(window.textContent).toContain('One meal needs about 120 g.');
  });

  it('HS-37: a planned dinner whose energy is not known never "comes in under" the energy target', async () => {
    setPlannerData({ loaded: false });
    await open({
      seed: async (t) => {
        await oneMealSchedule(t);
        await plan(t, TODAY, 'dinner', R.gardenF);
      },
    });
    await show('#/today');
    const card = await screen.findByRole('region', { name: fasting.card.label });
    expect(await within(card).findByText(fasting.mealCheck.energyNotKnown)).toBeDefined();
    expect(card.textContent).not.toContain(fasting.mealCheck.energyShort);
    go(`#/plan/${TODAY}`);
    const window = await screen.findByRole('region', { name: planner.day.windowLabel });
    expect(await within(window).findByText(fasting.mealCheck.energyNotKnown)).toBeDefined();
    expect(window.textContent).not.toContain(fasting.mealCheck.energyShort);
  });

  it('a planned meal whose recipe data cannot be loaded reads "protein unknown", never "no meals planned"', async () => {
    await open({
      seed: async (t) => {
        await oneMealSchedule(t);
        await plan(t, TODAY, 'dinner', R.gardenF);
      },
    });
    setPlannerData(null);
    await show('#/today');
    const card = await screen.findByRole('region', { name: fasting.card.label });
    expect(await within(card).findByText("Tonight's dinner: protein unknown.")).toBeDefined();
  });
});

describe('garden first in the picker (item 22 K4; NU-07)', () => {
  it('two ready garden foods put Example garden dinner F first, with its foods and the garden line', async () => {
    await open({
      seed: async (t) => {
        for (const key of ['green-a', 'green-b'])
          await t.repos.garden.create({
            ingredientId: foodId(key),
            name: `Example ${key}`,
            amount: null,
            unit: null,
            gramsPerUnit: null,
            harvestReady: true,
            harvestedAt: null,
            perishabilityDays: null,
          });
      },
    });
    await show(`#/plan/${TOMORROW}`);
    fireEvent.click(
      within(await slotBlock('dinner')).getByRole('button', { name: planner.day.choose }),
    );
    const picker = await screen.findByTestId('meal-picker');
    expect(within(picker).getByText(planner.picker.gardenFirst)).toBeDefined();
    const first = within(picker).getAllByRole('radio')[0];
    expect(first?.closest('label')?.textContent).toContain('Example garden dinner F');
    expect(first?.closest('label')?.textContent).toContain(
      'Uses Example green A and Example green B from your garden',
    );
  });
});
