import { describe, expect, it } from 'vitest';
import { EMPTY_RELEASE } from './dataset';
import {
  exampleAttribution,
  exampleCatalogue,
  exampleCatalogueCopy,
  exampleRelease,
} from './testData';
import type { DatabaseSource } from './types';
import { type FoodDataProblem, validateFoodCatalogue, validateNutrientRelease } from './validate';

type Copy = ReturnType<typeof exampleCatalogueCopy>;
type Food = Record<string, unknown>;

/** The example catalogue with one change; foods: 0 green, 1 protein, 2 its cooked form, 3 oil. */
function broken(change: (c: Copy, f: readonly Food[]) => void): Copy {
  const c = exampleCatalogueCopy();
  change(c, c.foods);
  return c;
}
const food = (f: readonly Food[], i: number): Food => f[i] ?? {};
const problems = (raw: unknown) =>
  validateFoodCatalogue(raw, { shippedChecks: false }).map((p) => `${p.path} ${p.rule}`);

describe('NU-01: catalogue rules CR1–CR20 (item 18 design 2.4)', () => {
  it('the example catalogue is valid without the shipped checks', () => {
    expect(validateFoodCatalogue(exampleCatalogue, { shippedChecks: false })).toEqual([]);
  });

  it.each<[string, unknown, string[]]>([
    ['CR1 not an object', null, [' shape']],
    ['CR1 version', broken((c) => (c.version = 2)), ['version enum']],
    ['CR1 revisedOn', broken((c) => (c.revisedOn = 'yesterday')), ['revisedOn format']],
    ['CR1 foods', { version: 1, revisedOn: '2000-01-01', foods: {} }, ['foods type']],
    [
      'CR2 a nutrient figure hidden in the catalogue',
      broken((_, f) => (food(f, 0)['proteinG'] = 3)),
      ['foods[0].proteinG extra-key'],
    ],
    ['CR2 a missing key', broken((_, f) => delete food(f, 0)['loose']), ['foods[0].loose missing']],
    [
      'CR2 __proto__',
      JSON.parse(
        JSON.stringify(exampleCatalogue).replace(
          '"id":"seed:example-oil"',
          '"__proto__":{},"id":"seed:example-oil"',
        ),
      ),
      ['foods[3].__proto__ forbidden-key'],
    ],
    ['CR3 id format', broken((_, f) => (food(f, 3)['id'] = 'Seed:Oil')), ['foods[3].id format']],
    [
      'CR3 ids unique',
      broken((_, f) => (food(f, 3)['id'] = 'seed:example-green')),
      ['foods[3].id unique'],
    ],
    ['CR4 name text', broken((_, f) => (food(f, 3)['name'] = ' Oil')), ['foods[3].name format']],
    [
      'CR4 Kūmara and kumara collide',
      broken((_, f) => {
        food(f, 0)['name'] = 'Kūmara';
        food(f, 3)['aliases'] = ['kumara'];
      }),
      ['foods[3].aliases[0] duplicate-name'],
    ],
    [
      'CR4 an alias equal to its own name',
      broken((_, f) => (food(f, 1)['aliases'] = ['example PROTEIN food'])),
      ['foods[1].aliases[0] duplicate-name'],
    ],
    [
      'CR5 at most 10 aliases',
      broken((_, f) => (food(f, 3)['aliases'] = Array.from({ length: 11 }, (_, i) => `Oil ${i}`))),
      ['foods[3].aliases range'],
    ],
    ['CR6 aisle', broken((_, f) => (food(f, 3)['aisle'] = 'Deli')), ['foods[3].aisle enum']],
    ['CR6 group', broken((_, f) => (food(f, 3)['group'] = 'fat')), ['foods[3].group enum']],
    [
      'CR7 a cooked form with packs',
      broken((_, f) => (food(f, 2)['packs'] = food(f, 1)['packs'])),
      ['foods[2].packs packs'],
    ],
    [
      'CR7 sizes ascending',
      broken((_, f) => (food(f, 3)['packs'] = { unit: 'ml', sizes: [1000, 500], container: null })),
      ['foods[3].packs.sizes order'],
    ],
    [
      'CR7 counts are whole',
      broken((_, f) => (food(f, 0)['packs'] = { unit: 'each', sizes: [1.5], container: null })),
      ['foods[0].packs.sizes[0] range'],
    ],
    [
      'CR7 a container on a counted pack',
      broken(
        (_, f) =>
          (food(f, 0)['packs'] = { unit: 'each', sizes: [1], container: { one: 'a', many: 'b' } }),
      ),
      ['foods[0].packs.container packs'],
    ],
    [
      'CR8 grams per each for a counted pack',
      broken((_, f) => (food(f, 0)['gramsPerEach'] = null)),
      ['foods[0].gramsPerEach grams-per-each'],
    ],
    [
      'CR9 a count word only when counted',
      broken((_, f) => (food(f, 1)['countWord'] = { one: 'pack', many: 'packs' })),
      ['foods[1].countWord count-word'],
    ],
    [
      'CR9 a counted pack without a count word',
      broken((_, f) => (food(f, 0)['countWord'] = null)),
      ['foods[0].countWord count-word'],
    ],
    [
      'CR10 allergens in order',
      broken((_, f) => (food(f, 3)['allergens'] = ['sesame', 'peanut'])),
      ['foods[3].allergens order'],
    ],
    [
      'CR10 a known allergen',
      broken((_, f) => (food(f, 3)['allergens'] = ['nuts'])),
      ['foods[3].allergens[0] enum'],
    ],
    [
      'CR11 a packed food is never complete',
      broken((_, f) => (food(f, 3)['allergensComplete'] = true)),
      ['foods[3].allergensComplete allergens-complete'],
    ],
    [
      'CR11 nor a packed single food',
      broken((_, f) => {
        food(f, 3)['id'] = 'seed:olive-oil';
        food(f, 3)['allergensComplete'] = true;
      }),
      ['foods[3].allergensComplete allergens-complete'],
    ],
    [
      'CR11 a packed single food has no allergen',
      broken((_, f) => {
        food(f, 3)['id'] = 'seed:olive-oil';
        food(f, 3)['allergens'] = ['sesame'];
      }),
      ['foods[3].allergens allergens-complete'],
    ],
    [
      'CR12 fish without fish',
      broken((_, f) => {
        food(f, 1)['allergens'] = [];
        food(f, 2)['allergens'] = [];
      }),
      ['foods[1].allergens inherent-allergen', 'foods[2].allergens inherent-allergen'],
    ],
    [
      'CR12 tofu without soy',
      broken((_, f) => (food(f, 3)['group'] = 'tofu')),
      ['foods[3].allergens inherent-allergen'],
    ],
    [
      'CR13 pasta without wheat',
      broken((_, f) => {
        food(f, 3)['id'] = 'seed:pasta';
        food(f, 3)['group'] = 'grain';
      }),
      ['foods[3].allergens inherent-allergen'],
    ],
    [
      'CR14 garden foods are produce',
      broken((_, f) => (food(f, 3)['gardenFlag'] = true)),
      ['foods[3].gardenFlag garden'],
    ],
    [
      'CR15 months',
      broken((_, f) => (food(f, 0)['seasonMonths'] = [13])),
      ['foods[0].seasonMonths[0] range'],
    ],
    [
      'CR15 seasons are produce',
      broken((_, f) => (food(f, 3)['seasonMonths'] = [1])),
      ['foods[3].seasonMonths season'],
    ],
    [
      'CR16 cooked basis with no raw form',
      broken((_, f) => (food(f, 3)['basis'] = 'cooked')),
      ['foods[3].cookedOf cooked-form'],
    ],
    [
      'CR17 a cooked form of itself',
      broken((_, f) => (food(f, 2)['cookedOf'] = 'seed:example-protein-cooked')),
      ['foods[2].cookedOf cooked-form'],
    ],
    [
      'CR17 a cooked form with other allergens',
      broken((_, f) => (food(f, 2)['allergens'] = ['egg', 'fish'])),
      ['foods[2].cookedOf cooked-form'],
    ],
    [
      'CR18 a substitute that is itself',
      broken((_, f) => (food(f, 1)['substitutes'] = ['seed:example-protein'])),
      ['foods[1].substitutes[0] substitute'],
    ],
    [
      'CR18 an unknown substitute',
      broken((_, f) => (food(f, 1)['substitutes'] = ['seed:example-none'])),
      ['foods[1].substitutes[0] substitute'],
    ],
    [
      'CR18 a cooked form as a substitute',
      broken((_, f) => (food(f, 3)['substitutes'] = ['seed:example-protein-cooked'])),
      ['foods[3].substitutes[0] substitute'],
    ],
    [
      'CR19 import hint',
      broken((_, f) => (food(f, 3)['importHint'] = '')),
      ['foods[3].importHint format'],
    ],
    [
      'CR20 a lean food called "Mince"',
      broken((_, f) => {
        food(f, 1)['importHint'] = 'raw, lean';
        food(f, 1)['aliases'] = ['Mince'];
      }),
      ['foods[1].aliases[0] lean-name'],
    ],
  ])('%s', (_name, raw, expected) => {
    expect(problems(raw)).toEqual(expected);
  });

  it('collects every problem and never throws, whatever it is given', () => {
    for (const raw of [undefined, 'text', 3, [], { foods: [null, 'x', {}] }]) {
      expect(() => validateFoodCatalogue(raw)).not.toThrow();
    }
    expect(
      problems(
        broken((_, f) => {
          food(f, 3)['aisle'] = 'Deli';
          food(f, 0)['name'] = '';
        }),
      ),
    ).toEqual(['foods[0].name format', 'foods[3].aisle enum']);
  });
});

describe('NU-01 HS-36: release rules R1–R12', () => {
  const catalogue = exampleCatalogue;
  const check = (
    raw: unknown,
    approved: readonly DatabaseSource[] = ['usda'],
    attr = exampleAttribution,
  ) =>
    validateNutrientRelease(raw, catalogue, approved, attr).map(
      (p: FoodDataProblem) => `${p.path} ${p.rule}`,
    );
  const release = (
    change: (r: Record<string, Record<string, unknown>>) => void,
    source: DatabaseSource = 'usda',
  ) => {
    const r = JSON.parse(JSON.stringify(exampleRelease(source))) as {
      foods: Record<string, Record<string, unknown>>;
      sources: Record<string, unknown>[];
    };
    change(r.foods);
    return r;
  };
  const values = (r: Record<string, Record<string, unknown>>, id: string) =>
    r[id]?.['values'] as Record<string, Record<string, unknown> | null>;
  const G = 'foods["seed:example-green"]';

  it('the empty release is valid with nothing approved; an example release with its source approved and attributed', () => {
    expect(check(EMPTY_RELEASE, [])).toEqual([]);
    expect(check(exampleRelease('usda'))).toEqual([]);
    expect(check(exampleRelease('nz-fcdb'), ['nz-fcdb'])).toEqual([]);
  });

  it('R3 R4 R12: a source that is not approved, or has no attribution, or anything while nothing is approved', () => {
    expect(check(exampleRelease('usda'), ['nz-fcdb'])).toEqual(['sources[0].id not-approved']);
    expect(check(exampleRelease('usda'), ['usda'], {})).toEqual(['sources[0].id no-attribution']);
    expect(check(exampleRelease('usda'), [])).toEqual([
      'sources release-not-empty',
      'foods release-not-empty',
      'sources[0].id not-approved',
    ]);
  });

  it.each<[string, Record<string, unknown>, string[], DatabaseSource?]>([
    [
      'R5 an unknown seed',
      release((r) => (r['seed:example-none'] = { ...r['seed:example-green'], foodId: 'X9' })),
      ['foods["seed:example-none"] unknown-food'],
    ],
    [
      'R6 a row whose source is not listed',
      release((r) => {
        const row = r['seed:example-green'] ?? {};
        row['source'] = 'nz-fcdb';
        for (const v of Object.values(values(r, 'seed:example-green')))
          if (v) v['source'] = 'nz-fcdb';
      }),
      [`${G}.source value-source`],
    ],
    [
      'R7 a value tagged with another source',
      release((r) => ((values(r, 'seed:example-green')['proteinG'] ?? {})['source'] = 'nz-fcdb')),
      [`${G}.values.proteinG.source value-source`],
    ],
    [
      'R7 sodium in grams',
      release((r) => ((values(r, 'seed:example-green')['sodiumMg'] ?? {})['unit'] = 'g')),
      [`${G}.values.sodiumMg.unit unit`],
    ],
    [
      'R7 kcal on an NZ row',
      release(
        (r) => ((values(r, 'seed:example-green')['energyKj'] ?? {})['unit'] = 'kcal'),
        'nz-fcdb',
      ),
      [`${G}.values.energyKj.unit unit`],
      'nz-fcdb',
    ],
    [
      'R7 -0',
      release((r) => ((values(r, 'seed:example-green')['fatG'] ?? {})['value'] = -0)),
      [`${G}.values.fatG.value range`],
    ],
    [
      'R7 NaN',
      release((r) => ((values(r, 'seed:example-green')['fatG'] ?? {})['value'] = Number.NaN)),
      [`${G}.values.fatG.value range`],
    ],
    [
      'R8 a row with no figure',
      release((r) => {
        const v = values(r, 'seed:example-green');
        for (const k of Object.keys(v)) v[k] = null;
      }),
      [`${G}.values empty-row`],
    ],
    [
      'R9 4,000 kJ per 100 g',
      release((r) => ((values(r, 'seed:example-green')['energyKj'] ?? {})['value'] = 4000)),
      [`${G}.values.energyKj limit`],
    ],
    [
      'R11 two seeds matched to one database food',
      release((r) => ((r['seed:example-protein-cooked'] ?? {})['foodId'] = 'X2')),
      ['foods["seed:example-protein-cooked"].foodId unique'],
    ],
  ])('%s', (_name, raw, expected, source = 'usda') => {
    expect(check(raw, [source])).toEqual(expected);
  });

  it('R10: the citation must fit 200 characters', () => {
    const r = JSON.parse(JSON.stringify(exampleRelease('usda'))) as {
      sources: Record<string, unknown>[];
      foods: Record<string, Record<string, unknown>>;
    };
    const source = r.sources[0] ?? {};
    source['title'] = 'T'.repeat(120);
    source['edition'] = 'E'.repeat(60); // "T…, E…, food X1" is 191 characters
    expect(check(r)).toEqual([]);
    (r.foods['seed:example-green'] ?? {})['foodId'] = 'X'.repeat(12);
    expect(check(r)).toEqual([`${G}.foodId citation-length`]);
  });

  it('never throws, whatever it is given', () => {
    for (const raw of [null, 'text', { version: 1, sources: [null], foods: { x: 1 } }]) {
      expect(() =>
        validateNutrientRelease(raw, catalogue, ['usda'], exampleAttribution),
      ).not.toThrow();
    }
  });
});
