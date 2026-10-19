/**
 * Schema version 1: the frozen field specs of every store (storage spec sections 4 and 9.2; D12,
 * D13). Released at the item-12 commit and NEVER edited afterwards: import validates an older
 * backup against its own version's specs first, so every backup ever made stays importable.
 *
 * A later version adds specs/vN.ts (building on ROWS_V1 where it can) and a migration step. If a
 * constant read here changes in a later version, replace the import in this file with the old
 * literal value, so version 1 keeps validating exactly as it was released. SPEC_FINGERPRINTS and
 * GOLDEN_VECTORS (migrations.ts) fail the build until that is done.
 *
 * Each table's field map is typed `{ [K in keyof Row]-?: Validator<Row[K]> }` through object<Row>,
 * so a field missing from or added to records.ts without a validator is a compile error.
 */
import {
  MAX_ENTRY_COUNT,
  MAX_LABEL_KCAL,
  MAX_LABEL_STANDARD_DRINKS,
  MAX_SERVE_ML,
  MAX_SERVE_STANDARD_DRINKS,
} from '../../alcohol/standardDrinks';
import { EARLIEST_BIRTH_YEAR } from '../../energy/age';
import { PROTEIN_LIMITS_G } from '../../energy/baseTargets';
import { ACTIVITY_FACTORS, type ActivityLevel } from '../../energy/energyEstimate';
import {
  type EatingWindow,
  FASTING_PRESET_IDS,
  FASTING_PRESETS,
  MIN_EATING_MINUTES,
  windowLength,
} from '../../fasting/eatingWindow';
import { CONFIDENCES, NUTRITION_SOURCES } from '../../nutrition/confidence';
import {
  CARB_BASES,
  KJ_PER_KCAL,
  kjToKcal,
  NUTRIENT_KEYS,
  type Nutrients,
} from '../../nutrition/nutrients';
import { HOUSEHOLD_SERVES_LIMITS, MAX_MY_SERVES } from '../../nutrition/portion';
import { WEIGHT_LIMITS_KG } from '../../weight/trend';
import { ALLERGENS, USER_ALLERGENS } from '../allergens';
import { CARD_IDS, CARD_REGISTRY_V1, cardTrigger } from '../cards';
import {
  FIBRE_GUIDE_G,
  FLOOR_KJ,
  KICKSTART_MAX_DEFICIT_PCT,
  MAX_PLANNED_FAST_MINUTES,
  MAX_RAISED_FLOOR_KJ,
  MODERATE_NET_CARB_CEILING_G,
  NET_CARB_CEILING_G,
  NUTRIENT_LIMITS_PER_100G,
  NUTRIENT_LIMITS_PER_ITEM,
  RAPID_LOSS_THRESHOLD_G_PER_WEEK,
  RAPID_LOSS_WEEKS,
  DRINKING_DAY_CUTOVER_MINUTES,
  SAT_FAT_BUDGET_PCT,
  STEADY_DEFICIT_PCT,
  WATER_TARGET_ML,
} from '../limits';
import {
  aesGcmKey,
  array,
  arrayBuffer,
  bool,
  clockTime,
  enumOf,
  fail,
  fieldPath,
  type GenericOp,
  id,
  instant,
  int,
  isLocalDate,
  isRefId,
  literal,
  localDate,
  note,
  nullable,
  num,
  object,
  type ObjectRule,
  type ObjectValidator,
  pattern,
  refId,
  rule,
  seedId,
  table,
  type TableSpec,
  text,
  timeZone,
  variants,
  YES_NO,
} from '../primitives';
import { READINESS_IDS, READINESS_WORDING_V1 } from '../readiness';
import type {
  AlcoholDayNoteRecord,
  AlcoholMilestoneRecord,
  AuditRecord,
  BeverageRecord,
  CardStateRecord,
  DrinkLogRecord,
  FastRecord,
  FoodLogRecord,
  GardenPhotoRecord,
  GardenRecord,
  GroceryItem,
  GroceryListRecord,
  IngredientChange,
  IngredientNutritionChange,
  IngredientOverrideRecord,
  IngredientRecord,
  KickstartCheckRecord,
  KickstartPeriodRecord,
  NutrientKey,
  PantryRecord,
  PlanDayRecord,
  PlannedMealRecord,
  PreCheck,
  PriceRecord,
  ProfileRecord,
  ProteinRangeRecord,
  ReadinessRecord,
  RecipeLine,
  RecipeRecord,
  SessionMovement,
  SessionRecord,
  SetResult,
  SettingsRecord,
  SourceMix,
  StepsRecord,
  StoreName,
  StoreRecords,
  StoredBeverage,
  StoredDrinkLabel,
  SymptomRecord,
  TargetsRecord,
  TransferPairingRecord,
  WaterRecord,
  WeeklyPatternDay,
  WeightRecord,
} from '../records';

// ---- Store lists (sections 4.1 and 4.2) ----

/** Dexie stores strings, version 1 (section 4.2). All primary keys are inbound strings. */
export const STORES_V1 = Object.freeze({
  profile: 'id',
  readiness: 'questionId',
  targets: 'id',
  settings: 'id',
  kickstart_periods: 'id, startedAt',
  kickstart_checks: 'id, periodId, askedAt',
  weights: 'id, at',
  fasts: 'id, startedAt',
  symptom_log: 'id, at',
  water_log: 'id, at',
  steps_log: 'date',
  ingredients: 'id, name',
  ingredient_overrides: 'seedId',
  recipes: 'id, title',
  plan_days: 'date',
  food_log: 'id, at',
  garden: 'id, ingredientId',
  garden_photos: 'gardenId',
  pantry: 'id, ingredientId',
  sessions: 'id, date',
  beverages: 'id, sortOrder',
  drinks_log: 'id, at',
  alcohol_day_notes: 'date',
  alcohol_milestones: 'id, fromDate',
  grocery_lists: 'id, createdAt',
  transfer_pairings: 'id',
  card_state: '[cardId+trigger]',
  audit: 'id, at, [table+recordId]',
} as const satisfies Readonly<Record<StoreName, string>>);

/** The 26 backed-up stores, in the order of section 4.1 (D1). */
export const BACKUP_TABLES_V1 = Object.freeze([
  'profile',
  'readiness',
  'targets',
  'settings',
  'kickstart_periods',
  'kickstart_checks',
  'weights',
  'fasts',
  'symptom_log',
  'water_log',
  'steps_log',
  'ingredients',
  'ingredient_overrides',
  'recipes',
  'plan_days',
  'food_log',
  'garden',
  'pantry',
  'sessions',
  'beverages',
  'drinks_log',
  'alcohol_day_notes',
  'alcohol_milestones',
  'grocery_lists',
  'card_state',
  'audit',
] as const satisfies readonly StoreName[]);

/** The two stores that never leave the phone (C49; D1). */
export const DEVICE_ONLY_TABLES_V1 = Object.freeze([
  'garden_photos',
  'transfer_pairings',
] as const satisfies readonly StoreName[]);

// ---- Enums local to version 1 ----

const DIET_MODES = ['keto', 'moderate-low-carb', 'balanced'] as const;
const NUTRIENT_BASES = ['raw', 'cooked', 'as-sold'] as const;
const MEAL_SLOTS = ['breakfast', 'lunch', 'meal1', 'snack', 'dinner'] as const;
const ACTIVITY_LEVELS = Object.keys(ACTIVITY_FACTORS) as ActivityLevel[];
const yesNo = enumOf(YES_NO);

// ---- Shared shapes (section 4.3) ----

/** Field `b` is null exactly when field `a` is null. */
function nullIff<T>(a: keyof T & string, b: keyof T & string): ObjectRule<T> {
  return rule<T>(
    `${b}-null-iff-${a}-null`,
    (v, path) => ((v[a] === null) === (v[b] === null) ? null : fail(fieldPath(path, b), 'iff')),
    { a, b },
  );
}

/** `later` is at or after (or strictly after) `earlier`; canonical instants compare as strings. */
function notBefore<T>(
  earlier: keyof T & string,
  later: keyof T & string,
  strict: boolean,
): ObjectRule<T> {
  return rule<T>(
    `${later}-${strict ? 'after' : 'not-before'}-${earlier}`,
    (v, path) => {
      const a = v[earlier];
      const b = v[later];
      if (typeof a !== 'string' || typeof b !== 'string') return null;
      return (strict ? b > a : b >= a) ? null : fail(fieldPath(path, later), 'order');
    },
    { earlier, later, strict },
  );
}

function nutrients(limits: Readonly<Record<NutrientKey, number>>): ObjectValidator<Nutrients> {
  return object<Nutrients>({
    energyKj: num(0, limits.energyKj),
    proteinG: num(0, limits.proteinG),
    fatG: num(0, limits.fatG),
    saturatedFatG: num(0, limits.saturatedFatG),
    carbsG: num(0, limits.carbsG),
    sugarsG: num(0, limits.sugarsG),
    fibreG: num(0, limits.fibreG),
    sodiumMg: num(0, limits.sodiumMg),
  });
}

/** carbsG is always available carbohydrate (C01). No cross-nutrient rule is applied (section 4.3). */
const nutrientsPer100g = nutrients(NUTRIENT_LIMITS_PER_100G);
const nutrientsPerItem = nutrients(NUTRIENT_LIMITS_PER_ITEM);

/** D35: unique, in NUTRIENT_KEYS order, never all eight. */
const unknownNutrients = array(enumOf(NUTRIENT_KEYS), {
  max: NUTRIENT_KEYS.length - 1,
  unique: 'value',
  order: { in: NUTRIENT_KEYS },
});

const LABEL_MAY_LACK: readonly NutrientKey[] = ['fibreG'];

/** Each listed unknown figure of a single food is stored as 0 (D35). */
function unknownAreZero<T extends { unknownNutrients: NutrientKey[] }>(
  nutrientsField: keyof T & string,
  applies: (v: T) => boolean = () => true,
): ObjectRule<T> {
  return rule<T>(
    'unknown-nutrients-are-zero',
    (v, path) => {
      if (!applies(v)) return null;
      const n = v[nutrientsField] as unknown as Nutrients;
      const key = v.unknownNutrients.find((k) => n[k] !== 0);
      return key === undefined
        ? null
        : fail(fieldPath(fieldPath(path, nutrientsField), key), 'equals');
    },
    { nutrientsField },
  );
}

type NutritionGroup = Pick<
  IngredientRecord,
  'nutrientsPer100g' | 'unknownNutrients' | 'source' | 'sourceCitation'
>;

/** The nutrition rules of a single food, applied as a group (ingredients and the nutrition override; section 4.7). */
const NUTRITION_RULES: readonly ObjectRule<NutritionGroup>[] = [
  unknownAreZero<NutritionGroup>('nutrientsPer100g'),
  rule<NutritionGroup>(
    'unknown-nutrients-by-source',
    (v, path) => {
      // NZ panels must print every figure except fibre (C68); database entries are complete (NU-01).
      const allowed =
        v.source === 'label' ? LABEL_MAY_LACK : v.source === 'estimate' ? NUTRIENT_KEYS : [];
      return v.unknownNutrients.every((k) => allowed.includes(k))
        ? null
        : fail(fieldPath(path, 'unknownNutrients'), 'equals');
    },
    { label: [...LABEL_MAY_LACK], database: [] },
  ),
  rule<NutritionGroup>('citation-for-database-source', (v, path) =>
    (v.source === 'nz-fcdb' || v.source === 'usda') && v.sourceCitation === null
      ? fail(fieldPath(path, 'sourceCitation'), 'iff')
      : null,
  ),
];

/** Core windowLength as a predicate: the eating minutes, or null when it refuses the window. */
function eatingMinutes(window: EatingWindow): number | null {
  try {
    return windowLength(window).eatingMinutes;
  } catch {
    return null;
  }
}

const PRESET_EATING_MINUTES: Readonly<Record<string, number | null>> = Object.fromEntries(
  FASTING_PRESETS.map((p) => [p.id, eatingMinutes(p.window)]),
);

/** Core EatingWindow; must pass windowLength (start ≠ end, at least MIN_EATING_MINUTES). */
const eatingWindow = object<EatingWindow>({ start: clockTime, end: clockTime }, [
  rule<EatingWindow>(
    'window-length',
    (w, path) =>
      eatingMinutes(w) === null
        ? fail(
            path,
            'range',
            `at least ${MIN_EATING_MINUTES} minutes, with different start and end`,
          )
        : null,
    { minEatingMinutes: MIN_EATING_MINUTES },
  ),
]);

/** Extends core DrinkLabel (section 4.3; NN-01, C31, C92). */
const storedDrinkLabel = object<StoredDrinkLabel>(
  {
    volumeMl: num(0, MAX_SERVE_ML, true),
    abvPercent: num(0, 100),
    standardDrinks: nullable(num(0, MAX_LABEL_STANDARD_DRINKS)),
    kcal: nullable(num(0, MAX_LABEL_KCAL)),
    energyAsEntered: nullable(
      object<{ value: number; unit: 'kcal' | 'kJ' }>({
        value: num(0, 20920),
        unit: enumOf(['kcal', 'kJ']),
      }),
    ),
    origin: enumOf(['owner', 'preset-default']),
  },
  [
    rule<StoredDrinkLabel>('label-has-a-figure', (l, path) =>
      l.standardDrinks === null && l.kcal === null
        ? fail(fieldPath(path, 'standardDrinks'), 'missing')
        : null,
    ),
    nullIff<StoredDrinkLabel>('kcal', 'energyAsEntered'),
    rule<StoredDrinkLabel>(
      'energy-as-entered',
      (l, path) => {
        if (l.energyAsEntered === null) return null;
        const { value, unit } = l.energyAsEntered;
        return Object.is(l.kcal, unit === 'kcal' ? value : kjToKcal(value))
          ? null
          : fail(fieldPath(path, 'kcal'), 'equals');
      },
      { kjPerKcal: KJ_PER_KCAL },
    ),
  ],
);

const storedBeverage = object<StoredBeverage>({
  volumeMl: num(0, MAX_SERVE_ML, true),
  abvPercent: num(0, 100),
  label: nullable(storedDrinkLabel),
});

/** Whether a stored label still applies to the measure: same volume and ABV (core standardDrinks). */
function labelApplies(b: StoredBeverage): b is StoredBeverage & { label: StoredDrinkLabel } {
  return b.label !== null && b.label.volumeMl === b.volumeMl && b.label.abvPercent === b.abvPercent;
}

// ---- Rows ----

const profile = object<ProfileRecord>(
  {
    id: literal('singleton'),
    heightCm: nullable(num(120, 230)),
    sex: nullable(enumOf(['female', 'male'])),
    birthYear: nullable(int(EARLIEST_BIRTH_YEAR, 2099)),
    activityLevel: enumOf(ACTIVITY_LEVELS),
    equipmentBands: bool,
    equipmentDumbbells: bool,
    jogOptIn: bool,
    householdSize: int(1, 20),
    dietMode: enumOf(DIET_MODES),
    carbCeilingStartedAt: nullable(instant),
    firstLowCarbAt: nullable(instant),
    kickstartOptIn: bool,
    goalKg: nullable(num(WEIGHT_LIMITS_KG.min, WEIGHT_LIMITS_KG.max)),
    goalSetAt: nullable(instant),
    goalReferenceKg: nullable(num(WEIGHT_LIMITS_KG.min, WEIGHT_LIMITS_KG.max)),
    allergens: array(enumOf(USER_ALLERGENS), { max: USER_ALLERGENS.length, unique: 'value' }),
    dislikeIngredientIds: array(refId, { max: 200, unique: 'value' }),
    dislikeTerms: array(text(1, 40), { max: 50, unique: 'ignore-case' }),
    glutenFreeHousehold: bool,
    budgetNote: nullable(text(1, 200)),
    storeName: text(1, 80),
    createdAt: instant,
    updatedAt: instant,
  },
  [
    rule<ProfileRecord>('goal-fields-together', (p, path) => {
      const set = [p.goalKg, p.goalSetAt, p.goalReferenceKg].filter((v) => v !== null).length;
      return set === 0 || set === 3 ? null : fail(fieldPath(path, 'goalKg'), 'iff');
    }),
    notBefore<ProfileRecord>('createdAt', 'updatedAt', false),
  ],
);

const readiness = object<ReadinessRecord>(
  {
    questionId: enumOf(READINESS_IDS),
    answer: yesNo,
    wordingVersion: int(1, 9999),
    answeredAt: instant,
  },
  [
    rule<ReadinessRecord>(
      'current-wording-or-older',
      (r, path) =>
        r.wordingVersion <= READINESS_WORDING_V1[r.questionId]
          ? null
          : fail(fieldPath(path, 'wordingVersion'), 'range'),
      { wording: READINESS_WORDING_V1 },
    ),
  ],
);

const targets = object<TargetsRecord>(
  {
    id: literal('singleton'),
    proteinRangeG: object<ProteinRangeRecord>(
      {
        min: num(PROTEIN_LIMITS_G.min, PROTEIN_LIMITS_G.max),
        max: num(PROTEIN_LIMITS_G.min, PROTEIN_LIMITS_G.max),
      },
      // The assertValidProteinRange rule as a predicate: max from min to the limit.
      [
        rule<ProteinRangeRecord>('max-not-below-min', (r, path) =>
          r.max >= r.min ? null : fail(fieldPath(path, 'max'), 'order'),
        ),
      ],
    ),
    netCarbCeilingG: int(NET_CARB_CEILING_G.min, NET_CARB_CEILING_G.max),
    moderateNetCarbCeilingG: int(MODERATE_NET_CARB_CEILING_G.min, MODERATE_NET_CARB_CEILING_G.max),
    saturatedFatBudgetPct: int(SAT_FAT_BUDGET_PCT.min, SAT_FAT_BUDGET_PCT.max),
    kickstartDeficitPct: int(0, KICKSTART_MAX_DEFICIT_PCT),
    steadyDeficitPct: int(STEADY_DEFICIT_PCT.min, STEADY_DEFICIT_PCT.max),
    energyFloorKj: int(FLOOR_KJ, MAX_RAISED_FLOOR_KJ),
    fibreGuideG: nullable(int(FIBRE_GUIDE_G.min, FIBRE_GUIDE_G.max)),
    waterTargetMl: nullable(int(WATER_TARGET_ML.min, WATER_TARGET_ML.max)),
    fastingPreset: nullable(enumOf([...FASTING_PRESET_IDS, 'custom'] as const)),
    eatingWindow: nullable(eatingWindow),
    presetChosenBy: nullable(enumOf(['kickstart-default', 'default', 'user'])),
    refluxPreferEarlier: bool,
    refluxPreferSplit: bool,
    updatedAt: instant,
  },
  [
    nullIff<TargetsRecord>('fastingPreset', 'eatingWindow'),
    nullIff<TargetsRecord>('fastingPreset', 'presetChosenBy'),
    rule<TargetsRecord>(
      'preset-window-length',
      (t, path) => {
        if (t.fastingPreset === null || t.fastingPreset === 'custom' || t.eatingWindow === null)
          return null;
        return eatingMinutes(t.eatingWindow) === PRESET_EATING_MINUTES[t.fastingPreset]
          ? null
          : fail(fieldPath(path, 'eatingWindow'), 'equals');
      },
      { presetEatingMinutes: PRESET_EATING_MINUTES },
    ),
  ],
);

const settings = object<SettingsRecord>(
  {
    id: literal('singleton'),
    onboardingCompletedAt: nullable(instant),
    alcoholNoticeAckAt: nullable(instant),
    profileConfirmedAt: nullable(instant),
    scheduleConfirmedAt: nullable(instant),
    gardenConfirmedAt: nullable(instant),
    lastBackupAt: nullable(instant),
    theme: enumOf(['system', 'light', 'dark']),
    textSize: enumOf(['standard', 'large', 'largest']),
    homeTimeZone: timeZone,
    drinkingDayCutoverMinutes: int(
      DRINKING_DAY_CUTOVER_MINUTES.min,
      DRINKING_DAY_CUTOVER_MINUTES.max,
      DRINKING_DAY_CUTOVER_MINUTES.step,
    ),
    rapidLossThresholdGPerWeek: int(
      RAPID_LOSS_THRESHOLD_G_PER_WEEK.min,
      RAPID_LOSS_THRESHOLD_G_PER_WEEK.max,
      RAPID_LOSS_THRESHOLD_G_PER_WEEK.step,
    ),
    rapidLossConsecutiveWeeks: enumOf(RAPID_LOSS_WEEKS.values),
    rapidLossExplanationReadAt: nullable(instant),
    alcoholGuidanceSet: nullable(enumOf(['nz-women', 'nz-men'])),
    weeklyPattern: nullable(
      array(
        object<WeeklyPatternDay>({
          weekday: int(1, 7),
          templateIds: array(seedId, { max: 3, unique: 'value' }),
        }),
        { min: 7, max: 7, unique: { field: 'weekday' } },
      ),
    ),
    hiddenSeedIds: array(seedId, { max: 500, unique: 'value' }),
  },
  [
    // C46: the bounds are adjustable only after reading the explanation.
    rule<SettingsRecord>(
      'rapid-loss-explanation-read',
      (s, path) =>
        (s.rapidLossThresholdGPerWeek !== RAPID_LOSS_THRESHOLD_G_PER_WEEK.default ||
          s.rapidLossConsecutiveWeeks !== RAPID_LOSS_WEEKS.default) &&
        s.rapidLossExplanationReadAt === null
          ? fail(fieldPath(path, 'rapidLossExplanationReadAt'), 'iff')
          : null,
      {
        thresholdDefault: RAPID_LOSS_THRESHOLD_G_PER_WEEK.default,
        weeksDefault: RAPID_LOSS_WEEKS.default,
      },
    ),
  ],
);

const kickstartPeriod = object<KickstartPeriodRecord>(
  {
    id,
    startedAt: instant,
    timeZone,
    endedAt: nullable(instant),
    endedTimeZone: nullable(timeZone),
    endReason: nullable(enumOf(['left-keto', 'readiness-gated', 'user-ended'])),
  },
  [
    nullIff<KickstartPeriodRecord>('endedAt', 'endedTimeZone'),
    nullIff<KickstartPeriodRecord>('endedAt', 'endReason'),
    notBefore<KickstartPeriodRecord>('startedAt', 'endedAt', true),
  ],
);

const kickstartCheck = object<KickstartCheckRecord>(
  {
    id,
    periodId: id,
    askedAt: instant,
    timeZone,
    dizzyOnStanding: yesNo,
    palpitations: yesNo,
    crampsNotSettling: yesNo,
    faintAtWork: yesNo,
    energyRating: nullable(int(1, 5)),
    sleepRating: nullable(int(1, 5)),
    outcome: enumOf(['extended', 'stop-sign']),
  },
  [
    // C59, WT-09: extended exactly when all four stop-sign answers are no.
    rule<KickstartCheckRecord>('outcome-from-answers', (c, path) => {
      const allNo = [c.dizzyOnStanding, c.palpitations, c.crampsNotSettling, c.faintAtWork].every(
        (a) => a === 'no',
      );
      return (c.outcome === 'extended') === allNo
        ? null
        : fail(fieldPath(path, 'outcome'), 'equals');
    }),
  ],
);

const weight = object<WeightRecord>({
  id,
  at: instant,
  timeZone,
  kg: num(WEIGHT_LIMITS_KG.min, WEIGHT_LIMITS_KG.max),
  source: enumOf(['onboarding', 'manual']),
  note: nullable(note(280)),
});

const fast = object<FastRecord>(
  {
    id,
    startedAt: instant,
    timeZone,
    endedAt: nullable(instant),
    endedTimeZone: nullable(timeZone),
    // D47: stored only when a whole number in 1–1440; fasts.start() stores null otherwise.
    plannedFastMinutes: nullable(int(1, MAX_PLANNED_FAST_MINUTES)),
    snackTime: nullable(clockTime),
    dinnerTime: nullable(clockTime),
    note: nullable(note(500)),
  },
  [
    nullIff<FastRecord>('endedAt', 'endedTimeZone'),
    notBefore<FastRecord>('startedAt', 'endedAt', true),
  ],
);

const symptom = object<SymptomRecord>({
  id,
  at: instant,
  timeZone,
  symptom: enumOf(['heartburn', 'night-cough', 'regurgitation']),
  severity: nullable(int(1, 3)),
  note: nullable(note(280)),
});

const water = object<WaterRecord>(
  { id, at: instant, timeZone, ml: int(0, 3000), electrolyte: bool },
  [
    rule<WaterRecord>('water-or-electrolyte', (w, path) =>
      w.ml > 0 || w.electrolyte ? null : fail(fieldPath(path, 'ml'), 'range'),
    ),
  ],
);

const steps = object<StepsRecord>({
  date: localDate,
  steps: int(0, 100000),
  source: literal('manual'),
  updatedAt: instant,
});

const packSizesG = (min: number) =>
  array(num(0, 50000, true), { min, max: 10, order: 'ascending' });
const allergenList = array(enumOf(ALLERGENS), { max: ALLERGENS.length, unique: 'value' });
const aliases = array(text(1, 80), { max: 10, unique: 'value' });
const seasonMonths = array(int(1, 12), { max: 12, unique: 'value', order: 'ascending' });
const substitutes = array(refId, { max: 10, unique: 'value' });
const gramsUpTo5000 = nullable(num(0, 5000, true));

const ingredient = object<IngredientRecord>(
  {
    // An Id: a SeedId is refused here; seed corrections go in ingredient_overrides (D2).
    id,
    name: text(1, 80),
    aliases,
    aisle: text(1, 40),
    packSizesG: packSizesG(0),
    packSizeSource: nullable(enumOf(['typical', 'owner'])),
    packSizeEnteredAt: nullable(instant),
    nutrientsPer100g,
    unknownNutrients,
    carbBasisAsEntered: enumOf(CARB_BASES),
    nutrientBasis: enumOf(NUTRIENT_BASES),
    cookedYield: nullable(num(0, 5, true)),
    yieldCitation: nullable(text(1, 200)),
    source: enumOf(NUTRITION_SOURCES),
    sourceCitation: nullable(text(1, 200)),
    allergens: nullable(allergenList),
    gardenFlag: bool,
    seasonMonths,
    substitutes,
    gramsPerEach: gramsUpTo5000,
    servingSizeG: gramsUpTo5000,
    createdAt: instant,
    updatedAt: instant,
  },
  [
    rule<IngredientRecord>('pack-size-source', (i, path) =>
      (i.packSizeSource === null) === (i.packSizesG.length === 0)
        ? null
        : fail(fieldPath(path, 'packSizeSource'), 'iff'),
    ),
    rule<IngredientRecord>('pack-size-entered-at', (i, path) =>
      (i.packSizeEnteredAt !== null) === (i.packSizeSource === 'owner')
        ? null
        : fail(fieldPath(path, 'packSizeEnteredAt'), 'iff'),
    ),
    nullIff<IngredientRecord>('cookedYield', 'yieldCitation'),
    ...NUTRITION_RULES,
    rule<IngredientRecord>('substitutes-not-self', (i, path) =>
      i.substitutes.includes(i.id) ? fail(fieldPath(path, 'substitutes'), 'unique') : null,
    ),
  ],
);

type Change<F extends IngredientChange['field']> = Extract<IngredientChange, { field: F }>;

const ingredientChange = variants<IngredientChange>('field', {
  name: object<Change<'name'>>({ field: literal('name'), value: text(1, 80) }),
  aliases: object<Change<'aliases'>>({ field: literal('aliases'), value: aliases }),
  aisle: object<Change<'aisle'>>({ field: literal('aisle'), value: text(1, 40) }),
  // Correcting pack sizes makes packSizeSource 'owner' (C69).
  packSizes: object<Change<'packSizes'>>({
    field: literal('packSizes'),
    value: object<Change<'packSizes'>['value']>({ packSizesG: packSizesG(1), enteredAt: instant }),
  }),
  // The ingredients nutrition rules apply as a group.
  nutrition: object<Change<'nutrition'>>({
    field: literal('nutrition'),
    value: object<IngredientNutritionChange>(
      {
        nutrientsPer100g,
        unknownNutrients,
        carbBasisAsEntered: enumOf(CARB_BASES),
        nutrientBasis: enumOf(NUTRIENT_BASES),
        source: enumOf(NUTRITION_SOURCES),
        sourceCitation: nullable(text(1, 200)),
      },
      NUTRITION_RULES,
    ),
  }),
  // Allergens can only be added; null marks them unknown (C43, HS-24).
  addAllergens: object<Change<'addAllergens'>>({
    field: literal('addAllergens'),
    value: nullable(allergenList),
  }),
  substitutes: object<Change<'substitutes'>>({ field: literal('substitutes'), value: substitutes }),
  gramsPerEach: object<Change<'gramsPerEach'>>({
    field: literal('gramsPerEach'),
    value: gramsUpTo5000,
  }),
  servingSizeG: object<Change<'servingSizeG'>>({
    field: literal('servingSizeG'),
    value: gramsUpTo5000,
  }),
  seasonMonths: object<Change<'seasonMonths'>>({
    field: literal('seasonMonths'),
    value: seasonMonths,
  }),
  gardenFlag: object<Change<'gardenFlag'>>({ field: literal('gardenFlag'), value: bool }),
});

const ingredientOverride = object<IngredientOverrideRecord>(
  {
    seedId,
    changes: array(ingredientChange, { min: 1, max: 11, unique: { field: 'field' } }),
    createdAt: instant,
    updatedAt: instant,
  },
  [
    rule<IngredientOverrideRecord>('substitutes-not-self', (o, path) =>
      o.changes.some((c) => c.field === 'substitutes' && c.value.includes(o.seedId))
        ? fail(fieldPath(path, 'changes'), 'unique')
        : null,
    ),
  ],
);

const recipeLine = object<RecipeLine>({
  ingredientId: refId,
  rawG: num(0, 5000, true),
  cookedG: gramsUpTo5000,
  displayAs: nullable(text(1, 40)),
});

const recipe = object<RecipeRecord>(
  {
    id,
    title: text(1, 100),
    serves: int(1, 50),
    timeMinutes: nullable(int(0, 600)),
    lines: array(recipeLine, { min: 1, max: 60 }),
    method: array(text(1, 500), { max: 40 }),
    tags: array(text(1, 30), { max: 20, unique: 'value' }),
    allergens: allergenList,
    derivedFromRecipeId: nullable(refId),
    nutritionPerServe: nutrientsPerItem,
    unknownNutrients,
    confidence: enumOf(['database', 'estimate']),
    sourceMix: object<SourceMix>({
      label: int(0, 60),
      'nz-fcdb': int(0, 60),
      usda: int(0, 60),
      estimate: int(0, 60),
    }),
    createdAt: instant,
    updatedAt: instant,
  },
  [
    rule<RecipeRecord>('source-mix-counts-lines', (r, path) => {
      const total =
        r.sourceMix.label + r.sourceMix['nz-fcdb'] + r.sourceMix.usda + r.sourceMix.estimate;
      return total === r.lines.length ? null : fail(fieldPath(path, 'sourceMix'), 'equals');
    }),
    // The C32 rule (core recipeConfidence) written as a data predicate.
    rule<RecipeRecord>('confidence-from-source-mix', (r, path) =>
      r.confidence === (r.sourceMix.estimate > 0 ? 'estimate' : 'database')
        ? null
        : fail(fieldPath(path, 'confidence'), 'equals'),
    ),
  ],
);

const plannedMeal = object<PlannedMealRecord>({
  slot: enumOf(MEAL_SLOTS),
  recipeId: refId,
  myServes: num(0, MAX_MY_SERVES),
  householdServes: int(HOUSEHOLD_SERVES_LIMITS.min, HOUSEHOLD_SERVES_LIMITS.max),
});

const planDay = object<PlanDayRecord>({
  date: localDate,
  dietMode: enumOf(DIET_MODES),
  meals: array(plannedMeal, { max: 6, unique: { field: 'slot' } }),
  eatingWindow: nullable(eatingWindow),
  updatedAt: instant,
});

const PLAN_REF_RE = /^(\d{4}-\d{2}-\d{2})#(breakfast|lunch|meal1|snack|dinner)$/;

function foodRefMatches(row: FoodLogRecord): boolean {
  switch (row.sourceKind) {
    case 'estimate':
      return row.refId === null;
    case 'plan': {
      const m = row.refId === null ? null : PLAN_REF_RE.exec(row.refId);
      return m !== null && isLocalDate(m[1]);
    }
    case 'recipe':
    case 'label':
      return isRefId(row.refId);
  }
}

const foodLog = object<FoodLogRecord>(
  {
    id,
    at: instant,
    timeZone,
    sourceKind: enumOf(['plan', 'recipe', 'label', 'estimate']),
    refId: nullable(text(1, 120)),
    name: text(1, 100),
    grams: gramsUpTo5000,
    weightBasis: nullable(enumOf(NUTRIENT_BASES)),
    servings: nullable(num(0, 10, true)),
    nutrients: nutrientsPerItem,
    unknownNutrients,
    confidence: enumOf(CONFIDENCES),
  },
  [
    nullIff<FoodLogRecord>('grams', 'weightBasis'),
    rule<FoodLogRecord>('grams-or-servings', (f, path) =>
      f.grams === null && f.servings === null ? fail(fieldPath(path, 'grams'), 'missing') : null,
    ),
    rule<FoodLogRecord>('ref-id-by-kind', (f, path) =>
      foodRefMatches(f) ? null : fail(fieldPath(path, 'refId'), 'pattern'),
    ),
    rule<FoodLogRecord>(
      'unknown-nutrients-by-kind',
      (f, path) =>
        f.sourceKind === 'label' && !f.unknownNutrients.every((k) => LABEL_MAY_LACK.includes(k))
          ? fail(fieldPath(path, 'unknownNutrients'), 'equals')
          : null,
      { label: [...LABEL_MAY_LACK] },
    ),
    unknownAreZero<FoodLogRecord>(
      'nutrients',
      (f) => f.sourceKind === 'label' || f.sourceKind === 'estimate',
    ),
    rule<FoodLogRecord>('confidence-by-kind', (f, path) => {
      const ok =
        f.sourceKind === 'label'
          ? f.confidence === 'label'
          : f.sourceKind === 'estimate'
            ? f.confidence === 'estimate'
            : f.confidence !== 'label';
      return ok ? null : fail(fieldPath(path, 'confidence'), 'equals');
    }),
  ],
);

const garden = object<GardenRecord>(
  {
    id,
    ingredientId: nullable(refId),
    name: text(1, 60),
    amount: nullable(num(0, 100000, true)),
    unit: nullable(enumOf(['g', 'each', 'bunch'])),
    gramsPerUnit: gramsUpTo5000,
    harvestReady: bool,
    harvestedAt: nullable(localDate),
    perishabilityDays: nullable(int(0, 365)),
    updatedAt: instant,
  },
  [
    nullIff<GardenRecord>('amount', 'unit'),
    rule<GardenRecord>('grams-per-unit-for-counted-units', (g, path) =>
      g.gramsPerUnit !== null && g.unit !== 'each' && g.unit !== 'bunch'
        ? fail(fieldPath(path, 'gramsPerUnit'), 'iff')
        : null,
    ),
  ],
);

const gardenPhoto = object<GardenPhotoRecord>({
  gardenId: id,
  mimeType: enumOf(['image/jpeg', 'image/webp']),
  bytes: arrayBuffer(1, 1_500_000),
  width: int(1, 2048),
  height: int(1, 2048),
  takenAt: instant,
});

const pantry = object<PantryRecord>(
  {
    id,
    ingredientId: nullable(refId),
    name: text(1, 60),
    amount: nullable(num(0, 100000)),
    unit: nullable(enumOf(['g', 'ml', 'each'])),
    updatedAt: instant,
  },
  [nullIff<PantryRecord>('amount', 'unit')],
);

const setResult = object<SetResult>({
  reps: nullable(int(1, 500)),
  seconds: nullable(int(1, 3600)),
});

const movement = object<SessionMovement>(
  {
    exerciseId: seedId,
    variant: enumOf(['standard', 'easier', 'harder', 'band', 'dumbbell']),
    sets: int(1, 20),
    reps: nullable(int(1, 500)),
    seconds: nullable(int(1, 3600)),
    done: array(setResult, { max: 20 }),
  },
  [
    rule<SessionMovement>('reps-or-seconds', (m, path) =>
      (m.reps === null) === (m.seconds === null) ? fail(fieldPath(path, 'reps'), 'iff') : null,
    ),
    rule<SessionMovement>('done-at-most-sets', (m, path) =>
      m.done.length > m.sets ? fail(fieldPath(path, 'done'), 'length') : null,
    ),
    rule<SessionMovement>('done-matches-movement', (m, path) =>
      m.done.some(
        (d) =>
          (d.reps === null) !== (m.reps === null) || (d.seconds === null) !== (m.seconds === null),
      )
        ? fail(fieldPath(path, 'done'), 'iff')
        : null,
    ),
  ],
);

const preCheck = object<PreCheck>({
  painOrInjury: yesNo,
  backOrLegSymptoms: yesNo,
  tiredOrPoorSleep: yesNo,
  heatOrSun: yesNo,
  notHydrated: yesNo,
  heavyWorkDay: yesNo,
});

const session = object<SessionRecord>(
  {
    id,
    date: localDate,
    templateId: seedId,
    status: enumOf(['planned', 'done', 'rested', 'skipped']),
    movements: array(movement, { max: 20 }),
    preCheck: nullable(preCheck),
    exertion: nullable(int(1, 5)),
    soreness: nullable(int(1, 5)),
    energy: nullable(int(1, 5)),
    durationMinutes: nullable(int(0, 600)),
    completedAt: nullable(instant),
    timeZone: nullable(timeZone),
    note: nullable(note(500)),
  },
  [
    rule<SessionRecord>('ratings-only-when-done', (s, path) => {
      if (s.status === 'done') return null;
      const rated = (['exertion', 'soreness', 'energy'] as const).find((k) => s[k] !== null);
      return rated === undefined ? null : fail(fieldPath(path, rated), 'iff');
    }),
    rule<SessionRecord>('completed-iff-done', (s, path) =>
      (s.completedAt !== null) === (s.status === 'done')
        ? null
        : fail(fieldPath(path, 'completedAt'), 'iff'),
    ),
    nullIff<SessionRecord>('completedAt', 'timeZone'),
  ],
);

const beverage = object<BeverageRecord>({
  id,
  name: text(1, 60),
  volumeMl: num(0, MAX_SERVE_ML, true),
  abvPercent: num(0, 100),
  label: nullable(storedDrinkLabel),
  sortOrder: int(0, 999),
  archived: bool,
  createdAt: instant,
  updatedAt: instant,
});

const drink = object<DrinkLogRecord>(
  {
    id,
    at: instant,
    timeZone,
    beverageId: nullable(refId),
    name: text(1, 60),
    count: int(1, MAX_ENTRY_COUNT),
    beverage: storedBeverage,
    stdDrinksPerServe: num(0, MAX_SERVE_STANDARD_DRINKS),
    stdSource: enumOf(['label', 'calculated']),
    kcalPerServe: nullable(num(0, MAX_LABEL_KCAL)),
  },
  [
    // The validator checks agreement with the stored label only; it never recomputes with core,
    // so a later change inside a core function cannot make old rows invalid (section 9.2).
    rule<DrinkLogRecord>('std-source-from-label', (d, path) => {
      const expected =
        labelApplies(d.beverage) && d.beverage.label.standardDrinks !== null
          ? 'label'
          : 'calculated';
      return d.stdSource === expected ? null : fail(fieldPath(path, 'stdSource'), 'equals');
    }),
    rule<DrinkLogRecord>('label-figure-wins', (d, path) =>
      d.stdSource === 'label' && !Object.is(d.stdDrinksPerServe, d.beverage.label?.standardDrinks)
        ? fail(fieldPath(path, 'stdDrinksPerServe'), 'equals')
        : null,
    ),
    rule<DrinkLogRecord>('kcal-from-label', (d, path) => {
      const expected = labelApplies(d.beverage) ? d.beverage.label.kcal : null;
      return Object.is(d.kcalPerServe, expected)
        ? null
        : fail(fieldPath(path, 'kcalPerServe'), 'equals');
    }),
  ],
);

const alcoholDayNote = object<AlcoholDayNoteRecord>(
  {
    date: localDate,
    note: nullable(note(1000)),
    withdrawalTick: bool,
    enteredAt: instant,
    timeZone,
    updatedAt: instant,
  },
  [
    rule<AlcoholDayNoteRecord>('note-or-tick', (n, path) =>
      n.note === null && !n.withdrawalTick ? fail(fieldPath(path, 'note'), 'missing') : null,
    ),
    notBefore<AlcoholDayNoteRecord>('enteredAt', 'updatedAt', false),
  ],
);

const alcoholMilestone = object<AlcoholMilestoneRecord>({
  id,
  label: text(1, 80),
  weeklyStdDrinks: num(0, 200),
  fromDate: localDate,
  enteredBy: enumOf(['self', 'clinician']),
  note: nullable(note(280)),
  createdAt: instant,
});

const price = object<PriceRecord>({
  amountNzCents: int(1, 1_000_000),
  basis: enumOf(['line', 'per_kg', 'each']),
  enteredAt: instant,
});

const groceryItem = object<GroceryItem>(
  {
    id,
    origin: enumOf(['generated', 'manual']),
    ingredientId: nullable(refId),
    text: text(1, 100),
    quantity: nullable(num(0, 100000, true)),
    unit: nullable(enumOf(['g', 'ml', 'each', 'pack'])),
    packSuggestion: nullable(text(1, 60)),
    aisle: text(1, 40),
    substituteHint: nullable(text(1, 60)),
    section: enumOf(['to-buy', 'already-have']),
    fromGardenG: nullable(num(0, 100000)),
    gardenAmountUnknown: bool,
    fromPantryG: nullable(num(0, 100000)),
    auditNote: nullable(text(1, 200)),
    price: nullable(price),
    ticked: bool,
  },
  [nullIff<GroceryItem>('quantity', 'unit')],
);

const groceryList = object<GroceryListRecord>(
  {
    id,
    version: int(1, 1_000_000),
    createdAt: instant,
    updatedAt: instant,
    storeName: text(1, 80),
    sentVersion: nullable(int(1, 1_000_000)),
    sentAt: nullable(instant),
    transferId: nullable(id),
    receivedVersion: nullable(int(1, 1_000_000)),
    receivedAt: nullable(instant),
    laptopReceivedAt: nullable(instant),
    items: array(groceryItem, { max: 500, unique: { field: 'id' } }),
  },
  [
    rule<GroceryListRecord>('sent-version-not-after-version', (g, path) =>
      g.sentVersion !== null && g.sentVersion > g.version
        ? fail(fieldPath(path, 'sentVersion'), 'order')
        : null,
    ),
    nullIff<GroceryListRecord>('sentVersion', 'sentAt'),
    nullIff<GroceryListRecord>('sentVersion', 'transferId'),
    rule<GroceryListRecord>('received-version-not-after-sent', (g, path) => {
      if (g.receivedVersion === null) return null;
      if (g.sentVersion === null) return fail(fieldPath(path, 'receivedVersion'), 'iff');
      return g.receivedVersion > g.sentVersion
        ? fail(fieldPath(path, 'receivedVersion'), 'order')
        : null;
    }),
    // No ordering check between receivedAt and sentAt: clocks can move (C52).
    nullIff<GroceryListRecord>('receivedVersion', 'receivedAt'),
    nullIff<GroceryListRecord>('receivedVersion', 'laptopReceivedAt'),
  ],
);

const transferPairing = object<TransferPairingRecord>({
  id: literal('singleton'),
  // Not compared with the configured relay origin here: that is build configuration (C81).
  relayUrl: pattern('https-url', /^https:\/\/[^\s/?#]+(?:[/?#]\S*)?$/, 1, 200),
  roomId: pattern('room-id', /^[A-Za-z0-9_-]{22}$/, 22, 22),
  key: aesGcmKey,
  pairedAt: instant,
});

const cardState = object<CardStateRecord>(
  {
    cardId: enumOf(CARD_IDS),
    trigger: text(1, 80),
    firstShownAt: nullable(instant),
    dismissedAt: nullable(instant),
    dismissedTimeZone: nullable(timeZone),
    doneAt: nullable(instant),
  },
  [
    rule<CardStateRecord>(
      'registered-trigger',
      (c, path) =>
        cardTrigger(c.cardId, c.trigger, CARD_REGISTRY_V1) === null
          ? fail(fieldPath(path, 'trigger'), 'pattern')
          : null,
      { registry: CARD_REGISTRY_V1 },
    ),
    nullIff<CardStateRecord>('dismissedAt', 'dismissedTimeZone'),
    rule<CardStateRecord>('has-a-timestamp', (c, path) =>
      c.firstShownAt === null && c.dismissedAt === null && c.doneAt === null
        ? fail(fieldPath(path, 'firstShownAt'), 'missing')
        : null,
    ),
  ],
);

const audit = object<AuditRecord>({
  id,
  at: instant,
  timeZone,
  kind: enumOf(['grocery', 'migration']),
  table: enumOf(BACKUP_TABLES_V1),
  recordId: text(1, 120),
  reason: text(1, 500),
});

/** The version-1 row validators, for later versions to build on. */
export const ROWS_V1: { readonly [K in StoreName]: ObjectValidator<StoreRecords[K]> } =
  Object.freeze({
    profile,
    readiness,
    targets,
    settings,
    kickstart_periods: kickstartPeriod,
    kickstart_checks: kickstartCheck,
    weights: weight,
    fasts: fast,
    symptom_log: symptom,
    water_log: water,
    steps_log: steps,
    ingredients: ingredient,
    ingredient_overrides: ingredientOverride,
    recipes: recipe,
    plan_days: planDay,
    food_log: foodLog,
    garden,
    garden_photos: gardenPhoto,
    pantry,
    sessions: session,
    beverages: beverage,
    drinks_log: drink,
    alcohol_day_notes: alcoholDayNote,
    alcohol_milestones: alcoholMilestone,
    grocery_lists: groceryList,
    transfer_pairings: transferPairing,
    card_state: cardState,
    audit,
  });

const ALL: readonly GenericOp[] = ['create', 'get', 'list', 'update', 'remove'];

/** Section 8.4: the generic repository's allowed operations per store (D46). */
const OPS_V1: { readonly [K in StoreName]: readonly GenericOp[] } = {
  profile: ['get', 'update'],
  readiness: ['list'],
  targets: ['get', 'update'],
  settings: ['get', 'update'],
  kickstart_periods: ['get', 'list'],
  kickstart_checks: ['get', 'list'],
  weights: ALL,
  fasts: ['get', 'list', 'update', 'remove'],
  symptom_log: ALL,
  water_log: ALL,
  steps_log: ALL,
  ingredients: ALL,
  ingredient_overrides: ALL,
  recipes: ALL,
  plan_days: ALL,
  food_log: ALL,
  garden: ALL,
  garden_photos: [],
  pantry: ALL,
  sessions: ALL,
  beverages: ALL,
  drinks_log: ['get', 'list'],
  alcohol_day_notes: ALL,
  alcohol_milestones: ALL,
  grocery_lists: ALL,
  transfer_pairings: [],
  card_state: ['get'],
  audit: ['create', 'get', 'list'],
};

function tableV1<K extends StoreName>(name: K): TableSpec<StoreRecords[K]> {
  const deviceOnly: readonly string[] = DEVICE_ONLY_TABLES_V1;
  return table(STORES_V1[name], !deviceOnly.includes(name), OPS_V1[name], ROWS_V1[name]);
}

/** TABLES_V1: every store's frozen version-1 spec (key, indexes, backup flag, operations, row validator). */
export const TABLES_V1: { readonly [K in StoreName]: TableSpec<StoreRecords[K]> } = Object.freeze(
  Object.fromEntries(
    (Object.keys(STORES_V1) as StoreName[]).map((name) => [name, tableV1(name)]),
  ) as {
    [K in StoreName]: TableSpec<StoreRecords[K]>;
  },
);
