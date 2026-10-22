/**
 * Default rows and the rows seeded when the database is created (storage spec section 6). The
 * app's populate (which also runs again after delete-all) validates these with validateRow before
 * writing them. Nothing else is seeded: no readiness rows (unanswered means gated, C41), no card
 * state, and never a milestone (HEALTH_SAFETY section 5).
 */
import { DEFAULT_PROTEIN_RANGE_G } from '../energy/baseTargets';
import { DEFAULT_ACTIVITY_LEVEL } from '../energy/energyEstimate';
import { DEFAULT_HOME_TIME_ZONE } from './dates';
import {
  DRINKING_DAY_CUTOVER_MINUTES,
  FLOOR_KJ,
  KICKSTART_MAX_DEFICIT_PCT,
  MODERATE_NET_CARB_CEILING_G,
  NET_CARB_CEILING_G,
  RAPID_LOSS_THRESHOLD_G_PER_WEEK,
  RAPID_LOSS_WEEKS,
  SAT_FAT_BUDGET_PCT,
  STEADY_DEFICIT_PCT,
} from './limits';
import { type Id, type Instant, INSTANT_MIN } from './primitives';
import type {
  BackupTableName,
  BeverageRecord,
  GardenRecord,
  ProfileRecord,
  SettingsRecord,
  Snapshot,
  StoreRecords,
  TargetsRecord,
} from './records';
import { BACKUP_TABLES, stableStringify } from './tables';

/** What seeding needs: the creation time and fresh ids. */
export interface SeedEnv {
  readonly now: Instant;
  randomId(): Id;
}

export const SINGLETON_ID = 'singleton';
/** GL-08. */
export const DEFAULT_STORE_NAME = "PAK'nSAVE Pāpāmoa";
/** The seeded drink preset's name (REQUIREMENTS section 2; UX 5a). */
export const DEFAULT_BEVERAGE_NAME = 'Zero-sugar premix';
/** The seeded garden row's name (UX 1f; C57). Item 18 MUST define seed:silverbeet. */
export const DEFAULT_GARDEN_NAME = 'Silverbeet';

export function defaultProfile(now: Instant): ProfileRecord {
  return {
    id: SINGLETON_ID,
    heightCm: null,
    sex: null,
    birthYear: null,
    activityLevel: DEFAULT_ACTIVITY_LEVEL,
    equipmentBands: false,
    equipmentDumbbells: false,
    jogOptIn: false,
    householdSize: 1,
    dietMode: 'keto',
    carbCeilingStartedAt: null,
    firstLowCarbAt: null,
    kickstartOptIn: true,
    goalKg: null,
    goalSetAt: null,
    goalReferenceKg: null,
    allergens: [],
    dislikeIngredientIds: [],
    dislikeTerms: [],
    glutenFreeHousehold: false,
    budgetNote: null,
    storeName: DEFAULT_STORE_NAME,
    createdAt: now,
    updatedAt: now,
  };
}

/** The fasting preset and window stay null: item 13 sets 23:1 or 22:2, or leaves them null while fasting is gated (C07). */
export function defaultTargets(now: Instant): TargetsRecord {
  return {
    id: SINGLETON_ID,
    proteinRangeG: { min: DEFAULT_PROTEIN_RANGE_G.min, max: DEFAULT_PROTEIN_RANGE_G.max },
    netCarbCeilingG: NET_CARB_CEILING_G.default,
    moderateNetCarbCeilingG: MODERATE_NET_CARB_CEILING_G.default,
    saturatedFatBudgetPct: SAT_FAT_BUDGET_PCT.default,
    kickstartDeficitPct: KICKSTART_MAX_DEFICIT_PCT,
    steadyDeficitPct: STEADY_DEFICIT_PCT.default,
    energyFloorKj: FLOOR_KJ,
    fibreGuideG: null,
    waterTargetMl: null,
    fastingPreset: null,
    eatingWindow: null,
    presetChosenBy: null,
    refluxPreferEarlier: false,
    refluxPreferSplit: false,
    updatedAt: now,
  };
}

export function defaultSettings(): SettingsRecord {
  return {
    id: SINGLETON_ID,
    onboardingCompletedAt: null,
    alcoholNoticeAckAt: null,
    profileConfirmedAt: null,
    scheduleConfirmedAt: null,
    gardenConfirmedAt: null,
    lastBackupAt: null,
    theme: 'system',
    textSize: 'standard',
    homeTimeZone: DEFAULT_HOME_TIME_ZONE,
    drinkingDayCutoverMinutes: DRINKING_DAY_CUTOVER_MINUTES.default,
    rapidLossThresholdGPerWeek: RAPID_LOSS_THRESHOLD_G_PER_WEEK.default,
    rapidLossConsecutiveWeeks: RAPID_LOSS_WEEKS.default,
    rapidLossExplanationReadAt: null,
    alcoholGuidanceSet: null,
    weeklyPattern: null,
    hiddenSeedIds: [],
  };
}

/**
 * The default drink preset: 330 mL at 5% with 94 kcal on the label and no printed standard-drinks
 * figure, so the calculated 1.30 applies. Marked 'preset-default' until the owner saves the label,
 * so the screen says "Check against your can's label" (NN-01; D42).
 */
export function defaultBeverage(env: SeedEnv): BeverageRecord {
  return {
    id: env.randomId(),
    name: DEFAULT_BEVERAGE_NAME,
    volumeMl: 330,
    abvPercent: 5,
    label: {
      volumeMl: 330,
      abvPercent: 5,
      standardDrinks: null,
      kcal: 94,
      energyAsEntered: { value: 94, unit: 'kcal' },
      origin: 'preset-default',
    },
    sortOrder: 0,
    archived: false,
    createdAt: env.now,
    updatedAt: env.now,
  };
}

/** Silverbeet, available with no amount entered (UX 1f; C57). */
export function defaultGarden(env: SeedEnv): GardenRecord {
  return {
    id: env.randomId(),
    ingredientId: 'seed:silverbeet',
    name: DEFAULT_GARDEN_NAME,
    amount: null,
    unit: null,
    gramsPerUnit: null,
    harvestReady: true,
    harvestedAt: null,
    perishabilityDays: null,
    updatedAt: env.now,
  };
}

/** The rows written when the database is created (section 6). */
export function populateRows(env: SeedEnv): {
  profile: [ProfileRecord];
  targets: [TargetsRecord];
  settings: [SettingsRecord];
  beverages: [BeverageRecord];
  garden: [GardenRecord];
} {
  return {
    profile: [defaultProfile(env.now)],
    targets: [defaultTargets(env.now)],
    settings: [defaultSettings()],
    beverages: [defaultBeverage(env)],
    garden: [defaultGarden(env)],
  };
}

/** The default row of each singleton store (used when a rescue file's singleton cannot be kept). */
export function defaultSingleton(
  table: 'profile' | 'targets' | 'settings',
  now: Instant,
): ProfileRecord | TargetsRecord | SettingsRecord {
  return table === 'profile'
    ? defaultProfile(now)
    : table === 'targets'
      ? defaultTargets(now)
      : defaultSettings();
}

const without = (row: unknown, fields: readonly string[]): string | null => {
  if (typeof row !== 'object' || row === null || Array.isArray(row)) return null;
  const kept = Object.entries(row as Record<string, unknown>).filter(([k]) => !fields.includes(k));
  return stableStringify(Object.fromEntries(kept));
};

const SEED_EQUAL_APART_FROM: Readonly<Partial<Record<string, readonly string[]>>> = {
  profile: ['createdAt', 'updatedAt'],
  targets: ['updatedAt'],
  // The alcohol notice's acknowledgement is written before setup offers a restore (C53), so a new
  // browser restoring from setup still holds nothing of the owner's (full review F14, F22).
  settings: ['alcoholNoticeAckAt'],
  beverages: ['id', 'createdAt', 'updatedAt'],
  garden: ['id', 'updatedAt'],
};

/**
 * Whether a row is still exactly as a new database seeds it (section 6), apart from its id and
 * timestamps: the default profile, targets and settings, the default drink preset and the
 * silverbeet garden row. The import confirmation does not count such rows as the owner's records,
 * so restoring onto a new phone, or after delete-all, warns of no loss (data-loss and ux reviews).
 */
export function isUntouchedSeedRow(table: string, row: unknown): boolean {
  const ignored = SEED_EQUAL_APART_FROM[table];
  if (ignored === undefined) return false;
  const env: SeedEnv = { now: INSTANT_MIN, randomId: () => '' };
  const seeded = (populateRows(env) as unknown as Record<string, readonly unknown[]>)[table] ?? [];
  const actual = without(row, ignored);
  return actual !== null && seeded.some((seed) => without(seed, ignored) === actual);
}

/** A fresh database's backed-up stores: the seed rows, and every other store empty. */
export function defaultSnapshot(env: SeedEnv): Snapshot {
  const seeded: Partial<{ [K in BackupTableName]: StoreRecords[K][] }> = populateRows(env);
  return Object.fromEntries(
    BACKUP_TABLES.map((name) => [name, seeded[name] ?? []]),
  ) as unknown as Snapshot;
}
