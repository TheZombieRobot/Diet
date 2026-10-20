import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { listRepoFiles } from './scan';
import { isTargetsScanned, targetsHomeProblems } from './targetsHome';

// Item 21 design section 6.6: target arithmetic lives only in core, and the day's figures are
// never read as the weight phase (HS-10, HS-11, HS-25).
const root = resolve(import.meta.dirname, '../..');

describe('target arithmetic lives only in core (targetsHome)', () => {
  it('the repository passes, and the scan reads the app’s source', () => {
    const files = listRepoFiles(root).filter(isTargetsScanned);
    expect(files).toContain('apps/mobile-web/src/screens/today/nutritionView.ts');
    expect(files).toContain('apps/mobile-web/src/screens/targets/EnergyCard.tsx');
    const problems = files.flatMap((f) =>
      targetsHomeProblems(f, readFileSync(join(root, f), 'utf8')),
    );
    expect(problems).toEqual([]);
  });

  it('seeded: a screen naming FLOOR_KJ fails, as does a floor typed as a literal', () => {
    expect(
      targetsHomeProblems(
        'apps/mobile-web/src/screens/Example.tsx',
        "import { FLOOR_KJ } from '@diet/core';\nexport const floor = FLOOR_KJ;\n",
      ).map((p) => p.rule),
    ).toEqual(['limit-name']);
    expect(
      targetsHomeProblems(
        'apps/mobile-web/src/screens/Example.ts',
        'const floor = 5000; // kJ\nconst cap = 0.7 * estimateKj;\n',
      ).map((p) => p.rule),
    ).toEqual(['limit-literal', 'limit-literal']);
  });

  it('seeded: a file importing phaseOn and dayTargets fails; tests and the engine’s folders are not read', () => {
    const both =
      "import { dayTargets, phaseOn } from '@diet/core';\nexport const x = [dayTargets, phaseOn];\n";
    expect(
      targetsHomeProblems('apps/mobile-web/src/screens/Example.ts', both).map((p) => p.rule),
    ).toEqual(['figures-not-phase']);
    expect(targetsHomeProblems('apps/mobile-web/src/screens/Example.test.ts', both)).toEqual([]);
    expect(
      targetsHomeProblems('packages/core/src/targets/example.ts', 'const f = FLOOR_KJ; // 5000 kJ'),
    ).toEqual([]);
  });
});
