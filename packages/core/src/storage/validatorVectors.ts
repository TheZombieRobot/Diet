/**
 * Validator vectors (section 9.2; tests review): rows on the edges of the rules inside one record
 * and of the format predicates, with the outcome each version's validators give them. The spec
 * fingerprint describes rules only by id and parameters, so a change inside a rule's body (how
 * "the label applies" is judged, which characters a note may hold) would otherwise pass every
 * test. GOLDEN_VECTORS[n].validator pins these outcomes; a behaviour change fails the test until a
 * new schema version is added. Pure data: computed by computeValidatorVectors (validate.ts).
 * Every value is synthetic.
 */

export type VectorOutcome = 'ok' | { readonly field: string; readonly rule: string };

export interface ValidatorVector {
  readonly name: string;
  readonly table: string;
  readonly row: unknown;
  readonly output: VectorOutcome;
}

const ID = '00000000-0000-4000-8000-000000000a01';
const AT = '2000-01-02T03:04:05.006Z';

/** A drinks_log row (section 4.10) for a measure, a label and the figures the writer stored. */
function drink(
  measure: { volumeMl: number; abvPercent: number },
  label: {
    volumeMl: number;
    abvPercent: number;
    standardDrinks: number | null;
    kcal: number | null;
  },
  stored: { stdSource: 'label' | 'calculated'; std: number; kcal: number | null },
): unknown {
  return {
    id: ID,
    at: AT,
    timeZone: 'UTC',
    beverageId: null,
    name: 'Example drink',
    count: 1,
    beverage: {
      volumeMl: measure.volumeMl,
      abvPercent: measure.abvPercent,
      label: {
        volumeMl: label.volumeMl,
        abvPercent: label.abvPercent,
        standardDrinks: label.standardDrinks,
        kcal: label.kcal,
        energyAsEntered: label.kcal === null ? null : { value: label.kcal, unit: 'kcal' },
        origin: 'owner',
      },
    },
    stdDrinksPerServe: stored.std,
    stdSource: stored.stdSource,
    kcalPerServe: stored.kcal,
  };
}

const LABEL = { volumeMl: 330, abvPercent: 5, standardDrinks: 1.3, kcal: 94 };
/** As written while the label applies: its own figures. */
const FROM_LABEL = { stdSource: 'label', std: 1.3, kcal: 94 } as const;
/** As written once the measure was edited: calculated, kcal unknown. */
const CALCULATED = { stdSource: 'calculated', std: 1.25, kcal: null } as const;

function weight(patch: Record<string, unknown>): unknown {
  return {
    id: ID,
    at: AT,
    timeZone: 'Pacific/Auckland',
    kg: 80,
    source: 'manual',
    note: null,
    ...patch,
  };
}

function steps(date: string): unknown {
  return { date, steps: 1000, source: 'manual', updatedAt: AT };
}

function card(cardId: string, trigger: string, patch: Record<string, unknown>): unknown {
  return {
    cardId,
    trigger,
    firstShownAt: AT,
    dismissedAt: null,
    dismissedTimeZone: null,
    doneAt: null,
    ...patch,
  };
}

function fast(patch: Record<string, unknown>): unknown {
  return {
    id: ID,
    startedAt: AT,
    timeZone: 'UTC',
    endedAt: null,
    endedTimeZone: null,
    plannedFastMinutes: null,
    snackTime: null,
    dinnerTime: null,
    note: null,
    ...patch,
  };
}

const vector = (
  name: string,
  table: string,
  row: unknown,
  output: VectorOutcome,
): ValidatorVector => ({ name, table, row, output });

const fails = (field: string, rule: string): VectorOutcome => ({ field, rule });

/**
 * Version 1 (frozen with it). Built by a function called once, marked pure, so the app's bundle,
 * which never reads these rows, leaves them out (full review F44); the tests read them as before.
 */
export const VALIDATOR_VECTORS_V1: readonly ValidatorVector[] =
  /* @__PURE__ */ validatorVectorsV1();

function validatorVectorsV1(): readonly ValidatorVector[] {
  return Object.freeze([
    // The drinks label applies only to exactly the measure it was read for (C92, AL-02).
    vector(
      'label read for this measure',
      'drinks_log',
      drink({ volumeMl: 330, abvPercent: 5 }, LABEL, FROM_LABEL),
      'ok',
    ),
    vector(
      'ABV 4.9 with a label read at 5, written from the label',
      'drinks_log',
      drink({ volumeMl: 330, abvPercent: 4.9 }, LABEL, FROM_LABEL),
      fails('stdSource', 'equals'),
    ),
    vector(
      'ABV 5.1 with a label read at 5, written from the label',
      'drinks_log',
      drink({ volumeMl: 330, abvPercent: 5.1 }, LABEL, FROM_LABEL),
      fails('stdSource', 'equals'),
    ),
    vector(
      '329 mL with a label read at 330, written from the label',
      'drinks_log',
      drink({ volumeMl: 329, abvPercent: 5 }, LABEL, FROM_LABEL),
      fails('stdSource', 'equals'),
    ),
    vector(
      '331 mL with a label read at 330, written from the label',
      'drinks_log',
      drink({ volumeMl: 331, abvPercent: 5 }, LABEL, FROM_LABEL),
      fails('stdSource', 'equals'),
    ),
    vector(
      'ABV 4.9 with a label read at 5, calculated with energy unknown',
      'drinks_log',
      drink({ volumeMl: 330, abvPercent: 4.9 }, LABEL, CALCULATED),
      'ok',
    ),
    vector(
      'ABV 5.1 with a label read at 5, calculated with energy unknown',
      'drinks_log',
      drink({ volumeMl: 330, abvPercent: 5.1 }, LABEL, CALCULATED),
      'ok',
    ),
    vector(
      'the label applies but the row says calculated',
      'drinks_log',
      drink({ volumeMl: 330, abvPercent: 5 }, LABEL, CALCULATED),
      fails('stdSource', 'equals'),
    ),
    vector(
      'energy kept from a label that no longer applies',
      'drinks_log',
      drink({ volumeMl: 330, abvPercent: 4.9 }, LABEL, {
        stdSource: 'calculated',
        std: 1.25,
        kcal: 94,
      }),
      fails('kcalPerServe', 'equals'),
    ),
    vector(
      'a label figure that is not the stored one',
      'drinks_log',
      drink({ volumeMl: 330, abvPercent: 5 }, LABEL, { stdSource: 'label', std: 1.31, kcal: 94 }),
      fails('stdDrinksPerServe', 'equals'),
    ),
    // Notes: a line break is allowed; a tab, a carriage return and DEL are not (section 2.2).
    vector('a note with a line break', 'weights', weight({ note: 'Example\nnote' }), 'ok'),
    vector(
      'a note with a tab',
      'weights',
      weight({ note: 'Example\tnote' }),
      fails('note', 'format'),
    ),
    vector(
      'a note with a carriage return',
      'weights',
      weight({ note: 'Example\rnote' }),
      fails('note', 'format'),
    ),
    vector(
      'a note with DEL',
      'weights',
      weight({ note: 'Example\u007fnote' }),
      fails('note', 'format'),
    ),
    vector(
      'a note with U+0000',
      'weights',
      weight({ note: 'Example\u0000note' }),
      fails('note', 'format'),
    ),
    vector(
      'a note with a trailing space',
      'weights',
      weight({ note: 'Example note ' }),
      fails('note', 'format'),
    ),
    vector('a note of 280 characters', 'weights', weight({ note: 'n'.repeat(280) }), 'ok'),
    vector(
      'a note of 281 characters',
      'weights',
      weight({ note: 'n'.repeat(281) }),
      fails('note', 'length'),
    ),
    // Text: one line, no control character.
    vector(
      'a name with a tab',
      'drinks_log',
      {
        ...(drink({ volumeMl: 330, abvPercent: 5 }, LABEL, FROM_LABEL) as object),
        name: 'Example\tdrink',
      },
      fails('name', 'format'),
    ),
    vector(
      'a name with a line break',
      'drinks_log',
      {
        ...(drink({ volumeMl: 330, abvPercent: 5 }, LABEL, FROM_LABEL) as object),
        name: 'Example\ndrink',
      },
      fails('name', 'format'),
    ),
    // Instants: canonical, from 2000 up to (not including) 2100.
    vector(
      'an instant just before 2000',
      'weights',
      weight({ at: '1999-12-31T23:59:59.999Z' }),
      fails('at', 'format'),
    ),
    vector(
      'the first instant of 2000',
      'weights',
      weight({ at: '2000-01-01T00:00:00.000Z' }),
      'ok',
    ),
    vector(
      'the last instant before 2100',
      'weights',
      weight({ at: '2099-12-31T23:59:59.999Z' }),
      'ok',
    ),
    vector(
      'the first instant of 2100',
      'weights',
      weight({ at: '2100-01-01T00:00:00.000Z' }),
      fails('at', 'format'),
    ),
    vector(
      'an instant with no milliseconds',
      'weights',
      weight({ at: '2000-01-02T03:04:05Z' }),
      fails('at', 'format'),
    ),
    vector(
      'an instant with an offset',
      'weights',
      weight({ at: '2000-01-02T03:04:05.006+00:00' }),
      fails('at', 'format'),
    ),
    vector(
      'an instant that rolls over (30 February)',
      'weights',
      weight({ at: '2000-02-30T00:00:00.000Z' }),
      fails('at', 'format'),
    ),
    // Local dates: real calendar dates in 2000–2099.
    vector('the last local date', 'steps_log', steps('2099-12-31'), 'ok'),
    vector('a local date in 2100', 'steps_log', steps('2100-01-01'), fails('date', 'format')),
    vector('a local date in 1999', 'steps_log', steps('1999-12-31'), fails('date', 'format')),
    vector('29 February in a leap year', 'steps_log', steps('2000-02-29'), 'ok'),
    vector(
      '29 February in another year',
      'steps_log',
      steps('2001-02-29'),
      fails('date', 'format'),
    ),
    // Time zones: syntax only, never Etc/Unknown.
    vector(
      'a zone with three parts',
      'weights',
      weight({ timeZone: 'America/Argentina/Buenos_Aires' }),
      'ok',
    ),
    vector(
      'a zone this browser may not know',
      'weights',
      weight({ timeZone: 'Example/Nowhere' }),
      'ok',
    ),
    vector(
      'Etc/Unknown',
      'weights',
      weight({ timeZone: 'Etc/Unknown' }),
      fails('timeZone', 'format'),
    ),
    vector(
      'a zone with a space',
      'weights',
      weight({ timeZone: 'Pacific/Example Zone' }),
      fails('timeZone', 'format'),
    ),
    vector(
      'a zone of 65 characters',
      'weights',
      weight({ timeZone: `A/${'b'.repeat(63)}` }),
      fails('timeZone', 'format'),
    ),
    // Ids: lowercase UUID v4.
    vector('an upper-case id', 'weights', weight({ id: ID.toUpperCase() }), fails('id', 'format')),
    vector(
      'a version-1 UUID',
      'weights',
      weight({ id: '00000000-0000-1000-8000-000000000a01' }),
      fails('id', 'format'),
    ),
    vector(
      'a UUID with variant c',
      'weights',
      weight({ id: '00000000-0000-4000-c000-000000000a01' }),
      fails('id', 'format'),
    ),
    // Numbers: -0 is never stored; ranges are inclusive.
    vector('a weight of -0', 'weights', weight({ kg: -0 }), fails('kg', 'range')),
    vector('a weight of 20', 'weights', weight({ kg: 20 }), 'ok'),
    vector('a weight just under 20', 'weights', weight({ kg: 19.99 }), fails('kg', 'range')),
    vector('a weight of 400', 'weights', weight({ kg: 400 }), 'ok'),
    vector('a weight just over 400', 'weights', weight({ kg: 400.01 }), fails('kg', 'range')),
    // Fasts: the end and its zone together, strictly after the start.
    vector(
      'a fast that ends when it starts',
      'fasts',
      fast({ endedAt: AT, endedTimeZone: 'UTC' }),
      fails('endedAt', 'order'),
    ),
    vector(
      'a fast ended a millisecond later',
      'fasts',
      fast({ endedAt: '2000-01-02T03:04:05.007Z', endedTimeZone: 'UTC' }),
      'ok',
    ),
    vector(
      'a fast ended with no zone',
      'fasts',
      fast({ endedAt: '2000-01-02T03:04:05.007Z' }),
      fails('endedTimeZone', 'iff'),
    ),
    // Card state: only a final card can be done (C46); a registered trigger; a zone with a dismissal.
    vector(
      'the rapid-loss card done',
      'card_state',
      card('rapid-loss', 'steady', { doneAt: AT }),
      fails('doneAt', 'iff'),
    ),
    vector(
      'the alcohol help card done',
      'card_state',
      card('alcohol-help', 'readiness-q7', { doneAt: AT }),
      fails('doneAt', 'iff'),
    ),
    vector(
      'the fluctuation explainer done',
      'card_state',
      card('weight-fluctuation-explainer', 'once', { doneAt: AT }),
      'ok',
    ),
    vector(
      'a dismissal with its zone',
      'card_state',
      card('rapid-loss', 'steady', { dismissedAt: AT, dismissedTimeZone: 'Pacific/Auckland' }),
      'ok',
    ),
    vector(
      'a dismissal with no zone',
      'card_state',
      card('rapid-loss', 'steady', { dismissedAt: AT }),
      fails('dismissedTimeZone', 'iff'),
    ),
    vector(
      'a trigger the card does not have',
      'card_state',
      card('rapid-loss', 'weekly', {}),
      fails('trigger', 'pattern'),
    ),
    vector(
      'an update notice for version 1',
      'card_state',
      card('update-notice', 'v1', {}),
      fails('trigger', 'pattern'),
    ),
  ]);
}

const ZERO = {
  energyKj: 0,
  proteinG: 0,
  fatG: 0,
  saturatedFatG: 0,
  carbsG: 0,
  sugarsG: 0,
  fibreG: 0,
  sodiumMg: 0,
};
const ALL_EIGHT = [
  'energyKj',
  'proteinG',
  'fatG',
  'saturatedFatG',
  'carbsG',
  'sugarsG',
  'fibreG',
  'sodiumMg',
];

/** A food_log row (section 4.7): a plan row listing all eight unknown, unless patched. */
function foodEntry(patch: Record<string, unknown>): unknown {
  return {
    id: ID,
    at: AT,
    timeZone: 'Pacific/Auckland',
    sourceKind: 'plan',
    refId: '2000-01-02#dinner',
    name: 'Example traybake',
    grams: null,
    weightBasis: null,
    servings: 1,
    nutrients: ZERO,
    unknownNutrients: ALL_EIGHT,
    confidence: 'estimate',
    ...patch,
  };
}

/** An owner's recipe copy (section 4.7) whose one line has no figures. */
function recipeCopy(unknownNutrients: readonly string[]): unknown {
  return {
    id: ID,
    title: 'Example traybake',
    serves: 4,
    timeMinutes: null,
    lines: [{ ingredientId: 'seed:example-food', rawG: 100, cookedG: null, displayAs: null }],
    method: [],
    tags: [],
    allergens: [],
    derivedFromRecipeId: 'seed:recipe-example',
    nutritionPerServe: ZERO,
    unknownNutrients,
    confidence: 'estimate',
    sourceMix: { label: 0, 'nz-fcdb': 0, usda: 0, estimate: 1 },
    createdAt: AT,
    updatedAt: AT,
  };
}

/**
 * Version 2 (item 23; item 18–20 contract 8): version 1's vectors, each with the same outcome,
 * plus the widened unknown-figures rule on its edges. Version 1 has no food_log or recipes
 * vector, so no version-1 outcome changes.
 */
export const VALIDATOR_VECTORS_V2: readonly ValidatorVector[] =
  /* @__PURE__ */ validatorVectorsV2();

function validatorVectorsV2(): readonly ValidatorVector[] {
  const label = { sourceKind: 'label', refId: ID, grams: 150, weightBasis: 'as-sold' };
  return Object.freeze([
    ...VALIDATOR_VECTORS_V1,
    vector('a plan row with all eight unknown, all 0', 'food_log', foodEntry({}), 'ok'),
    vector(
      'a recipe row with all eight unknown, some lower bounds above 0',
      'food_log',
      foodEntry({
        sourceKind: 'recipe',
        refId: 'seed:recipe-example',
        servings: 1.5,
        nutrients: { ...ZERO, proteinG: 12, energyKj: 900 },
      }),
      'ok',
    ),
    vector(
      'a label row with fibre unknown and 0',
      'food_log',
      foodEntry({ ...label, unknownNutrients: ['fibreG'], confidence: 'label' }),
      'ok',
    ),
    vector(
      'a label row with all eight unknown',
      'food_log',
      foodEntry({ ...label, confidence: 'label' }),
      fails('unknownNutrients', 'equals'),
    ),
    vector(
      'a label row with protein unknown',
      'food_log',
      foodEntry({ ...label, unknownNutrients: ['proteinG'], confidence: 'label' }),
      fails('unknownNutrients', 'equals'),
    ),
    vector(
      'an estimate row with all eight unknown',
      'food_log',
      foodEntry({ sourceKind: 'estimate', refId: null }),
      fails('unknownNutrients', 'length'),
    ),
    vector(
      'an estimate row with seven unknown',
      'food_log',
      foodEntry({ sourceKind: 'estimate', refId: null, unknownNutrients: ALL_EIGHT.slice(1) }),
      'ok',
    ),
    vector(
      'a label row with fibre unknown but stored as 2',
      'food_log',
      foodEntry({
        ...label,
        nutrients: { ...ZERO, fibreG: 2 },
        unknownNutrients: ['fibreG'],
        confidence: 'label',
      }),
      fails('nutrients.fibreG', 'equals'),
    ),
    vector(
      'a recipe row with confidence label',
      'food_log',
      foodEntry({ sourceKind: 'recipe', refId: 'seed:recipe-example', confidence: 'label' }),
      fails('confidence', 'equals'),
    ),
    vector(
      'a plan ref on a date that does not exist',
      'food_log',
      foodEntry({ refId: '2001-02-29#dinner' }),
      fails('refId', 'pattern'),
    ),
    vector(
      'nine keys, one repeated',
      'food_log',
      foodEntry({ unknownNutrients: [...ALL_EIGHT, 'sodiumMg'] }),
      fails('unknownNutrients', 'length'),
    ),
    vector('a recipes row with all eight unknown', 'recipes', recipeCopy(ALL_EIGHT), 'ok'),
    vector('a recipes row with seven unknown', 'recipes', recipeCopy(ALL_EIGHT.slice(1)), 'ok'),
  ]);
}
