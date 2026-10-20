/**
 * The shape of the alcohol code (item 28 design 6.2 S1; HEALTH_SAFETY.md section 5; HS-07, HS-08,
 * HS-19, C11). Four rules over non-test source files, with comments stripped first:
 *
 * a. Core's alcohol code imports only small, named modules: its own folder, util, the copy, the
 *    kJ conversion and the storage records, dates, derivations, cards, profile mapping, readiness
 *    input, defaults and limits. Never the whole storage module, the energy engine, weight,
 *    fasting or targets.
 * b. No body or energy-target input in the alcohol code (core's alcohol folder and the Drinks
 *    screens): no weight, height or energy target, so no blood-alcohol estimate can be built and
 *    no drink can be weighed against a budget (HS-08, HS-19). targetsHome.ts already keeps the
 *    floor and the energy equation out of both.
 * c. No route for alcohol totals into the energy floor, the meal checks or the planner (C11): the
 *    energy, nutrition, fasting, weight, targets and planner folders never import the alcohol
 *    totals, trends or help card, and never name their totals. Item 21's day total (targets
 *    intake.ts) is the one exception: it shows alcohol energy as its own part, behind a type wall
 *    that keeps it out of foodEnergyKj, which is all the floor and the meal checks read.
 * d. The writes have one home each: a milestone is created or changed only in the milestone form
 *    (the app never makes one), a drink is logged only in the Log card and edited only in the
 *    entry editor.
 */
import { isTestFile } from './scan';

export interface AlcoholStructureProblem {
  readonly file: string;
  readonly rule: 'core-import' | 'body-input' | 'energy-route' | 'write-home';
  readonly detail: string;
}

const CORE_ALCOHOL = /^packages\/core\/src\/alcohol\//;
const DRINKS_SCREENS = /^apps\/mobile-web\/src\/screens\/drinks\//;
const ENERGY_FOLDERS =
  /^packages\/core\/src\/(?:energy|nutrition|fasting|weight|targets|planner)\//;
/** Item 21's day total, which shows alcohol energy as its own part (see c above). */
const DAY_TOTAL = 'packages/core/src/targets/intake.ts';

/** What core's alcohol files may import (a). */
const ALLOWED_IMPORTS: readonly RegExp[] = [
  /^\.\/\w+$/,
  /^\.\.\/util\/\w+$/,
  /^\.\.\/copy\/health$/,
  // The kJ conversion only, so a label typed in kJ is stored exactly as the validator checks it.
  /^\.\.\/nutrition\/nutrients$/,
  /^\.\.\/storage\/(?:records|primitives|dates|derived|cards|profileMapping|readiness|defaults|limits)$/,
];

/** Body and energy-target inputs (b). */
const BODY_INPUTS: readonly RegExp[] = [
  /\bbaseTargets\b/,
  /\bWeightRecord\b/,
  /\bheightCm\b/,
  /\bkg\b/,
  /\brepos\.(?:weights|foodLog|planDays|targets)\b/,
];

/** The alcohol totals the energy code may never import or name (c). */
const ALCOHOL_TOTALS_IMPORT =
  /['"](?:\.\.\/alcohol|@diet\/core\/alcohol)\/(?:totals|trends|helpCard)['"]/;
const ALCOHOL_TOTAL_NAMES: readonly RegExp[] = [
  /\bperiodTotals\b/,
  /\btotalDrinkEnergy\b/,
  /\bentryFigures\b/,
  /\bknownKcal\b/,
  /\bdrinks_log\b/,
];

/** Each write and the one file it may appear in (d). */
const WRITE_HOMES: readonly (readonly [RegExp, string])[] = [
  [
    /\balcoholMilestones\.(?:create|update)\(/,
    'apps/mobile-web/src/screens/drinks/MilestonesCard.tsx',
  ],
  [/\bdrinks\.log\(/, 'apps/mobile-web/src/screens/drinks/LogCard.tsx'],
  [/\bdrinks\.update\(/, 'apps/mobile-web/src/screens/drinks/EntryEditor.tsx'],
];

/** Source files the scan reads: the workspaces' code, not tests, test kits or fixtures. */
export function isAlcoholScanned(file: string): boolean {
  return (
    /^(?:apps|packages|services)\/.+\.[cm]?tsx?$/.test(file) &&
    !isTestFile(file) &&
    !/[tT]estKit\.tsx?$/.test(file) &&
    !file.startsWith('packages/test-fixtures/') &&
    !/\/node_modules\//.test(file)
  );
}

/** The text with block and line comments removed (strings with "//" in them are rare here). */
export function stripComments(text: string): string {
  return text
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:'"`])\/\/.*$/gm, (_comment, before: string) => before);
}

export function alcoholStructureProblems(file: string, source: string): AlcoholStructureProblem[] {
  if (!isAlcoholScanned(file)) return [];
  const text = stripComments(source);
  const problems: AlcoholStructureProblem[] = [];
  if (CORE_ALCOHOL.test(file)) {
    for (const [, specifier] of text.matchAll(/\bfrom\s+['"]([^'"]+)['"]/g)) {
      if (!ALLOWED_IMPORTS.some((allowed) => allowed.test(specifier ?? ''))) {
        problems.push({ file, rule: 'core-import', detail: specifier ?? '' });
      }
    }
  }
  if (CORE_ALCOHOL.test(file) || DRINKS_SCREENS.test(file)) {
    for (const input of BODY_INPUTS) {
      if (input.test(text)) problems.push({ file, rule: 'body-input', detail: String(input) });
    }
  }
  if (ENERGY_FOLDERS.test(file)) {
    if (ALCOHOL_TOTALS_IMPORT.test(text)) {
      problems.push({ file, rule: 'energy-route', detail: 'imports the alcohol totals' });
    }
    if (file !== DAY_TOTAL) {
      for (const name of ALCOHOL_TOTAL_NAMES) {
        if (name.test(text)) problems.push({ file, rule: 'energy-route', detail: String(name) });
      }
    }
  }
  for (const [write, home] of WRITE_HOMES) {
    if (file !== home && write.test(text)) {
      problems.push({ file, rule: 'write-home', detail: String(write) });
    }
  }
  return problems;
}
