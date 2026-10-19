/**
 * One hand-written interface per IndexedDB store, version 1 (storage spec section 4; D1).
 *
 * Every field is present: a field that can be empty is set to null, never left out
 * (exactOptionalPropertyTypes; section 2.1). Fields are in spec order, the order a backup file
 * writes them. Field names are camelCase and match the core types; store names are snake_case as
 * in DATA_MODEL.md. specs/v1.ts holds the validators, typed so that a missing or extra field here
 * is a compile error there.
 */
import type { DrinkMeasure } from '../alcohol/standardDrinks';
import type { ActivityLevel } from '../energy/energyEstimate';
import type { ClockTime, EatingWindow, FastingPresetId } from '../fasting/eatingWindow';
import type { NutritionSource, Confidence } from '../nutrition/confidence';
import type { CarbBasis, Nutrients } from '../nutrition/nutrients';
import type { LocalDate } from '../util/time';
import type { Allergen, UserAllergen } from './allergens';
import type { CardId } from './cards';
import type { Id, Instant, RefId, SeedId, StoredCryptoKey, TimeZone, YesNo } from './primitives';
import type { ReadinessId } from './readiness';

export type NutrientKey = keyof Nutrients;
export type DietMode = 'keto' | 'moderate-low-carb' | 'balanced';
export type ProfileSex = 'female' | 'male';
export type AlcoholGuidanceSet = 'nz-women' | 'nz-men';
export type NutrientBasis = 'raw' | 'cooked' | 'as-sold';
export type Theme = 'system' | 'light' | 'dark';
export type TextSize = 'standard' | 'large' | 'largest';

// ---- You: profile, readiness, targets, settings (section 4.4) ----

export interface ProfileRecord {
  id: 'singleton';
  heightCm: number | null;
  sex: ProfileSex | null;
  birthYear: number | null;
  activityLevel: ActivityLevel;
  equipmentBands: boolean;
  equipmentDumbbells: boolean;
  jogOptIn: boolean;
  householdSize: number;
  dietMode: DietMode;
  /**
   * Set whenever the keto ceiling becomes active: each switch into keto, Kickstart start, and a
   * readiness gate that had closed the keto ceiling (Q1, Q2, Q5, a birth year that may be under 18
   * or a low current weight; D30 as changed) opening again while in keto mode after setup. Counted
   * in elapsed time (C72). It drives only the C72 electrolyte reminder; never the Kickstart phase,
   * notes, band or rapid-loss suppression, which come only from kickstart_periods (D27; item 13
   * E65), so changing an answer can never grant another rapid-loss-free window.
   */
  carbCeilingStartedAt: Instant | null;
  /** Set once, never reset; counted in elapsed time (C109). */
  firstLowCarbAt: Instant | null;
  kickstartOptIn: boolean;
  goalKg: number | null;
  goalSetAt: Instant | null;
  goalReferenceKg: number | null;
  allergens: UserAllergen[];
  dislikeIngredientIds: RefId[];
  dislikeTerms: string[];
  glutenFreeHousehold: boolean;
  budgetNote: string | null;
  storeName: string;
  createdAt: Instant;
  updatedAt: Instant;
}

export interface ReadinessRecord {
  questionId: ReadinessId;
  answer: YesNo;
  wordingVersion: number;
  answeredAt: Instant;
}

export interface ProteinRangeRecord {
  min: number;
  max: number;
}

export interface TargetsRecord {
  id: 'singleton';
  proteinRangeG: ProteinRangeRecord;
  netCarbCeilingG: number;
  moderateNetCarbCeilingG: number;
  saturatedFatBudgetPct: number;
  kickstartDeficitPct: number;
  steadyDeficitPct: number;
  energyFloorKj: number;
  fibreGuideG: number | null;
  waterTargetMl: number | null;
  fastingPreset: FastingPresetId | 'custom' | null;
  eatingWindow: EatingWindow | null;
  presetChosenBy: 'kickstart-default' | 'default' | 'user' | null;
  refluxPreferEarlier: boolean;
  refluxPreferSplit: boolean;
  updatedAt: Instant;
}

export interface WeeklyPatternDay {
  /** ISO weekday, Monday = 1. */
  weekday: number;
  /** Session templates in code; an empty list is a rest day. */
  templateIds: SeedId[];
}

export interface SettingsRecord {
  id: 'singleton';
  onboardingCompletedAt: Instant | null;
  alcoholNoticeAckAt: Instant | null;
  profileConfirmedAt: Instant | null;
  scheduleConfirmedAt: Instant | null;
  gardenConfirmedAt: Instant | null;
  /** Written only when the owner confirms they can see an exported file (section 10.5; D21). */
  lastBackupAt: Instant | null;
  theme: Theme;
  textSize: TextSize;
  homeTimeZone: TimeZone;
  drinkingDayCutoverMinutes: number;
  rapidLossThresholdGPerWeek: number;
  rapidLossConsecutiveWeeks: 2 | 3;
  rapidLossExplanationReadAt: Instant | null;
  alcoholGuidanceSet: AlcoholGuidanceSet | null;
  weeklyPattern: WeeklyPatternDay[] | null;
  hiddenSeedIds: SeedId[];
}

// ---- Phase: kickstart_periods, kickstart_checks (section 4.5) ----

export type KickstartEndReason = 'left-keto' | 'readiness-gated' | 'user-ended';

export interface KickstartPeriodRecord {
  id: Id;
  startedAt: Instant;
  timeZone: TimeZone;
  /** Written only for an early end. */
  endedAt: Instant | null;
  endedTimeZone: TimeZone | null;
  endReason: KickstartEndReason | null;
}

export type KickstartOutcome = 'extended' | 'stop-sign';

export interface KickstartCheckRecord {
  id: Id;
  periodId: Id;
  askedAt: Instant;
  timeZone: TimeZone;
  dizzyOnStanding: YesNo;
  palpitations: YesNo;
  crampsNotSettling: YesNo;
  faintAtWork: YesNo;
  energyRating: number | null;
  sleepRating: number | null;
  outcome: KickstartOutcome;
}

// ---- Body logs (section 4.6) ----

export interface WeightRecord {
  id: Id;
  at: Instant;
  timeZone: TimeZone;
  kg: number;
  source: 'onboarding' | 'manual';
  note: string | null;
}

export interface FastRecord {
  id: Id;
  startedAt: Instant;
  timeZone: TimeZone;
  endedAt: Instant | null;
  endedTimeZone: TimeZone | null;
  plannedFastMinutes: number | null;
  snackTime: ClockTime | null;
  dinnerTime: ClockTime | null;
  note: string | null;
}

export interface SymptomRecord {
  id: Id;
  at: Instant;
  timeZone: TimeZone;
  symptom: 'heartburn' | 'night-cough' | 'regurgitation';
  severity: number | null;
  note: string | null;
}

export interface WaterRecord {
  id: Id;
  at: Instant;
  timeZone: TimeZone;
  ml: number;
  electrolyte: boolean;
}

export interface StepsRecord {
  date: LocalDate;
  steps: number;
  source: 'manual';
  updatedAt: Instant;
}

// ---- Food (section 4.7) ----

/**
 * One shape for the seed dataset in code (ids are SeedIds) and the owner's own foods in the
 * `ingredients` store (ids are Ids).
 */
export interface IngredientRecord {
  id: RefId;
  name: string;
  aliases: string[];
  aisle: string;
  packSizesG: number[];
  packSizeSource: 'typical' | 'owner' | null;
  packSizeEnteredAt: Instant | null;
  nutrientsPer100g: Nutrients;
  unknownNutrients: NutrientKey[];
  carbBasisAsEntered: CarbBasis;
  nutrientBasis: NutrientBasis;
  cookedYield: number | null;
  yieldCitation: string | null;
  source: NutritionSource;
  sourceCitation: string | null;
  /** Null means unknown, the default for every label entry (C43). */
  allergens: Allergen[] | null;
  gardenFlag: boolean;
  seasonMonths: number[];
  substitutes: RefId[];
  gramsPerEach: number | null;
  servingSizeG: number | null;
  createdAt: Instant;
  updatedAt: Instant;
}

export interface IngredientNutritionChange {
  nutrientsPer100g: Nutrients;
  unknownNutrients: NutrientKey[];
  carbBasisAsEntered: CarbBasis;
  nutrientBasis: NutrientBasis;
  source: NutritionSource;
  sourceCitation: string | null;
}

/** One correction to a seed ingredient (D2; section 4.7). */
export type IngredientChange =
  | { field: 'name'; value: string }
  | { field: 'aliases'; value: string[] }
  | { field: 'aisle'; value: string }
  | { field: 'packSizes'; value: { packSizesG: number[]; enteredAt: Instant } }
  | { field: 'nutrition'; value: IngredientNutritionChange }
  | { field: 'addAllergens'; value: Allergen[] | null }
  | { field: 'substitutes'; value: RefId[] }
  | { field: 'gramsPerEach'; value: number | null }
  | { field: 'servingSizeG'; value: number | null }
  | { field: 'seasonMonths'; value: number[] }
  | { field: 'gardenFlag'; value: boolean };

export interface IngredientOverrideRecord {
  seedId: SeedId;
  changes: IngredientChange[];
  createdAt: Instant;
  updatedAt: Instant;
}

export interface RecipeLine {
  ingredientId: RefId;
  rawG: number;
  cookedG: number | null;
  displayAs: string | null;
}

export interface SourceMix {
  label: number;
  'nz-fcdb': number;
  usda: number;
  estimate: number;
}

export interface RecipeRecord {
  id: Id;
  title: string;
  serves: number;
  timeMinutes: number | null;
  lines: RecipeLine[];
  method: string[];
  tags: string[];
  allergens: Allergen[];
  derivedFromRecipeId: RefId | null;
  nutritionPerServe: Nutrients;
  unknownNutrients: NutrientKey[];
  confidence: 'database' | 'estimate';
  sourceMix: SourceMix;
  createdAt: Instant;
  updatedAt: Instant;
}

export type MealSlot = 'breakfast' | 'lunch' | 'meal1' | 'snack' | 'dinner';

export interface PlannedMealRecord {
  slot: MealSlot;
  recipeId: RefId;
  myServes: number;
  householdServes: number;
}

export interface PlanDayRecord {
  date: LocalDate;
  dietMode: DietMode;
  meals: PlannedMealRecord[];
  eatingWindow: EatingWindow | null;
  updatedAt: Instant;
}

export type FoodSourceKind = 'plan' | 'recipe' | 'label' | 'estimate';

export interface FoodLogRecord {
  id: Id;
  at: Instant;
  timeZone: TimeZone;
  sourceKind: FoodSourceKind;
  refId: string | null;
  name: string;
  grams: number | null;
  weightBasis: NutrientBasis | null;
  servings: number | null;
  nutrients: Nutrients;
  unknownNutrients: NutrientKey[];
  confidence: Confidence;
}

// ---- Garden and pantry (section 4.8) ----

export interface GardenRecord {
  id: Id;
  ingredientId: RefId | null;
  name: string;
  amount: number | null;
  unit: 'g' | 'each' | 'bunch' | null;
  gramsPerUnit: number | null;
  harvestReady: boolean;
  harvestedAt: LocalDate | null;
  perishabilityDays: number | null;
  updatedAt: Instant;
}

/** Device only, never in a backup (C49; item 19). */
export interface GardenPhotoRecord {
  gardenId: Id;
  mimeType: 'image/jpeg' | 'image/webp';
  bytes: ArrayBuffer;
  width: number;
  height: number;
  takenAt: Instant;
}

export interface PantryRecord {
  id: Id;
  ingredientId: RefId | null;
  name: string;
  amount: number | null;
  unit: 'g' | 'ml' | 'each' | null;
  updatedAt: Instant;
}

// ---- Move: sessions (section 4.9) ----

export interface SetResult {
  reps: number | null;
  seconds: number | null;
}

export interface SessionMovement {
  exerciseId: SeedId;
  variant: 'standard' | 'easier' | 'harder' | 'band' | 'dumbbell';
  sets: number;
  reps: number | null;
  seconds: number | null;
  /** One entry per ticked set, with what was actually done (C76). */
  done: SetResult[];
}

export interface PreCheck {
  painOrInjury: YesNo;
  backOrLegSymptoms: YesNo;
  tiredOrPoorSleep: YesNo;
  heatOrSun: YesNo;
  notHydrated: YesNo;
  heavyWorkDay: YesNo;
}

export interface SessionRecord {
  id: Id;
  date: LocalDate;
  templateId: SeedId;
  status: 'planned' | 'done' | 'rested' | 'skipped';
  movements: SessionMovement[];
  preCheck: PreCheck | null;
  exertion: number | null;
  soreness: number | null;
  energy: number | null;
  durationMinutes: number | null;
  completedAt: Instant | null;
  timeZone: TimeZone | null;
  note: string | null;
}

// ---- Drinks (section 4.10) ----

/** A label tied to the measure it was read for; assignable to core DrinkLabel. */
export interface StoredDrinkLabel extends DrinkMeasure {
  volumeMl: number;
  abvPercent: number;
  standardDrinks: number | null;
  kcal: number | null;
  /** The energy as typed (C31): null iff kcal is null. */
  energyAsEntered: { value: number; unit: 'kcal' | 'kJ' } | null;
  origin: 'owner' | 'preset-default';
}

/** A drink's measure and label as stored; assignable to core Beverage. */
export interface StoredBeverage extends DrinkMeasure {
  volumeMl: number;
  abvPercent: number;
  label: StoredDrinkLabel | null;
}

export interface BeverageRecord {
  id: Id;
  name: string;
  volumeMl: number;
  abvPercent: number;
  label: StoredDrinkLabel | null;
  sortOrder: number;
  archived: boolean;
  createdAt: Instant;
  updatedAt: Instant;
}

export interface DrinkLogRecord {
  id: Id;
  at: Instant;
  timeZone: TimeZone;
  beverageId: RefId | null;
  name: string;
  count: number;
  beverage: StoredBeverage;
  /** Unrounded (C94). */
  stdDrinksPerServe: number;
  stdSource: 'label' | 'calculated';
  kcalPerServe: number | null;
}

export interface AlcoholDayNoteRecord {
  date: LocalDate;
  note: string | null;
  withdrawalTick: boolean;
  enteredAt: Instant;
  timeZone: TimeZone;
  updatedAt: Instant;
}

/** Entered by the owner or a clinician; the app never creates one (HS section 5). */
export interface AlcoholMilestoneRecord {
  id: Id;
  label: string;
  weeklyStdDrinks: number;
  fromDate: LocalDate;
  enteredBy: 'self' | 'clinician';
  note: string | null;
  createdAt: Instant;
}

// ---- List and transfer (section 4.11) ----

export interface PriceRecord {
  amountNzCents: number;
  basis: 'line' | 'per_kg' | 'each';
  enteredAt: Instant;
}

export interface GroceryItem {
  id: Id;
  origin: 'generated' | 'manual';
  ingredientId: RefId | null;
  text: string;
  quantity: number | null;
  unit: 'g' | 'ml' | 'each' | 'pack' | null;
  packSuggestion: string | null;
  aisle: string;
  substituteHint: string | null;
  section: 'to-buy' | 'already-have';
  fromGardenG: number | null;
  gardenAmountUnknown: boolean;
  fromPantryG: number | null;
  auditNote: string | null;
  price: PriceRecord | null;
  ticked: boolean;
}

export interface GroceryListRecord {
  id: Id;
  version: number;
  createdAt: Instant;
  updatedAt: Instant;
  storeName: string;
  sentVersion: number | null;
  sentAt: Instant | null;
  transferId: Id | null;
  receivedVersion: number | null;
  receivedAt: Instant | null;
  laptopReceivedAt: Instant | null;
  items: GroceryItem[];
}

/** Device only, never in a backup (C49). Item 30 owns the shape. */
export interface TransferPairingRecord {
  id: 'singleton';
  relayUrl: string;
  roomId: string;
  key: StoredCryptoKey;
  pairedAt: Instant;
}

// ---- App state (section 4.12) ----

export interface CardStateRecord {
  cardId: CardId;
  trigger: string;
  firstShownAt: Instant | null;
  dismissedAt: Instant | null;
  dismissedTimeZone: TimeZone | null;
  doneAt: Instant | null;
}

export interface AuditRecord {
  id: Id;
  at: Instant;
  timeZone: TimeZone;
  kind: 'grocery' | 'migration';
  table: BackupTableName;
  recordId: string;
  reason: string;
}

/** Every store and its record type, in the order of section 4.1. */
export interface StoreRecords {
  profile: ProfileRecord;
  readiness: ReadinessRecord;
  targets: TargetsRecord;
  settings: SettingsRecord;
  kickstart_periods: KickstartPeriodRecord;
  kickstart_checks: KickstartCheckRecord;
  weights: WeightRecord;
  fasts: FastRecord;
  symptom_log: SymptomRecord;
  water_log: WaterRecord;
  steps_log: StepsRecord;
  ingredients: IngredientRecord;
  ingredient_overrides: IngredientOverrideRecord;
  recipes: RecipeRecord;
  plan_days: PlanDayRecord;
  food_log: FoodLogRecord;
  garden: GardenRecord;
  garden_photos: GardenPhotoRecord;
  pantry: PantryRecord;
  sessions: SessionRecord;
  beverages: BeverageRecord;
  drinks_log: DrinkLogRecord;
  alcohol_day_notes: AlcoholDayNoteRecord;
  alcohol_milestones: AlcoholMilestoneRecord;
  grocery_lists: GroceryListRecord;
  transfer_pairings: TransferPairingRecord;
  card_state: CardStateRecord;
  audit: AuditRecord;
}

export type StoreName = keyof StoreRecords;
export type DeviceOnlyTableName = 'garden_photos' | 'transfer_pairings';
export type BackupTableName = Exclude<StoreName, DeviceOnlyTableName>;

/** Every backed-up store's rows (a backup's tables, or a read of the database). */
export type Snapshot = { readonly [K in BackupTableName]: readonly StoreRecords[K][] };

/** The device-only stores, which never leave the phone. */
export type DeviceOnlySnapshot = {
  readonly [K in DeviceOnlyTableName]: readonly StoreRecords[K][];
};
