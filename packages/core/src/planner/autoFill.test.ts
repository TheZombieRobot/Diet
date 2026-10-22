import { describe, expect, it } from 'vitest';
import { blockedAllergens, type MealSharing } from '../recipes/allergens';
import type { EatingWindow } from '../fasting/eatingWindow';
import type { PlannedMealRecord } from '../storage/records';
import type { DayTargets } from '../targets/dayTargets';
import { addDays } from '../util/time';
import { type AutoFillDay, type AutoFillInput, autoFillWeek } from './autoFill';
import type { PlanRecipeLookup } from './context';
import { type PlanCandidate, suggestionsFor } from './rank';
import {
  exampleDayContext,
  exampleDayTargets,
  fixtureLookup,
  meal,
  PLAN_TODAY,
  R,
} from './testData';

const ONE_MEAL: EatingWindow = { start: '18:00', end: '19:00' };
const SNACK_DINNER: EatingWindow = { start: '17:00', end: '19:00' };

interface Setup {
  readonly days?: number;
  readonly window?: EatingWindow | null;
  readonly targets?: DayTargets;
  readonly stored?: Readonly<Record<string, readonly PlannedMealRecord[]>>;
  readonly lookup?: PlanRecipeLookup;
  readonly allergens?: readonly ('peanut' | 'fish')[];
  readonly refluxDay?: boolean;
  readonly order?: (ids: readonly string[]) => readonly string[];
  readonly firstWeek?: AutoFillInput['firstWeek'];
  readonly eggs?: number;
  readonly dayBefore?: readonly PlannedMealRecord[];
  readonly eggsPerServe?: Readonly<Record<string, number>>;
}

/** An auto-fill input over the fixture, built the way the Meal plan card builds it. */
function input(setup: Setup = {}): AutoFillInput {
  const lookup = setup.lookup ?? fixtureLookup({ allergens: setup.allergens ?? [] });
  const profile = { allergens: [...(setup.allergens ?? [])], glutenFreeHousehold: false };
  const dates = Array.from({ length: setup.days ?? 1 }, (_, i) => addDays(PLAN_TODAY, i));
  return {
    days: dates.map((date) => {
      const ctx = exampleDayContext({
        date,
        window: setup.window === undefined ? SNACK_DINNER : setup.window,
        targets: setup.targets ?? exampleDayTargets('kickstart'),
        refluxDay: setup.refluxDay ?? false,
      });
      return {
        ctx,
        stored: setup.stored?.[date] ?? [],
        candidates: (slot, sharing: MealSharing) => {
          const ok = suggestionsFor({
            slot,
            day: ctx.slots,
            views: lookup.listed(),
            blocked: blockedAllergens(profile, sharing),
            blockedOwn: blockedAllergens(profile, 'own'),
            hiddenSeedIds: new Set(),
            ceiling: ctx.targets.netCarbs,
            stock: { ready: new Set(), daysLeft: new Map() },
            seasonOf: () => [],
            month: 1,
            firstWeek: false,
          }).ok;
          if (setup.order === undefined) return ok;
          const order = setup.order(ok.map((c) => c.view.id));
          return order.flatMap((id) => ok.filter((c) => c.view.id === id));
        },
      };
    }),
    householdSize: 1,
    firstWeek: setup.firstWeek ?? null,
    eggsAlreadyPlanned: setup.eggs ?? 0,
    dayBefore: setup.dayBefore ?? [],
    facts: (id) => {
      const view = lookup.viewOf(id);
      const checks = lookup.checksOf(id);
      return view === null || checks === null
        ? null
        : {
            checks,
            oneMealOk: view.oneMealOk,
            usesLeftoversFrom: view.usesLeftoversFrom?.id ?? null,
            eggsPerServe: setup.eggsPerServe?.[id] ?? view.eggsPerServe,
            title: view.title,
          };
    },
    lookup,
  };
}

const dinnerOf = (day: AutoFillDay | undefined): string | undefined =>
  day?.status === 'proposed' ? day.meals.find((m) => m.slot === 'dinner')?.recipeId : undefined;

const proposed = (day: AutoFillDay | undefined) =>
  day?.status === 'proposed' ? day.meals.map((m) => [m.slot, m.recipeId, m.myServes]) : day;

describe('auto-fill (item 22 S9; HS-10, HS-25, NU-06, NU-07, P41, P43, V43, V44)', () => {
  it('a 22:2 Kickstart day gets snack B and dinner A raised to 2 serves, the same every time', () => {
    const first = autoFillWeek(input({ order: (ids) => [R.dinnerA, ...ids] }));
    expect(proposed(first[0])).toEqual([
      ['snack', R.snackB, 1],
      ['dinner', R.dinnerA, 2],
    ]);
    expect(autoFillWeek(input({ order: (ids) => [R.dinnerA, ...ids] }))).toEqual(first);
  });

  it('V43: on a 23:1 day a light first-ranked dinner gives way to the next that makes the day adequate', () => {
    const days = autoFillWeek(
      input({
        window: ONE_MEAL,
        order: (ids) => [R.lightM, ...ids.filter((id) => id !== R.lightM)],
      }),
    );
    expect(proposed(days[0])).toEqual([['dinner', R.dinnerA, 2]]);
  });

  it('P43: portions rise by halves to at most 2 serves; when none passes, the first combination’s reason shows', () => {
    const days = autoFillWeek(input({ window: ONE_MEAL, order: () => [R.lightM, R.gardenF] }));
    expect(days[0]).toMatchObject({ status: 'refused', refusal: { reason: 'below-floor' } });
    const big = autoFillWeek(
      input({
        window: ONE_MEAL,
        order: () => [R.bigH],
        targets: exampleDayTargets('kickstart', { targetKj: 6000 }),
      }),
    );
    expect(big[0]).toMatchObject({ refusal: { reason: 'one-meal-short', reasons: ['portion'] } });
  });

  it('only empty planned slots are filled: never an optional slot, never a stored meal replaced', () => {
    const stored = {
      [PLAN_TODAY]: [meal('dinner', R.dinnerA, 2), meal('breakfast', R.breakfastJ)],
    };
    const ordinary = autoFillWeek(
      input({ window: null, stored, targets: exampleDayTargets('steady') }),
    );
    expect(proposed(ordinary[0])).toEqual([['lunch', R.lunchK, 1]]);
    const full = autoFillWeek(
      input({ stored: { [PLAN_TODAY]: [meal('snack', R.snackB), meal('dinner', R.dinnerA, 2)] } }),
    );
    expect(full[0]).toEqual({ date: PLAN_TODAY, status: 'nothing-to-fill' });
  });

  it('V16: not the same dinner two days running when another fits; eggs held to six when possible', () => {
    const order = (ids: readonly string[]) => [R.dinnerA, R.bigH, ...ids];
    const fresh = autoFillWeek(input({ order }));
    expect(dinnerOf(fresh[0])).toBe(R.dinnerA);
    const after = autoFillWeek(
      input({ order, dayBefore: [meal('snack', R.lunchK), meal('dinner', R.dinnerA)] }),
    );
    expect(dinnerOf(after[0])).toBe(R.bigH);
    // Only A fits: the preference is dropped rather than leaving the day empty.
    const only = autoFillWeek(
      input({
        order: (ids) => (ids.includes(R.dinnerA) ? [R.dinnerA] : ids),
        dayBefore: [meal('snack', R.lunchK), meal('dinner', R.dinnerA)],
      }),
    );
    expect(dinnerOf(only[0])).toBe(R.dinnerA);
    const eggs = autoFillWeek(input({ order, eggs: 3, eggsPerServe: { [R.dinnerA]: 2 } }));
    expect(dinnerOf(eggs[0])).toBe(R.bigH);
  });

  it('V44: after a reflux symptom a one-meal day is never raised above one serve', () => {
    const days = autoFillWeek(input({ window: ONE_MEAL, refluxDay: true }));
    expect(days[0]).toMatchObject({ status: 'refused', refusal: { reason: 'one-meal-reflux' } });
  });

  it('HS-R18: before food figures are loaded every day is refused energy-not-known, nothing proposed', () => {
    const days = autoFillWeek(input({ days: 5, lookup: fixtureLookup({ loaded: false }) }));
    expect(days).toHaveLength(5);
    for (const day of days) {
      expect(day).toMatchObject({ status: 'refused', refusal: { reason: 'energy-not-known' } });
    }
  });

  it('T3, V39: no rough guide refuses every day no-guide; under 18 no-estimate', () => {
    const noGuide = autoFillWeek(
      input({ days: 2, targets: exampleDayTargets('steady', { energy: 'needs-guide' }) }),
    );
    expect(noGuide.map((d) => d.status === 'refused' && d.refusal.reason)).toEqual([
      'no-guide',
      'no-guide',
    ]);
    const minor = autoFillWeek(
      input({ targets: exampleDayTargets('steady', { energy: 'not-estimated' }) }),
    );
    expect(minor[0]).toMatchObject({ refusal: { reason: 'no-estimate' } });
  });

  it('P41: a recipe whose allergens are not fully known is never proposed, even ranked first', () => {
    const days = autoFillWeek(
      input({ window: ONE_MEAL, allergens: ['peanut'], order: (ids) => [R.packedG, ...ids] }),
    );
    expect(proposed(days[0])).toEqual([['dinner', R.dinnerA, 2]]);
  });

  it('first planned week: the keto week’s dinner of that day is tried first', () => {
    const order = (ids: readonly string[]) => [R.bigH, R.dinnerA, ...ids];
    expect(dinnerOf(autoFillWeek(input({ order }))[0])).toBe(R.bigH);
    const days = autoFillWeek(
      input({ days: 2, order, firstWeek: { dinners: [R.dinnerA, R.bigH], snacks: [] } }),
    );
    expect(days.map((d) => dinnerOf(d))).toEqual([R.dinnerA, R.bigH]);
  });

  it('bounded: 60 candidates a slot over a week, every combination failing, finish quickly', () => {
    // An unreachable aim makes every combination fail, so both passes run in full.
    const base = input({
      days: 7,
      window: null,
      targets: exampleDayTargets('steady', { targetKj: 90000 }),
    });
    const many: AutoFillInput = {
      ...base,
      days: base.days.map((d) => ({
        ...d,
        candidates: (slot, sharing) => {
          const list = d.candidates(slot, sharing);
          return list.length === 0
            ? []
            : Array.from({ length: 60 }, (_, i) => list[i % list.length] as PlanCandidate);
        },
      })),
    };
    const start = performance.now();
    const days = autoFillWeek(many);
    expect(days.every((d) => d.status === 'refused')).toBe(true);
    // A guard against an unbounded search, not a target (the design's 200 ms, with room for a
    // loaded machine).
    expect(performance.now() - start).toBeLessThan(500);
  });
});
