import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { alcoholStructureProblems, isAlcoholScanned } from './alcoholStructure';
import { listRepoFiles } from './scan';

// Item 28 design 6.2 S1 (HS-07, HS-08, HS-19, C11; HEALTH_SAFETY section 5): what the alcohol code
// may import and name, and where its writes live. Each rule is proven by one seeded file.
const root = resolve(import.meta.dirname, '../..');

const rules = (file: string, text: string) =>
  alcoholStructureProblems(file, text).map((p) => p.rule);

describe('the alcohol code keeps its shape (S1)', () => {
  it('the repository passes, and the scan reads the alcohol code and the energy engine', () => {
    const files = listRepoFiles(root).filter(isAlcoholScanned);
    expect(files).toContain('packages/core/src/alcohol/helpCard.ts');
    expect(files).toContain('apps/mobile-web/src/screens/drinks/LogCard.tsx');
    expect(files).toContain('packages/core/src/targets/energy.ts');
    const problems = files.flatMap((f) =>
      alcoholStructureProblems(f, readFileSync(join(root, f), 'utf8')),
    );
    expect(problems).toEqual([]);
  });

  it('a: core alcohol code importing the storage module whole, or the energy engine, fails', () => {
    expect(
      rules(
        'packages/core/src/alcohol/example.ts',
        "import { x } from '../storage';\nimport { y } from '../energy/age';\nimport { z } from '../storage/dates';\n",
      ),
    ).toEqual(['core-import', 'core-import']);
  });

  it('b: a Drinks screen reading weigh-ins or a height fails (no blood-alcohol estimate can be built)', () => {
    expect(
      rules(
        'apps/mobile-web/src/screens/drinks/Example.tsx',
        'const w = await storage.repos.weights.list();\nconst h = profile.heightCm;\n',
      ),
    ).toEqual(['body-input', 'body-input']);
  });

  it.each([
    "import { FLOOR_KJ } from '../storage/limits';",
    'const most = MAX_RAISED_FLOOR_KJ;',
    'const floor = targets.energyFloorKj;',
    'const day = useDayTargets(storage, today);',
    'const e = estimatedDailyEnergy(input);',
    'const r = restingEnergyKcal(input);',
    'const w = await storage.db.weights.toArray();',
    "const w = await storage.repos['weights'].list();",
  ])(
    'b: alcohol code reading the floor, the energy equation or the weigh-ins fails: %s',
    (line) => {
      expect(rules('packages/core/src/alcohol/totals.ts', line)).toEqual(['body-input']);
      expect(rules('apps/mobile-web/src/screens/drinks/SummaryCard.tsx', line)).toEqual([
        'body-input',
      ]);
    },
  );

  it('c: the floor or meal-check code naming an alcohol total, or importing it, fails; a comment does not', () => {
    expect(
      rules(
        'packages/core/src/targets/energy.ts',
        "import { periodTotals } from '../alcohol/totals';\n// knownKcal in a comment is fine\n",
      ),
    ).toEqual(['energy-route', 'energy-route']);
    expect(
      rules('packages/core/src/targets/energy.ts', "import { totalsOfPlaced } from '..';"),
    ).toEqual(['energy-route']);
    expect(
      rules(
        'apps/mobile-web/src/screens/today/nutritionView.ts',
        'const kcal = periodTotals(rows, ctx, day, day).knownKcal;',
      ),
    ).toEqual(['energy-route', 'energy-route']);
  });

  it('d: a milestone made anywhere but the milestone form, or a drink logged outside the Log card, fails', () => {
    expect(
      rules(
        'apps/mobile-web/src/screens/today/Example.tsx',
        'void repos.alcoholMilestones.create(x);\nvoid repos.drinks.log(y);\n',
      ),
    ).toEqual(['write-home', 'write-home']);
    for (const text of [
      "void repos.drinks['log'](y);",
      'const { log } = storage.repos.drinks;',
      'void repos.alcoholMilestones\n  .create(x);',
    ]) {
      expect(rules('apps/mobile-web/src/screens/today/Example.tsx', text), text).toEqual([
        'write-home',
      ]);
    }
    expect(
      rules(
        'apps/mobile-web/src/screens/drinks/TrendsCard.tsx',
        "void crudRepo(ctx, 'alcohol_milestones').create(x);",
      ),
    ).toEqual(['write-home', 'write-home']);
    expect(
      rules(
        'apps/mobile-web/src/screens/drinks/MilestonesCard.tsx',
        'void repos.alcoholMilestones.update(id, x);\n',
      ),
    ).toEqual([]);
  });
});
