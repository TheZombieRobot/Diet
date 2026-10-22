import { describe, expect, it } from 'vitest';
import type { EatingWindow } from '../fasting/eatingWindow';
import type { UserAllergen } from '../storage/allergens';
import type { PlanDayRecord, PlannedMealRecord } from '../storage/records';
import type { PlanWriteKind } from '../targets/energy';
import { addDays } from '../util/time';
import { copyWeekProposal } from './copyWeek';
import {
  BUILT_PLAN_WRITE_KINDS,
  checkPlanWrite,
  type PlanMealWrite,
  type PlanWriteContext,
  type PlanWriteRequest,
} from './planWrite';
import { exampleDayContext, fixtureLookup, meal, PLAN_TODAY, R } from './testData';

const SNACK_DINNER: EatingWindow = { start: '17:00', end: '19:00' };
const ONE_MEAL: EatingWindow = { start: '18:00', end: '19:00' };

function context(
  options: {
    readonly allergens?: readonly UserAllergen[];
    readonly glutenFreeHousehold?: boolean;
    readonly dislikeTerms?: readonly string[];
    readonly hidden?: readonly string[];
    readonly window?: EatingWindow | null;
    readonly stored?: Readonly<Record<string, readonly PlannedMealRecord[]>>;
  } = {},
): PlanWriteContext {
  const profile = {
    allergens: [...(options.allergens ?? [])],
    glutenFreeHousehold: options.glutenFreeHousehold ?? false,
    dietMode: 'keto' as const,
  };
  return {
    today: PLAN_TODAY,
    day: (date) =>
      exampleDayContext({
        date,
        window: options.window === undefined ? SNACK_DINNER : options.window,
      }),
    stored: (date): PlanDayRecord | undefined => {
      const meals = options.stored?.[date];
      return meals === undefined
        ? undefined
        : {
            date,
            dietMode: 'keto',
            meals: [...meals],
            eatingWindow: null,
            updatedAt: '2000-01-01T00:00:00.000Z',
          };
    },
    lookup: fixtureLookup({
      allergens: options.allergens ?? [],
      glutenFreeHousehold: options.glutenFreeHousehold ?? false,
      dislikeTerms: options.dislikeTerms ?? [],
      hidden: options.hidden ?? [],
    }),
    profile,
  };
}

const write = (
  slot: PlanMealWrite['slot'],
  recipeId: string,
  myServes = 1,
  householdServes = 1,
  date = PLAN_TODAY,
): PlanMealWrite => ({ date, slot, meal: { recipeId, myServes, householdServes } });

const request = (
  kind: PlanWriteKind,
  writes: readonly PlanMealWrite[],
  extra: Partial<PlanWriteRequest> = {},
): PlanWriteRequest => ({ kind, writes, labelChecked: [], conflictConfirmed: [], ...extra });

const reasonOf = (req: PlanWriteRequest, ctx = context()) => {
  const [day] = checkPlanWrite(req, ctx);
  return day?.status === 'refused' ? day.refusal.reason : day?.status;
};

const adequate = [write('snack', R.snackB), write('dinner', R.dinnerA, 2)];

describe('the one write rule (item 22 S11; HS-10, HS-24, HS-R20, HS-23, C07, V38, V41, V47)', () => {
  it('only built kinds; an owner write is exactly one meal', () => {
    expect(BUILT_PLAN_WRITE_KINDS).toEqual(['owner-meal', 'auto-fill', 'copy']);
    for (const kind of ['template', 'repeat', 'suggested-swap', 'nonsense'] as PlanWriteKind[]) {
      expect(reasonOf(request(kind, adequate))).toBe('kind');
    }
    expect(reasonOf(request('owner-meal', adequate))).toBe('kind');
    expect(reasonOf(request('auto-fill', adequate))).toBe('write');
  });

  it('V41: a past date and a date after the planning range are refused', () => {
    expect(reasonOf(request('owner-meal', [write('dinner', R.dinnerA, 1, 1, '2000-01-04')]))).toBe(
      'past-day',
    );
    expect(reasonOf(request('owner-meal', [write('dinner', R.dinnerA, 1, 1, '2000-01-17')]))).toBe(
      'future-day',
    );
  });

  it('C07: a snack on a one-meal day and a breakfast on a 22:2 day are refused; a missing recipe too', () => {
    expect(
      reasonOf(request('owner-meal', [write('snack', R.snackB)]), context({ window: ONE_MEAL })),
    ).toBe('slot');
    expect(reasonOf(request('owner-meal', [write('breakfast', R.breakfastJ)]))).toBe('slot');
    expect(reasonOf(request('owner-meal', [write('dinner', 'seed:recipe-gone')]))).toBe(
      'recipe-missing',
    );
  });

  it('portions: auto-fill at most 2, the owner and a copy at most 4; app-made writes never replace or remove', () => {
    expect(
      reasonOf(request('auto-fill', [write('snack', R.snackB), write('dinner', R.dinnerA, 2.5)])),
    ).toBe('portion');
    expect(
      reasonOf(request('copy', [write('snack', R.snackB), write('dinner', R.dinnerA, 5)])),
    ).toBe('portion');
    expect(reasonOf(request('owner-meal', [write('dinner', R.dinnerA, 4)]))).toBe('write');
    // Cooking for: a whole number of people from 1 to 50.
    for (const household of [0, 2.5, 51]) {
      expect(reasonOf(request('owner-meal', [write('dinner', R.dinnerA, 1, household)]))).toBe(
        'portion',
      );
    }
    expect(reasonOf(request('owner-meal', [write('dinner', R.dinnerA, 1, 50)]))).toBe('write');
    expect(reasonOf(request('copy', [{ date: PLAN_TODAY, slot: 'dinner', meal: null }]))).toBe(
      'kind',
    );
    const stored = context({ stored: { [PLAN_TODAY]: [meal('dinner', R.gardenF)] } });
    expect(reasonOf(request('auto-fill', adequate), stored)).toBe('replace');
  });

  it('V47: an app-made write of a recipe now hidden or disliked is refused; the owner may still add it', () => {
    expect(reasonOf(request('auto-fill', adequate), context({ hidden: [R.dinnerA] }))).toBe(
      'not-wanted',
    );
    expect(reasonOf(request('copy', adequate), context({ dislikeTerms: ['Example fat'] }))).toBe(
      'not-wanted',
    );
    expect(
      reasonOf(
        request('owner-meal', [write('dinner', R.dinnerA)]),
        context({ hidden: [R.dinnerA] }),
      ),
    ).toBe('write');
  });

  it('HS-24, HS-R20: conflicts and unknown allergens, with and without the confirmations, per kind', () => {
    const fish = context({ allergens: ['fish'] });
    const fishDinner = [write('dinner', R.fishD)];
    expect(reasonOf(request('owner-meal', fishDinner), fish)).toBe('allergen-conflict');
    const confirmed = { conflictConfirmed: [{ recipeId: R.fishD, allergens: ['fish' as const] }] };
    expect(reasonOf(request('owner-meal', fishDinner, confirmed), fish)).toBe('write');
    expect(
      reasonOf(
        request('auto-fill', [write('snack', R.snackB), write('dinner', R.fishD, 2)], confirmed),
        fish,
      ),
    ).toBe('allergen-conflict');
    const peanut = context({ allergens: ['peanut'] });
    const packed = [write('dinner', R.packedG)];
    const checked = { labelChecked: [{ recipeId: R.packedG, allergens: ['peanut' as const] }] };
    expect(reasonOf(request('owner-meal', packed), peanut)).toBe('label-check-needed');
    expect(reasonOf(request('owner-meal', packed, checked), peanut)).toBe('write');
    for (const kind of ['auto-fill', 'copy'] as const) {
      expect(
        reasonOf(
          request(kind, [write('snack', R.snackB), write('dinner', R.packedG, 2)], checked),
          peanut,
        ),
      ).toBe('label-check-needed');
    }
    // V18: the confirmation named peanuts only; fish was listed since.
    const both = context({ allergens: ['peanut', 'fish'] });
    expect(reasonOf(request('owner-meal', packed, checked), both)).toBe('label-check-needed');
  });

  it('FL-07: changing a gluten-cereal dinner from 1 to 3 people in a Gluten-free household is refused', () => {
    const gf = context({ glutenFreeHousehold: true });
    expect(reasonOf(request('owner-meal', [write('dinner', R.wheatE, 1, 1)]), gf)).toBe('write');
    expect(reasonOf(request('owner-meal', [write('dinner', R.wheatE, 1, 3)]), gf)).toBe(
      'allergen-conflict',
    );
  });

  it('HS-10, C108: a complete 4,000 kJ day is refused for auto-fill and copy; the owner’s is written with a note', () => {
    const low = [write('snack', R.snackB), write('dinner', R.gardenF)];
    expect(reasonOf(request('auto-fill', low))).toBe('below-floor');
    expect(reasonOf(request('copy', low))).toBe('below-floor');
    const [owner] = checkPlanWrite(request('owner-meal', [write('dinner', R.gardenF)]), context());
    expect(owner).toMatchObject({
      status: 'write',
      floorNote: { kind: 'below-floor', floorKj: 5000 },
    });
    // The confirmation is never part of the written meals.
    expect(owner?.status === 'write' && Object.keys(owner.meals[0] ?? {})).toEqual([
      'slot',
      'recipeId',
      'myServes',
      'householdServes',
    ]);
  });

  it('V46: stored meals are never re-judged; outside meals are kept and not counted', () => {
    const peanut = context({
      allergens: ['peanut'],
      stored: { [PLAN_TODAY]: [meal('snack', R.packedG)] },
    });
    expect(reasonOf(request('owner-meal', [write('dinner', R.dinnerA)]), peanut)).toBe('write');
    const outside = context({
      window: ONE_MEAL,
      stored: { [PLAN_TODAY]: [meal('snack', R.snackB, 5)] },
    });
    const [day] = checkPlanWrite(request('owner-meal', [write('dinner', R.dinnerA, 2)]), outside);
    expect(day).toMatchObject({ status: 'write', floorNote: null });
    expect(day?.status === 'write' && day.meals.map((m) => m.slot)).toEqual(['snack', 'dinner']);
    // An imported portion of 5, written back unchanged by an owner's change of household only.
    const imported = context({ stored: { [PLAN_TODAY]: [meal('dinner', R.dinnerA, 5)] } });
    expect(reasonOf(request('owner-meal', [write('dinner', R.dinnerA, 5, 2)]), imported)).toBe(
      'write',
    );
    expect(reasonOf(request('owner-meal', [write('dinner', R.dinnerA, 4.5, 2)]), imported)).toBe(
      'portion',
    );
  });

  it('one date’s refusal never blocks another', () => {
    const days = checkPlanWrite(
      request('auto-fill', [
        ...adequate,
        write('snack', R.snackB, 1, 1, '2000-01-06'),
        write('dinner', R.gardenF, 1, 1, '2000-01-06'),
      ]),
      context(),
    );
    expect(days.map((d) => d.status)).toEqual(['write', 'refused']);
  });
});

describe('copy to the following week (item 22 S10; HS-24, HS-R20, HS-10; V9)', () => {
  const source = '2000-01-05';
  const target = addDays(source, 7);
  const copy = (
    sourceMeals: readonly PlannedMealRecord[],
    options: {
      readonly window?: EatingWindow;
      readonly targetMeals?: readonly PlannedMealRecord[];
      readonly allergens?: readonly UserAllergen[];
      readonly hidden?: readonly string[];
      readonly dislikeTerms?: readonly string[];
      readonly date?: string;
    } = {},
  ) =>
    copyWeekProposal({
      days: [
        {
          source,
          target: options.date ?? target,
          sourceMeals,
          targetMeals: options.targetMeals ?? [],
          ctx: exampleDayContext({
            date: options.date ?? target,
            window: options.window ?? SNACK_DINNER,
          }),
        },
      ],
      lookup: fixtureLookup({
        allergens: options.allergens ?? [],
        hidden: options.hidden ?? [],
        dislikeTerms: options.dislikeTerms ?? [],
      }),
      profile: { allergens: [...(options.allergens ?? [])], glutenFreeHousehold: false },
    })[0];
  const week = [meal('snack', R.snackB), meal('dinner', R.dinnerA, 2)];

  it('copies an adequate day into an empty editable day, never over meals or into a past or far date', () => {
    expect(copy(week)).toMatchObject({ status: 'proposed', meals: week, skipped: [] });
    expect(copy(week, { targetMeals: [meal('dinner', R.gardenF)] })).toMatchObject({
      refusal: { reason: 'has-meals' },
    });
    expect(copy(week, { date: '2000-01-04' })).toMatchObject({ refusal: { reason: 'past-day' } });
    expect(copy(week, { date: '2000-01-17' })).toMatchObject({ refusal: { reason: 'future-day' } });
  });

  it('a 22:2 day copied into a 23:1 week skips the snack and judges the dinner alone', () => {
    const day = copy(week, { window: ONE_MEAL });
    expect(day).toMatchObject({ status: 'proposed', skipped: [{ slot: 'snack', why: 'slot' }] });
    expect(
      copy([meal('snack', R.snackB), meal('dinner', R.gardenF, 2)], { window: ONE_MEAL }),
    ).toMatchObject({
      status: 'refused',
      refusal: { reason: 'below-floor' },
    });
  });

  it('hidden and disliked recipes are skipped; a portion of 5 is refused', () => {
    expect(copy(week, { hidden: [R.snackB] })).toMatchObject({
      skipped: [{ slot: 'snack', why: 'not-wanted' }],
    });
    expect(copy(week, { dislikeTerms: ['Example fat'] })).toEqual({
      date: target,
      status: 'nothing-to-copy',
      skipped: [
        { slot: 'snack', recipeId: R.snackB, why: 'not-wanted' },
        { slot: 'dinner', recipeId: R.dinnerA, why: 'not-wanted' },
      ],
    });
    expect(copy([meal('dinner', R.dinnerA, 5)])).toMatchObject({ refusal: { reason: 'portion' } });
  });

  it('item 20 step 3: fish added after planning fish dinners refuses the copy; P41: a label check never carries over', () => {
    expect(copy([meal('dinner', R.fishD, 2)], { allergens: ['fish'] })).toMatchObject({
      refusal: { reason: 'allergen-conflict', conflicts: ['fish'] },
    });
    expect(copy([meal('dinner', R.packedG, 2)], { allergens: ['peanut'] })).toMatchObject({
      refusal: { reason: 'label-check-needed' },
    });
  });
});
