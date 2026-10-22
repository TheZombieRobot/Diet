import { readFileSync } from 'node:fs';
import { join, posix, resolve } from 'node:path';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';
import { isTestFile, listRepoFiles } from './scan';

// Item 22 (design 5.5): where the planner's rules may live. (1) One writer of planned meals: the
// plan_days store is named only by the database, its repository, the recipes repository's reads
// and the test kit's seed helper. (2) The fasting preset reaches the planner only through
// planner/schedule.ts (cross-item ruling 2), and no planner screen reads a stored window. (3) The
// planner never reads drinks (C11). (4) The app-made write kinds are named in one screen file, the
// unbuilt kinds in none. (5) Refusal sentences are chosen only in screens/planner/reasonText.ts.
// (6) The planner's synthetic test data stays in tests.
const root = resolve(import.meta.dirname, '../..');
const files = listRepoFiles(root);
const read = (path: string) => readFileSync(join(root, path), 'utf8');

const APP = 'apps/mobile-web/src/';
const PLAN_DAYS_HOME = [
  `${APP}db/db.ts`,
  `${APP}db/repos/planDays.ts`,
  // Item 20's reads of planned recipe ids, inside its own read transactions.
  `${APP}db/repos/recipes.ts`,
  // seedPlanDay, for other items' tests.
  `${APP}db/testKit.ts`,
];
const STORE_BY_NAME = [
  /\bdb\s*\.\s*plan_days\b/,
  /\btable\s*(?:<[^>]*>)?\s*\(\s*['"`]plan_days['"`]\s*\)/,
  /\btableOf\s*(?:<[^>]*>)?\s*\([^,)]*,\s*['"`]plan_days['"`]\s*\)/,
  /\bcrudRepo\s*(?:<[^>]*>)?\s*\([^,)]*,\s*['"`]plan_days['"`]\s*\)/,
];
const PLANNER_SCREENS = `${APP}screens/planner/`;
const PLANNER_CORE = 'packages/core/src/planner/';
const TEST_DATA_HOMES = ['packages/test-fixtures/', `${APP}testSetup/`];

const isSource = (f: string) => /\.[cm]?tsx?$/.test(f) && !isTestFile(f);

function plannerHomeProblems(file: string, code: string): string[] {
  if (!isSource(file)) return [];
  const problems: string[] = [];
  const inScope = file.startsWith(APP) || file.startsWith('packages/core/src/');
  if (inScope && !PLAN_DAYS_HOME.includes(file) && STORE_BY_NAME.some((r) => r.test(code)))
    problems.push('plan-days-writer');
  const plannerFile = file.startsWith(PLANNER_SCREENS) || file.startsWith(PLANNER_CORE);
  if (
    plannerFile &&
    file !== `${PLANNER_CORE}schedule.ts` &&
    /\.fastingPreset\b|\.presetChosenBy\b|\beffectiveFastingPreset\b/.test(code)
  )
    problems.push('preset-outside-schedule');
  if (file.startsWith(PLANNER_SCREENS) && /\.eatingWindow\b/.test(code))
    problems.push('stored-window-in-screen');
  if (
    (plannerFile || file === `${APP}screens/fasting/mealSources.ts`) &&
    /\bdrinks\b|\bdrinks_log\b|\bdayIntake\b/.test(code)
  )
    problems.push('drinks');
  if (file.startsWith(`${APP}screens/`)) {
    if (file !== `${PLANNER_SCREENS}actions.ts` && /['"`](?:auto-fill|copy)['"`]/.test(code))
      problems.push('app-made-kind');
    if (/['"`](?:template|repeat|suggested-swap)['"`]/.test(code)) problems.push('unbuilt-kind');
  }
  if (
    file.startsWith(PLANNER_SCREENS) &&
    file !== `${PLANNER_SCREENS}reasonText.ts` &&
    /\bplanner\.(?:reasons|refused)\./.test(code)
  )
    problems.push('refusal-wording');
  if (
    file !== `${PLANNER_CORE}testData.ts` &&
    !TEST_DATA_HOMES.some((home) => file.startsWith(home))
  ) {
    const imports = ts.preProcessFile(code, true, true).importedFiles.map((f) => f.fileName);
    const target = (s: string) =>
      s.startsWith('.') ? posix.join(posix.dirname(file), s).replace(/\.ts$/, '') : s;
    if (
      imports.some(
        (s) => s === '@diet/core/planner/testData' || target(s) === `${PLANNER_CORE}testData`,
      )
    )
      problems.push('test-data');
  }
  return problems;
}

describe('where the planner’s rules live (item 22 scan; V32, rulings 2, C11, P41)', () => {
  it('reads the planner’s files, and no file breaks the rules', () => {
    expect(files).toContain(`${PLANNER_SCREENS}reasonText.ts`);
    expect(files).toContain(`${PLANNER_CORE}schedule.ts`);
    const found = files.flatMap((f) => plannerHomeProblems(f, read(f)).map((p) => `${f}: ${p}`));
    expect(found).toEqual([]);
  });

  it.each([
    [`${APP}screens/Example.tsx`, 'await db.plan_days.put(row);', 'plan-days-writer'],
    [`${APP}db/repos/other.ts`, "const t = crudRepo(ctx, 'plan_days');", 'plan-days-writer'],
    [`${PLANNER_CORE}rank.ts`, 'const p = targets.fastingPreset;', 'preset-outside-schedule'],
    [`${PLANNER_SCREENS}Week.tsx`, 'const w = row.eatingWindow;', 'stored-window-in-screen'],
    [`${PLANNER_CORE}figures.ts`, 'const d = records.drinks;', 'drinks'],
    [`${APP}screens/planner/FoodPlanner.tsx`, "writeMeals({ kind: 'auto-fill' })", 'app-made-kind'],
    [`${APP}screens/recipes/X.tsx`, "writeMeals({ kind: 'suggested-swap' })", 'unbuilt-kind'],
    [`${PLANNER_SCREENS}PlanDayScreen.tsx`, 'const t = planner.refused.slot;', 'refusal-wording'],
    [`${APP}screens/planner/x.ts`, "import { R } from '@diet/core/planner/testData';", 'test-data'],
  ])('seeded: %s with %s fails %s', (file, code, problem) => {
    expect(plannerHomeProblems(file, code)).toContain(problem);
  });

  it('the allowed homes and tests pass', () => {
    expect(plannerHomeProblems(`${APP}db/repos/planDays.ts`, 'db.plan_days.put(row);')).toEqual([]);
    expect(plannerHomeProblems(`${PLANNER_CORE}schedule.ts`, 'effectiveFastingPreset(t)')).toEqual(
      [],
    );
    expect(plannerHomeProblems(`${PLANNER_SCREENS}actions.ts`, "kind: 'copy'")).toEqual([]);
    expect(plannerHomeProblems(`${PLANNER_SCREENS}reasonText.ts`, 'planner.refused.slot')).toEqual(
      [],
    );
    expect(
      plannerHomeProblems(`${APP}testSetup/plannerData.ts`, "from '@diet/core/planner/testData'"),
    ).toEqual([]);
    expect(plannerHomeProblems(`${APP}screens/x.test.tsx`, 'db.plan_days.put(row)')).toEqual([]);
  });
});
