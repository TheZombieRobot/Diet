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

/** `db`, or a property or element named db (`ctx.db`, `this.db`), through brackets and casts. */
function isDatabase(node: ts.Expression): boolean {
  let e = node;
  while (ts.isParenthesizedExpression(e) || ts.isNonNullExpression(e) || ts.isAsExpression(e))
    e = e.expression;
  if (ts.isIdentifier(e)) return e.text === 'db';
  if (ts.isPropertyAccessExpression(e)) return e.name.text === 'db';
  if (ts.isElementAccessExpression(e))
    return ts.isStringLiteralLike(e.argumentExpression) && e.argumentExpression.text === 'db';
  return false;
}

/** A binding element that takes the property `recipes` (`{ recipes }`, `{ recipes: r }`, `{ ['recipes']: r }`). */
function bindsRecipes(element: ts.BindingElement): boolean {
  const key = element.propertyName ?? element.name;
  if (ts.isIdentifier(key) || ts.isStringLiteralLike(key)) return key.text === 'recipes';
  if (ts.isComputedPropertyName(key))
    return ts.isStringLiteralLike(key.expression) && key.expression.text === 'recipes';
  return false;
}

/**
 * The store reached through the database object in a form the patterns above miss (item 20
 * review): `db['recipes']`, `db?.recipes`, `const { recipes } = db` or `{ recipes: r } = ctx.db`.
 */
function reachesStoreInCode(file: string, code: string): boolean {
  const source = ts.createSourceFile(file, code, ts.ScriptTarget.Latest, true);
  let found = false;
  const visit = (node: ts.Node): void => {
    if (found) return;
    if (
      (ts.isPropertyAccessExpression(node) &&
        node.name.text === 'recipes' &&
        isDatabase(node.expression)) ||
      (ts.isElementAccessExpression(node) &&
        ts.isStringLiteralLike(node.argumentExpression) &&
        node.argumentExpression.text === 'recipes' &&
        isDatabase(node.expression)) ||
      (ts.isVariableDeclaration(node) &&
        ts.isObjectBindingPattern(node.name) &&
        node.initializer !== undefined &&
        isDatabase(node.initializer) &&
        node.name.elements.some(bindsRecipes))
    ) {
      found = true;
      return;
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return found;
}

function recipesHomeProblems(file: string, code: string): string[] {
  if (!/\.[cm]?[jt]sx?$/.test(file) || isTestFile(file)) return [];
  const problems: string[] = [];
  if (
    file.startsWith('apps/mobile-web/src/') &&
    !RECIPES_HOME.includes(file) &&
    (STORE_BY_NAME.some((rule) => rule.test(code)) || reachesStoreInCode(file, code))
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
    ['apps/mobile-web/src/screens/y.ts', "db['recipes'].put(row);"],
    ['apps/mobile-web/src/screens/y.ts', 'ctx.db?.recipes.put(row);'],
    ['apps/mobile-web/src/screens/y.ts', 'const { recipes } = db;\nrecipes.put(row);'],
    ['apps/mobile-web/src/screens/y.ts', 'const { recipes: store } = ctx.db;'],
    ['apps/mobile-web/src/screens/y.ts', "const { ['recipes']: store } = ctx.db as Db;"],
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
    // The repository's own name for the recipes, and other objects' recipes, are not the store.
    expect(
      recipesHomeProblems(
        'apps/mobile-web/src/x.ts',
        'storage.repos.recipes.list(); const { recipes } = state.rows;',
      ),
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
