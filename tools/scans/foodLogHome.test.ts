import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { isTestFile, listRepoFiles } from './scan';

// Item 23 (design 5.5 S2; HS-R23): every food_log row the app writes is built by a core builder
// inside the food log repository. The store is named only by the database and that repository,
// and app code outside db/ never calls the generic foodLog.create or foodLog.update (they stay for
// tests and restore), so no screen can store a figure the builders would not make.
const root = resolve(import.meta.dirname, '../..');
const files = listRepoFiles(root);
const read = (path: string) => readFileSync(join(root, path), 'utf8');

const APP = 'apps/mobile-web/src/';
const FOOD_LOG_HOME = [`${APP}db/db.ts`, `${APP}db/repos/foodLog.ts`];

/** `db.food_log`, `table('food_log')`, `tableOf(…, 'food_log')`, `crudRepo(…, 'food_log')`, `db['food_log']`. */
const STORE_BY_NAME = [
  /\bdb\s*\??\.\s*food_log\b/,
  /\bdb\s*\[\s*['"`]food_log['"`]\s*\]/,
  /\btable\s*(?:<[^>]*>)?\s*\(\s*['"`]food_log['"`]\s*\)/,
  /\btableOf\s*(?:<[^>]*>)?\s*\([^,)]*,\s*['"`]food_log['"`]\s*\)/,
  /\bcrudRepo\s*(?:<[^>]*>)?\s*\([^,)]*,\s*['"`]food_log['"`]\s*\)/,
];
/** The generic writers, which take a row as given. */
const GENERIC_WRITE = /\bfoodLog\s*\??\.\s*(?:create|update)\s*\(/;

function foodLogHomeProblems(file: string, code: string): string[] {
  if (!/\.[cm]?[jt]sx?$/.test(file) || isTestFile(file) || !file.startsWith(APP)) return [];
  const problems: string[] = [];
  if (!FOOD_LOG_HOME.includes(file) && STORE_BY_NAME.some((rule) => rule.test(code)))
    problems.push('food-log-store');
  if (!file.startsWith(`${APP}db/`) && GENERIC_WRITE.test(code)) problems.push('generic-write');
  return problems;
}

describe('the food log only through its repository (item 23; HS-R23)', () => {
  it('finds the repository', () => {
    expect(files).toContain(`${APP}db/repos/foodLog.ts`);
  });

  it('no file breaks the rules', () => {
    const found = files.flatMap((f) => foodLogHomeProblems(f, read(f)).map((p) => `${f}: ${p}`));
    expect(found).toEqual([]);
  });

  it.each([
    [`${APP}screens/x.tsx`, 'await db.food_log.put(row);', 'food-log-store'],
    [`${APP}db/repos/other.ts`, "export const r = crudRepo(ctx, 'food_log');", 'food-log-store'],
    [`${APP}screens/y.ts`, "db['food_log'].add(row);", 'food-log-store'],
    [`${APP}screens/y.ts`, 'storage.repos.foodLog.create(row);', 'generic-write'],
    [`${APP}screens/y.ts`, 'repos.foodLog?.update(id, patch);', 'generic-write'],
  ])('refuses %s: %s', (file, code, problem) => {
    expect(foodLogHomeProblems(file, code)).toEqual([problem]);
  });

  it('allows the repository, tests, db/ and the builders', () => {
    expect(foodLogHomeProblems(`${APP}db/repos/foodLog.ts`, 'db.food_log.add(r);')).toEqual([]);
    expect(foodLogHomeProblems(`${APP}x.test.tsx`, 'repos.foodLog.create(r);')).toEqual([]);
    expect(foodLogHomeProblems(`${APP}db/testKit.ts`, 'repos.foodLog.create(r);')).toEqual([]);
    expect(
      foodLogHomeProblems(`${APP}screens/z.tsx`, 'storage.repos.foodLog.logLabel({ foodId });'),
    ).toEqual([]);
  });
});
