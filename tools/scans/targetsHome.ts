/**
 * Target arithmetic lives only in core (item 21 design section 6.6; HEALTH_SAFETY section 4,
 * HS-10, HS-11, HS-25). Screens, the planner and the food log read the targets engine's output;
 * none works out its own floor, deficit, ceiling or estimate, so a safety figure can never be
 * restated wrongly somewhere else. Three rules over non-test source files:
 *
 * 1. The limit constants and the energy equation are named only in core's storage, targets and
 *    energy folders (and in core's copy, whose sentences state them and are tested against them).
 * 2. No 5000, 1200 or 0.7 sits within 40 characters of "kJ", "kj" or "kcal" on a line outside
 *    those folders: a floor or a 30% cap typed as a literal.
 * 3. No file imports both a weight-phase function and the day's targets: `figures` is not the
 *    phase, and phase notes and the rapid-loss rule come only from item 14's engine (HS-11).
 */
import { isTestFile } from './scan';

export interface TargetsHomeProblem {
  readonly file: string;
  readonly rule: 'limit-name' | 'limit-literal' | 'figures-not-phase';
  readonly detail: string;
}

/** The constants and functions only the engine's own folders may name. */
export const ENGINE_ONLY_NAMES: readonly string[] = [
  'FLOOR_KJ',
  'MAX_RAISED_FLOOR_KJ',
  'KICKSTART_MAX_DEFICIT_PCT',
  'STEADY_DEFICIT_PCT',
  'KICKSTART_NET_CARBS_G',
  'NET_CARB_CEILING_G',
  'MODERATE_NET_CARB_CEILING_G',
  'SAT_FAT_BUDGET_PCT',
  'PROTEIN_LIMITS_G',
  'DEFAULT_PROTEIN_RANGE_G',
  'estimatedDailyEnergy',
  'restingEnergyKcal',
];

/** The weight-phase functions that may not share a file with the day's targets. */
export const PHASE_NAMES: readonly string[] = [
  'phaseOn',
  'rapidLossStatus',
  'weightOverview',
  'kickstartEndNeeded',
];
export const TARGETS_NAMES: readonly string[] = ['dayTargets', 'dayTargetsFromRecords'];

const ENGINE_FOLDERS = /^packages\/core\/src\/(?:storage|targets|energy)\//;
const COPY_FOLDER = /^packages\/core\/src\/copy\//;

/** Source files the scan reads: the workspaces' code, not tests and not test fixtures. */
export function isTargetsScanned(file: string): boolean {
  return (
    /^(?:apps|packages|services)\/.+\.[cm]?tsx?$/.test(file) &&
    !isTestFile(file) &&
    !file.startsWith('packages/test-fixtures/') &&
    !/\/node_modules\//.test(file)
  );
}

const word = (name: string) => new RegExp(`\\b${name}\\b`);
/** "kJ", "kj" or "kcal" as a word, or as the end of a camelCase name such as estimateKj. */
const UNIT = String.raw`(?:\b(?:kJ|kj|kcal)|Kj|Kcal)\b`;
const LITERAL = String.raw`\b(?:5_?000|1_?200|0\.70?)\b`;
const LITERAL_NEAR_UNIT = new RegExp(`${LITERAL}.{0,40}${UNIT}|${UNIT}.{0,40}${LITERAL}`);

/** The names a file imports (the bindings of every import statement). */
function importedNames(text: string): Set<string> {
  const names = new Set<string>();
  for (const [, list] of text.matchAll(/\bimport\s+(?:type\s+)?\{([^}]*)\}\s*from/g)) {
    for (const part of (list ?? '').split(',')) {
      const name = part
        .replace(/^\s*type\s+/, '')
        .split(/\s+as\s+/)[0]
        ?.trim();
      if (name) names.add(name);
    }
  }
  return names;
}

export function targetsHomeProblems(file: string, text: string): TargetsHomeProblem[] {
  if (!isTargetsScanned(file) || ENGINE_FOLDERS.test(file)) return [];
  const problems: TargetsHomeProblem[] = [];
  if (!COPY_FOLDER.test(file)) {
    for (const name of ENGINE_ONLY_NAMES) {
      if (word(name).test(text)) problems.push({ file, rule: 'limit-name', detail: name });
    }
    text.split('\n').forEach((line, i) => {
      if (LITERAL_NEAR_UNIT.test(line)) {
        problems.push({ file, rule: 'limit-literal', detail: `line ${i + 1}: ${line.trim()}` });
      }
    });
  }
  const imported = importedNames(text);
  const phase = PHASE_NAMES.filter((n) => imported.has(n));
  const targets = TARGETS_NAMES.filter((n) => imported.has(n));
  if (phase.length > 0 && targets.length > 0) {
    problems.push({
      file,
      rule: 'figures-not-phase',
      detail: `${phase.join(', ')} with ${targets.join(', ')}`,
    });
  }
  return problems;
}
