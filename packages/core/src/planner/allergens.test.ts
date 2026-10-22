import { describe, expect, it } from 'vitest';
import { blockedAllergens, type Serving, servingFor } from '../recipes/allergens';
import type { Allergen } from '../storage/allergens';
import type { PlanWriteKind } from '../targets/energy';
import { mealSharing, planAllergenDecision } from './allergens';
import { budgetFacts, BUDGET_NOTE_MAX_CHARS, parseBudgetNote } from './budget';
import { labelCheckView } from './labelCheck';
import { portionText } from './portion';
import { fixtureLookup, R } from './testData';

const KINDS: readonly PlanWriteKind[] = [
  'owner-meal',
  'auto-fill',
  'copy',
  'template',
  'repeat',
  'suggested-swap',
];

const decide = (
  kind: PlanWriteKind,
  serving: Serving,
  confirmed: readonly Allergen[] | null,
  blocked: readonly Allergen[] = ['peanut'],
  conflicts: readonly Allergen[] = serving === 'conflict' ? ['peanut'] : [],
) =>
  planAllergenDecision({
    kind,
    blocked,
    serving: { serving, conflicts },
    allergensUnknown: serving === 'unknown',
    recipeId: 'r',
    labelChecked: confirmed === null ? [] : [{ recipeId: 'r', allergens: confirmed }],
    conflictConfirmed: confirmed === null ? [] : [{ recipeId: 'r', allergens: confirmed }],
  }).allowed;

describe('the allergen decision per write (item 22 S7; HS-24, HS-R20, C43, C107, FL-07, P41)', () => {
  it('the 6 kinds × 3 servings matrix, with and without the confirmation', () => {
    for (const kind of KINDS) {
      expect(decide(kind, 'ok', null), kind).toBe(true);
      expect(decide(kind, 'conflict', null), kind).toBe(false);
      expect(decide(kind, 'unknown', null), kind).toBe(false);
      expect(decide(kind, 'conflict', ['peanut']), kind).toBe(kind === 'owner-meal');
      expect(decide(kind, 'unknown', ['peanut']), kind).toBe(
        kind === 'owner-meal' || kind === 'suggested-swap',
      );
    }
  });

  it('V18: a confirmation covers only what it named', () => {
    expect(decide('owner-meal', 'unknown', ['peanut'], ['fish', 'peanut'])).toBe(false);
    expect(decide('owner-meal', 'conflict', ['fish'], ['fish', 'wheat'], ['fish', 'wheat'])).toBe(
      false,
    );
    expect(
      decide('owner-meal', 'conflict', ['fish', 'wheat'], ['fish', 'wheat'], ['fish', 'wheat']),
    ).toBe(true);
  });

  it('V18, item 20 review: a conflict never hides the label check; a confirmation is for its recipe only', () => {
    const conflictNotFullyKnown = (confirmed: readonly Allergen[], recipeId = 'r') =>
      planAllergenDecision({
        kind: 'owner-meal',
        blocked: ['fish', 'peanut'],
        serving: { serving: 'conflict', conflicts: ['fish'] },
        allergensUnknown: true,
        recipeId: 'r',
        labelChecked: [],
        conflictConfirmed: [{ recipeId, allergens: confirmed }],
      }).allowed;
    expect(conflictNotFullyKnown(['fish'])).toBe(false);
    expect(conflictNotFullyKnown(['fish', 'peanut'])).toBe(true);
    expect(conflictNotFullyKnown(['fish', 'peanut'], 'other')).toBe(false);
  });

  it('FL-07: in a Gluten-free household a shared wheat recipe is a conflict and the owner’s own meal is ok', () => {
    const lookup = fixtureLookup();
    const facts = lookup.viewOf(R.wheatE)?.allergens.facts;
    if (facts === undefined) throw new Error('fixture');
    const profile = { allergens: [], glutenFreeHousehold: true };
    expect(mealSharing(3)).toBe('shared');
    expect(mealSharing(2)).toBe('shared');
    expect(mealSharing(1)).toBe('own');
    expect(servingFor(blockedAllergens(profile, mealSharing(3)), facts).serving).toBe('conflict');
    expect(servingFor(blockedAllergens(profile, mealSharing(1)), facts).serving).toBe('ok');
    const packed = lookup.viewOf(R.packedG)?.allergens.facts;
    if (packed === undefined) throw new Error('fixture');
    expect(servingFor(blockedAllergens(profile, 'shared'), packed).serving).toBe('unknown');
  });
});

describe('label check, portion words and the budget card (item 22 S12; P41, C33, V20)', () => {
  it('the label check names the blocked allergens and the lines to check, once each', () => {
    const view = fixtureLookup().viewOf(R.packedG);
    if (view === null) throw new Error('fixture');
    expect(labelCheckView(view, ['peanut'])).toEqual({
      allergens: ['peanut'],
      lineNames: ['Example packed food'],
    });
    const twice = { ...view, allergens: { ...view.allergens, checkLabelLines: [1, 1] } };
    expect(labelCheckView(twice, ['wheat', 'barley']).lineNames).toEqual(['Example packed food']);
    expect(labelCheckView(twice, ['wheat', 'barley']).allergens).toEqual(['wheat', 'barley']);
  });

  it('portions read as half a serve, one serve or a number of serves', () => {
    expect([0.5, 1, 1.5, 2].map(portionText)).toEqual([
      { kind: 'half' },
      { kind: 'one' },
      { kind: 'many', serves: '1.5' },
      { kind: 'many', serves: '2' },
    ]);
  });

  it('the budget note is kept as typed up to 200 characters and never read for an amount', () => {
    expect(BUDGET_NOTE_MAX_CHARS).toBe(200);
    expect(parseBudgetNote('  $80 a week\nmostly veg ')).toEqual({
      ok: true,
      value: '$80 a week mostly veg',
    });
    expect(parseBudgetNote('   ')).toEqual({ ok: true, value: null });
    expect(parseBudgetNote('x'.repeat(200)).ok).toBe(true);
    expect(parseBudgetNote('x'.repeat(201))).toEqual({ ok: false, error: 'too-long' });
    const lookup = fixtureLookup();
    expect(
      budgetFacts({
        meals: [{ recipeId: R.gardenF }, { recipeId: R.dinnerA }, { recipeId: 'seed:recipe-gone' }],
        view: lookup.viewOf,
        ready: new Set(['seed:example-plan-green-a']),
      }),
    ).toEqual({ gardenMeals: 1, leftoverMeals: 0 });
  });
});
