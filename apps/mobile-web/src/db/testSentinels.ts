/**
 * The health-sentinel phone (item 24 design 5.1; J22, J39; GL-10, item 31 rule 4), for tests only:
 * the version-1 fixture with every top-level text field of every store set to "zzh" marker text,
 * except the fields the grocery list may take its words from (the store name, own food names,
 * aliases and aisles, and recipe titles), plus marker numbers no grocery amount can produce, a
 * plan for the seven days from SENTINEL_NOW, and garden and pantry rows linked to its foods.
 * A field the validator refuses as marker text keeps its fixture value and is listed by
 * healthSentinelSkips(), so a skipped field is visible. Item 31 adds `groceryList: 'sentinel'`.
 */
import {
  BACKUP_TABLES,
  checkRow,
  type GardenRecord,
  type PantryRecord,
  type PlanDayRecord,
  type RecipeRecord,
  type Snapshot,
  type StoreName,
} from '@diet/core';
import { fixtureId, snapshotV1 } from '@diet/test-fixtures';

/** The sentinel phone's clock: the plan starts this day. */
export const SENTINEL_NOW = '2000-03-01T00:00:00.000Z';

/** Marker numbers (design 5.1): none can be a grocery amount of the sentinel plan. */
export const SENTINEL_NUMBERS = [
  '87.3',
  '137',
  '149',
  '23',
  '113',
  '9,137',
  '9137',
  '16:47',
  '18:47',
  '1.37',
];

/** Fields the list may take its words from (item 31 rule 4), left unmarked (J22). */
const LIST_SOURCES: Partial<Record<StoreName, readonly string[]>> = {
  profile: ['storeName'],
  ingredients: ['name', 'aisle'],
  recipes: ['title'],
  // Stock rows are replaced below with their own marker names.
  garden: [],
  pantry: [],
};

type Row = Record<string, unknown>;

const OWN_RECIPE = fixtureId(7901);
const plan = (recipeId: string) => ({
  slot: 'dinner' as const,
  recipeId,
  myServes: 1,
  householdServes: 1,
});

function build(): { readonly snapshot: Snapshot; readonly skipped: readonly string[] } {
  const skipped: string[] = [];
  const out: Record<string, Row[]> = {};
  const trySet = (store: StoreName, row: Row, patch: Row, label: string): Row => {
    const next = { ...row, ...patch };
    if (checkRow(store, next).ok) return next;
    skipped.push(`${store}.${label}`);
    return row;
  };
  for (const store of BACKUP_TABLES) {
    out[store] = (snapshotV1[store] as unknown as Row[]).map((source) => {
      let row: Row = { ...source };
      for (const [field, value] of Object.entries(source)) {
        if (typeof value !== 'string' || (LIST_SOURCES[store] ?? []).includes(field)) continue;
        const marker = `zzh-${store}-${field}`.slice(0, Math.max(3, value.length));
        const next = { ...row, [field]: marker };
        if (checkRow(store, next).ok) row = next;
      }
      return row;
    });
  }
  const [profile] = out['profile'] ?? [];
  if (profile !== undefined) {
    out['profile'] = [
      trySet(
        'profile',
        { ...profile, storeName: 'Example store' },
        { allergens: ['sesame'], dislikeTerms: ['zzh-dislike'] },
        'allergens and dislikes',
      ),
    ];
  }
  const [targets] = out['targets'] ?? [];
  if (targets !== undefined) {
    out['targets'] = [
      trySet(
        'targets',
        targets,
        {
          proteinRangeG: { min: 137, max: 149 },
          netCarbCeilingG: 23,
          moderateNetCarbCeilingG: 113,
          energyFloorKj: 9137,
          fastingPreset: 'custom',
          eatingWindow: { start: '16:47', end: '18:47' },
        },
        'markers',
      ),
    ];
  }
  out['weights'] = (out['weights'] ?? []).map((w) => trySet('weights', w, { kg: 87.3 }, 'kg'));
  out['drinks_log'] = (out['drinks_log'] ?? []).map((d) => {
    const beverage = d['beverage'] as { label: Row | null } & Row;
    return trySet(
      'drinks_log',
      d,
      {
        stdDrinksPerServe: 1.37,
        beverage: {
          ...beverage,
          label: beverage.label === null ? null : { ...beverage.label, standardDrinks: 1.37 },
        },
      },
      'stdDrinksPerServe',
    );
  });
  out['grocery_lists'] = [];

  // A plan whose every raw amount is a multiple of 50 g, at most 6 eggs, no sesame-named food, and
  // one line whose food is not in the app.
  const own = (out['ingredients'] ?? [])[1]?.['id'] as string;
  const recipe: RecipeRecord = {
    ...(snapshotV1.recipes[0] as RecipeRecord),
    id: OWN_RECIPE,
    title: 'Example traybake',
    serves: 1,
    lines: [
      { ingredientId: own, rawG: 200, cookedG: null, displayAs: null },
      { ingredientId: 'seed:silverbeet', rawG: 300, cookedG: null, displayAs: null },
      { ingredientId: 'seed:chicken-thigh', rawG: 400, cookedG: null, displayAs: null },
      { ingredientId: 'seed:eggs', rawG: 300, cookedG: null, displayAs: null },
      { ingredientId: 'seed:broccoli', rawG: 350, cookedG: null, displayAs: null },
      { ingredientId: 'seed:example-gone', rawG: 50, cookedG: null, displayAs: null },
    ],
    derivedFromRecipeId: null,
    confidence: 'estimate',
    sourceMix: { label: 0, 'nz-fcdb': 0, usda: 0, estimate: 6 },
  };
  out['recipes'] = [...(out['recipes'] ?? []), recipe as unknown as Row];
  const days: PlanDayRecord[] = ['2000-03-01', '2000-03-02', '2000-03-04'].map((date, i) => ({
    date,
    dietMode: 'balanced',
    meals: [plan(i === 0 ? OWN_RECIPE : 'seed:recipe-chicken-silverbeet-traybake')],
    eatingWindow: i === 1 ? { start: '16:47', end: '18:47' } : null,
    updatedAt: '2000-02-28T00:00:00.000Z',
  }));
  out['plan_days'] = days as unknown as Row[];
  const linked: [string, number, string][] = [
    ['seed:silverbeet', 200, '2000-01-03'],
    ['seed:chicken-thigh', 300, '2000-01-20'],
    [own, 100, '2000-01-01'],
  ];
  out['garden'] = linked.map(([ingredientId, amount, day], i): GardenRecord => ({
    id: fixtureId(7801 + i),
    ingredientId,
    name: `zzh garden ${i}`,
    amount,
    unit: 'g',
    gramsPerUnit: null,
    harvestReady: true,
    harvestedAt: null,
    perishabilityDays: null,
    updatedAt: `${day}T00:00:00.000Z`,
  })) as unknown as Row[];
  out['pantry'] = linked.map(([ingredientId, amount, day], i): PantryRecord => ({
    id: fixtureId(7811 + i),
    ingredientId,
    name: `zzh pantry ${i}`,
    amount,
    unit: 'g',
    updatedAt: `${day}T00:00:00.000Z`,
  })) as unknown as Row[];
  return { snapshot: out as unknown as Snapshot, skipped };
}

/** The sentinel snapshot, holding no grocery list (item 31 adds its `groceryList` option). */
export function healthSentinelSnapshot(): Snapshot {
  return build().snapshot;
}

/** The fields the validator refused as markers (kept at their fixture values). */
export function healthSentinelSkips(): readonly string[] {
  return build().skipped;
}
