import { readFileSync } from 'node:fs';
import { join, posix, resolve } from 'node:path';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';
import { isTestFile, listRepoFiles } from './scan';

// Item 20 (design 6.3 and 8.5; HS-24): the app reaches the recipes store only through its
// repository, which keeps every allergen on every write, so no screen or other repository can
// write a recipe around the allergen union. The generic writers that loop over every store by a
// variable name (restore, upgrade, delete-all) never name it. The synthetic recipe test data
// stays in tests.
const root = resolve(import.meta.dirname, '../..');
const files = listRepoFiles(root);
const read = (path: string) => readFileSync(join(root, path), 'utf8');

const RECIPES_HOME = ['apps/mobile-web/src/db/db.ts', 'apps/mobile-web/src/db/repos/recipes.ts'];
const TEST_DATA = 'packages/core/src/recipes/testData';

/** `db.recipes`, `table('recipes')`, `tableOf(…, 'recipes')`, `crudRepo(…, "recipes")`, any spacing. */
const STORE_BY_NAME = [
  /\bdb\s*\.\s*recipes\b/,
  /\btable\s*(?:<[^>]*>)?\s*\(\s*['"`]recipes['"`]\s*\)/,
  /\btableOf\s*(?:<[^>]*>)?\s*\([^,)]*,\s*['"`]recipes['"`]\s*\)/,
  /\bcrudRepo\s*(?:<[^>]*>)?\s*\([^,)]*,\s*['"`]recipes['"`]\s*\)/,
];

function recipesHomeProblems(file: string, code: string): string[] {
  if (!/\.[cm]?[jt]sx?$/.test(file) || isTestFile(file)) return [];
  const problems: string[] = [];
  if (
    file.startsWith('apps/mobile-web/src/') &&
    !RECIPES_HOME.includes(file) &&
    STORE_BY_NAME.some((rule) => rule.test(code))
  )
    problems.push('recipes-store');
  if (!file.startsWith('packages/test-fixtures/') && file.replace(/\.ts$/, '') !== TEST_DATA) {
    const imports = ts.preProcessFile(code, true, true).importedFiles.map((f) => f.fileName);
    const target = (s: string) =>
      s.startsWith('.') ? posix.join(posix.dirname(file), s).replace(/\.ts$/, '') : s;
    if (imports.some((s) => s === '@diet/core/recipes/testData' || target(s) === TEST_DATA))
      problems.push('test-data');
  }
  return problems;
}

describe('the recipes store only through its repository; recipe test data only in tests (item 20)', () => {
  it('finds the repository and the test data', () => {
    expect(files).toContain('apps/mobile-web/src/db/repos/recipes.ts');
    expect(files).toContain(`${TEST_DATA}.ts`);
  });

  it('no file breaks the rules', () => {
    const found = files.flatMap((f) => recipesHomeProblems(f, read(f)).map((p) => `${f}: ${p}`));
    expect(found).toEqual([]);
  });

  it.each([
    ['apps/mobile-web/src/screens/x.tsx', 'await db.recipes.put(row);'],
    ['apps/mobile-web/src/db/repos/plan.ts', "db.table('recipes').bulkAdd(rows);"],
    ['apps/mobile-web/src/db/repos/other.ts', "export const r = crudRepo(ctx, 'recipes');"],
    ['apps/mobile-web/src/x.ts', 'tableOf(db, "recipes").toArray();'],
  ])('refuses %s: %s', (file, code) => {
    expect(recipesHomeProblems(file, code)).toEqual(['recipes-store']);
  });

  it('allows the repository, tests, other stores, and the test data in test-fixtures', () => {
    expect(
      recipesHomeProblems('apps/mobile-web/src/db/repos/recipes.ts', 'db.recipes.add(r);'),
    ).toEqual([]);
    expect(recipesHomeProblems('apps/mobile-web/src/x.test.ts', 'db.recipes.add(r);')).toEqual([]);
    expect(
      recipesHomeProblems('apps/mobile-web/src/x.ts', "crudRepo(ctx, 'recipe_notes');"),
    ).toEqual([]);
    expect(
      recipesHomeProblems(
        'apps/mobile-web/src/x.ts',
        "import { fixtureFoods } from '@diet/core/recipes/testData';",
      ),
    ).toEqual(['test-data']);
    expect(
      recipesHomeProblems(
        'packages/test-fixtures/src/r.ts',
        "export * from '@diet/core/recipes/testData';",
      ),
    ).toEqual([]);
  });
});
