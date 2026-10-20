import { readFileSync } from 'node:fs';
import { join, posix, resolve } from 'node:path';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';
import { isTestFile, listRepoFiles } from './scan';

// Item 18 (S6; HS-36, X6): the app never reads a food's figures or allergens around core's
// functions. A stored 0 that stands for "not known" can only be read through knownFigure,
// totalRows and per100gRows, and a food's allergens only through foodAllergenFacts, so a
// brand-dependent list is never read as complete. The synthetic food data stays in tests.
const root = resolve(import.meta.dirname, '../..');
const files = listRepoFiles(root);
const read = (path: string) => readFileSync(join(root, path), 'utf8');
const isCode = (f: string) => /\.[cm]?[jt]sx?$/.test(f);
const TEST_DATA = 'packages/core/src/foods/testData';

const FIGURE_READ =
  /\.\s*(?:nutrientsPer100g|nutritionPerServe)\b|\[\s*['"`](?:nutrientsPer100g|nutritionPerServe)['"`]\s*\]/;
const ALLERGENS_IF_COMPLETE = /\ballergensIfComplete\b/;

/** What a file breaks: app code reading figures or the raw allergen list, or test data in shipped code. */
function foodsHomeProblems(file: string, code: string): string[] {
  if (!isCode(file) || isTestFile(file)) return [];
  const problems: string[] = [];
  if (file.startsWith('apps/mobile-web/src/') && FIGURE_READ.test(code))
    problems.push('figure-read');
  const allergensHome =
    file.startsWith('packages/core/src/foods/') || file.startsWith('packages/core/src/storage/');
  if (!allergensHome && ALLERGENS_IF_COMPLETE.test(code)) problems.push('allergens-if-complete');
  if (!file.startsWith('packages/test-fixtures/') && file.replace(/\.ts$/, '') !== TEST_DATA) {
    const imports = ts.preProcessFile(code, true, true).importedFiles.map((f) => f.fileName);
    const target = (s: string) =>
      s.startsWith('.') ? posix.join(posix.dirname(file), s).replace(/\.ts$/, '') : s;
    if (imports.some((s) => s === '@diet/core/foods/testData' || target(s) === TEST_DATA))
      problems.push('test-data');
  }
  return problems;
}

describe('S6: figures and allergens only through core; test food data only in tests (item 18)', () => {
  it('finds the app source and the food test data', () => {
    expect(files).toContain('apps/mobile-web/src/screens/foods/foodsModel.ts');
    expect(files).toContain(`${TEST_DATA}.ts`);
  });

  it('no file breaks the rules', () => {
    const found = files.flatMap((f) => foodsHomeProblems(f, read(f)).map((p) => `${f}: ${p}`));
    expect(found).toEqual([]);
  });

  it.each([
    [
      'apps/mobile-web/src/screens/Today.tsx',
      'const kj = view.nutrientsPer100g.energyKj;',
      'figure-read',
    ],
    ['apps/mobile-web/src/x.ts', 'const p = recipe?.nutritionPerServe.proteinG;', 'figure-read'],
    ['apps/mobile-web/src/x.ts', "const n = food['nutrientsPer100g'];", 'figure-read'],
    [
      'apps/mobile-web/src/x.tsx',
      'const list = view.allergensIfComplete ?? [];',
      'allergens-if-complete',
    ],
    [
      'packages/core/src/recipes/lines.ts',
      'return v.allergensIfComplete;',
      'allergens-if-complete',
    ],
    [
      'apps/mobile-web/src/x.ts',
      "import { exampleRelease } from '@diet/core/foods/testData';",
      'test-data',
    ],
    [
      'packages/core/src/foods/view.ts',
      "import { exampleCatalogue } from './testData';",
      'test-data',
    ],
  ])('refuses %s: %s', (file, code, problem) => {
    expect(foodsHomeProblems(file, code)).toEqual([problem]);
  });

  it('allows the same in tests, in core foods and storage, and test data in test-fixtures', () => {
    expect(foodsHomeProblems('apps/mobile-web/src/x.test.ts', 'view.nutrientsPer100g;')).toEqual(
      [],
    );
    expect(
      foodsHomeProblems('packages/core/src/foods/allergens.ts', 'v.allergensIfComplete'),
    ).toEqual([]);
    expect(
      foodsHomeProblems(
        'packages/test-fixtures/src/foods/f.ts',
        "export * from '@diet/core/foods/testData';",
      ),
    ).toEqual([]);
    expect(
      foodsHomeProblems('apps/mobile-web/src/x.ts', 'const row = { nutrientsPer100g: n };'),
    ).toEqual([]);
  });
});
