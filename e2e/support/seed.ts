import { expect, type Page } from '@playwright/test';
import {
  BACKUP_TABLES,
  localDateOf,
  readinessGates,
  type Snapshot,
  validateRow,
  weightGateInput,
} from '../../packages/core/src/index';
import { onboarding } from '../../packages/core/src/copy/health';
import { weightScenario, type WeightScenarioOptions } from '../../packages/test-fixtures/src/index';
import { heading } from './app';

/**
 * A finished setup for the fasting specs (item 15 design 7.4): every readiness answer "no" unless
 * given, a synthetic profile (male, born 1960, 175 cm, keto), one onboarding weigh-in of 82 kg
 * (well above BMI 18.5) on `today`, and a 22:2 pattern unless given. Built with item 14's
 * scenario builder, so it is the same shape as a backup.
 */
export function fastingSetup(
  today: string,
  options: Partial<WeightScenarioOptions> = {},
): Snapshot {
  return weightScenario({
    day1: today,
    today,
    startKg: 82,
    heightCm: 175,
    goalKg: null,
    ratesKgPerWeek: [0],
    days: (day) => day === 1,
    ...options,
    profile: { sex: 'male', birthYear: 1960, kickstartOptIn: false, ...options.profile },
  });
}

/**
 * Writes the records of a new phone with raw IndexedDB and reloads (design 7.4, seedRecords).
 * Every row is checked with the app's own validator here first, and the seeded readiness gate is
 * asserted: fasting open, unless the test expects it gated.
 */
export async function seedRecords(
  page: Page,
  snapshot: Snapshot,
  options: { readonly now: string; readonly expectGated?: boolean },
): Promise<void> {
  for (const table of BACKUP_TABLES) {
    for (const row of snapshot[table]) validateRow(table, row);
  }
  const settings = snapshot.settings[0];
  const profile = snapshot.profile[0];
  if (settings === undefined || profile === undefined) throw new Error('no singletons');
  const gates = readinessGates(
    weightGateInput(
      {
        readiness: snapshot.readiness,
        profile,
        weights: snapshot.weights,
        homeTimeZone: settings.homeTimeZone,
      },
      localDateOf(options.now, settings.homeTimeZone),
      options.now,
    ),
  );
  expect(gates.fastingGated).toBe(options.expectGated ?? false);

  await page.clock.setFixedTime(new Date(options.now));
  await page.goto('./');
  // A new phone shows Welcome; a phone seeded earlier in the test shows its records.
  await expect(heading(page)).toHaveText(new RegExp(`^(?:${onboarding.welcome.title}|Today)$`));
  await page.evaluate(
    (tables) =>
      new Promise<void>((resolve, reject) => {
        const request = indexedDB.open('diet');
        request.onerror = () => {
          reject(new Error('open failed'));
        };
        request.onsuccess = () => {
          const db = request.result;
          const tx = db.transaction(Object.keys(tables), 'readwrite');
          for (const [name, rows] of Object.entries(tables)) {
            const store = tx.objectStore(name);
            store.clear();
            for (const row of rows) store.put(row);
          }
          tx.oncomplete = () => {
            db.close();
            resolve();
          };
          tx.onerror = () => {
            reject(new Error('write failed'));
          };
        };
      }),
    Object.fromEntries(BACKUP_TABLES.map((name) => [name, snapshot[name]])),
  );
  await page.reload();
  await expect(heading(page)).toHaveText('Today');
}
