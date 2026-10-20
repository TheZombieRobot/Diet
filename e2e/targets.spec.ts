import { expect, type Page, test } from '@playwright/test';
import type {
  DrinkLogRecord,
  FoodLogRecord,
  KickstartPeriodRecord,
  PlanDayRecord,
  ProfileRecord,
  Snapshot,
  TargetsRecord,
} from '../packages/core/src/index';
import { alcohol, targets } from '../packages/core/src/copy/health';
import {
  fixtureId,
  onDay,
  WEIGHT_SCENARIOS,
  type WeightScenarioOptions,
  weightScenario,
} from '../packages/test-fixtures/src/index';
import { commerceRules, healthPhraseRules } from '../tools/scans/rules';
import { scanText } from '../tools/scans/scan';
import { goTo, renderedText, waitForServiceWorkerControl } from './support/app';
import { restoreSnapshot, storeRows } from './support/scenario';

// Diet and targets and the Nutrition today card in the production build (item 21 design section
// 6.4): WT-06, WT-07, HS-09, HS-10, HS-25, FL-04, C11, C56, PWA-03. Each test restores a synthetic
// scenario onto a new phone with the clock fixed on its day 10 at 09:00, New Zealand time.
test.use({ timezoneId: 'Pacific/Auckland' });

/** Male, 185 cm, born 1969, an active job, keto, 100 kg every day, a Kickstart from day 1. */
const MALE: WeightScenarioOptions = {
  ...WEIGHT_SCENARIOS.K10,
  ratesKgPerWeek: [0],
  heightCm: 185,
  goalKg: null,
  profile: { sex: 'male', birthYear: 1969, activityLevel: 'active-job' },
};
/** Female, 160 cm, born 1929, mostly sitting, 55 kg, a Kickstart from day 1. */
const FEMALE: WeightScenarioOptions = {
  ...MALE,
  startKg: 55,
  heightCm: 160,
  profile: { sex: 'female', birthYear: 1929, activityLevel: 'sedentary' },
};

const at = (time: string) => new Date(`2000-02-10T${time}:00+13:00`).toISOString();

const MEAL: FoodLogRecord = {
  id: fixtureId(41_001),
  at: at('08:00'),
  timeZone: 'Pacific/Auckland',
  sourceKind: 'estimate',
  refId: null,
  name: 'Example breakfast',
  grams: 400,
  weightBasis: 'raw',
  servings: null,
  nutrients: {
    energyKj: 7000,
    proteinG: 60,
    fatG: 50,
    saturatedFatG: 40,
    carbsG: 0,
    sugarsG: 0,
    fibreG: 5,
    sodiumMg: 500,
  },
  unknownNutrients: [],
  confidence: 'estimate',
};

/** Six 330 mL cans of a 5% premix with 94 kcal on the label. */
const SIX_CANS: DrinkLogRecord = {
  id: fixtureId(41_002),
  at: at('08:30'),
  timeZone: 'Pacific/Auckland',
  beverageId: null,
  name: 'Example premix',
  count: 6,
  beverage: {
    volumeMl: 330,
    abvPercent: 5,
    label: {
      volumeMl: 330,
      abvPercent: 5,
      standardDrinks: null,
      kcal: 94,
      energyAsEntered: { value: 94, unit: 'kcal' },
      origin: 'owner',
    },
  },
  stdDrinksPerServe: 1.30185,
  stdSource: 'calculated',
  kcalPerServe: 94,
};

const PLAN_DAY: PlanDayRecord = {
  date: '2000-02-11',
  dietMode: 'keto',
  meals: [{ slot: 'dinner', recipeId: 'seed:example-recipe', myServes: 1, householdServes: 3 }],
  eatingWindow: null,
  updatedAt: at('07:00'),
};

/** Opens the app on the scenario's day 10 at 09:00 and restores it, with any extra rows. */
async function scenario(
  page: Page,
  options: WeightScenarioOptions,
  extra: Partial<Snapshot> = {},
): Promise<void> {
  const seen = onDay(options, 10);
  await page.clock.setFixedTime(new Date(seen.now));
  await page.goto('./');
  await restoreSnapshot(page, { ...weightScenario(seen), ...extra }, seen.now);
}

const card = (page: Page) => page.getByRole('region', { name: targets.today.label });
/** The meter of a Nutrition row, by its label. */
const meter = (page: Page, label: string) =>
  card(page)
    .locator('.ui-meter')
    .filter({ has: page.locator('.ui-meter__label', { hasText: label }) });
const meterValue = (page: Page, label: string) => meter(page, label).locator('.ui-meter__value');
const radio = (page: Page, name: string) =>
  page.getByRole('radio', { name: new RegExp(`^${name}`) });
const change = (page: Page) => page.getByRole('button', { name: targets.dietMode.change }).click();

test('WT-07, HS-09, C11: a Kickstart day, saturated fat over budget, and alcohol as its own part', async ({
  page,
}) => {
  await scenario(page, MALE, { food_log: [MEAL], drinks_log: [SIX_CANS] });
  await expect(meterValue(page, targets.today.energy)).toHaveText('9,360 of 10,162 kJ');
  await expect(meterValue(page, targets.today.protein)).toHaveText('60 of 140 g');
  await expect(meterValue(page, targets.today.netCarbs)).toHaveText('0 / 20 g');
  await expect(meterValue(page, targets.today.satFat)).toHaveText('40 / 27 g');
  await expect(meter(page, targets.today.satFat)).toHaveAttribute('data-state', 'over');
  await expect(meter(page, targets.today.energy)).toHaveAttribute('data-state', 'normal');
  await expect(card(page).locator('[data-part="alcohol"]')).toHaveText([
    'Food 7,000 kJ · Alcohol 2,360 kJ',
  ]);
  const found = scanText('Today', await renderedText(page), [
    ...healthPhraseRules,
    ...commerceRules,
  ]);
  expect(found.map((v) => v.ruleId)).toEqual([]);

  await goTo(page, 'Diet and targets');
  await expect(page.getByText('10,162 kJ (about 2,430 kcal)')).toBeVisible();
  await expect(
    page.getByText(
      'Kickstart: 30% below the rough guide, with protein held at 140 g and net carbs at 20 g.',
    ),
  ).toBeVisible();
  await expect(page.getByText(alcohol.dayEnergy.foodOnly)).toBeVisible();
});

test('WT-06, HS-10: a 5,000 kJ floor day, and a floor below 5,000 is refused and never stored', async ({
  page,
}) => {
  await scenario(page, FEMALE);
  await expect(meterValue(page, targets.today.energy)).toHaveText('0 of 5,000 kJ');
  await expect(meterValue(page, targets.today.protein)).toHaveText('0 of 140 g');
  await goTo(page, 'Diet and targets');
  await expect(page.getByText(/^This is the energy floor\./)).toBeVisible();
  const floor = page.getByRole('textbox', { name: targets.energy.floorLabel });
  await floor.fill('4000');
  await page
    .getByRole('region', { name: targets.energy.label })
    .getByRole('button', { name: targets.form.save })
    .click();
  await expect(page.getByText(targets.energy.floorTooLow)).toBeVisible();
  await page.reload();
  await expect(page.getByRole('textbox', { name: targets.energy.floorLabel })).toHaveValue('5,000');
  const [stored] = await storeRows<TargetsRecord>(page, 'targets');
  expect(stored?.energyFloorKj).toBe(5000);
});

test('FL-04, PWA-03: offline, switching to Balanced and back deletes nothing and re-applies the ceiling', async ({
  page,
  context,
}) => {
  await scenario(page, { ...MALE, periods: [] }, { food_log: [MEAL], plan_days: [PLAN_DAY] });
  await waitForServiceWorkerControl(page);
  const stores = ['food_log', 'plan_days', 'targets', 'weights', 'readiness', 'kickstart_periods'];
  const before = await Promise.all(stores.map((s) => storeRows(page, s)));
  await context.setOffline(true);

  await goTo(page, 'Diet and targets');
  await radio(page, targets.dietMode.names.balanced).check();
  await change(page);
  await expect(page.getByText('Diet mode is now Balanced.')).toBeVisible();
  await goTo(page, 'Today');
  await expect(meterValue(page, targets.today.netCarbs)).toHaveText('0 g');
  await expect(meter(page, targets.today.netCarbs).locator('svg')).toHaveCount(0);
  await goTo(page, 'Diet and targets');
  await radio(page, targets.dietMode.names.keto).check();
  await change(page);
  await expect(page.getByText('Diet mode is now Keto-preferred.')).toBeVisible();
  await page.reload();
  await goTo(page, 'Today');
  await expect(meterValue(page, targets.today.netCarbs)).toHaveText('0 / 30 g');

  expect(await Promise.all(stores.map((s) => storeRows(page, s)))).toEqual(before);
  const [profile] = await storeRows<ProfileRecord>(page, 'profile');
  expect(profile?.dietMode).toBe('keto');
});

test('FL-04, C56: leaving keto during Kickstart asks first, and ends it only when confirmed', async ({
  page,
}) => {
  await scenario(page, MALE);
  await goTo(page, 'Diet and targets');
  await radio(page, targets.dietMode.names.balanced).check();
  await change(page);
  await expect(page.getByText(targets.dietMode.leaveKickstart.title)).toBeFocused();
  await page.getByRole('button', { name: targets.dietMode.leaveKickstart.cancel }).click();
  await expect(radio(page, targets.dietMode.names.keto)).toBeChecked();
  const [kept] = await storeRows<KickstartPeriodRecord>(page, 'kickstart_periods');
  expect(kept?.endReason).toBeNull();

  await radio(page, targets.dietMode.names.balanced).check();
  await change(page);
  await page.getByRole('button', { name: targets.dietMode.leaveKickstart.confirm }).click();
  await expect(page.getByText('Diet mode is now Balanced.')).toBeVisible();
  const [ended] = await storeRows<KickstartPeriodRecord>(page, 'kickstart_periods');
  expect(ended?.endReason).toBe('left-keto');

  await radio(page, targets.dietMode.names.keto).check();
  await change(page);
  await expect(page.getByText('Diet mode is now Keto-preferred.')).toBeVisible();
  expect(await storeRows(page, 'kickstart_periods')).toHaveLength(1);
  await goTo(page, 'Today');
  await expect(meterValue(page, targets.today.netCarbs)).toHaveText('0 / 30 g');
});
