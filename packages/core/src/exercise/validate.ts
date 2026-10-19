/**
 * The exercise dataset validator (checklist item 26 "validation script"; EX-01, EX-05; item 26
 * design section 2.7). It runs on every `pnpm test` through dataset.test.ts, and on first use in
 * the app (dataset.ts), so a broken dataset cannot ship.
 *
 * exerciseDataProblems never throws, whatever it is given, and no problem carries a value: only a
 * path such as "exercises[6].variants.harder.how" and a rule id. It works in three passes:
 * 1. Shape. Exact keys, strict types; `__proto__`, `constructor` and `prototype` are refused at any
 *    depth (they are never a documented key). A record with a shape problem is set aside.
 * 2. Per-record rules, on the records that parsed.
 * 3. Cross-record rules, only when nothing failed in pass 1.
 */
import { move } from '../copy/health';
import { isJsonNumber, isPlainObject, isSeedId, isText } from '../storage/primitives';
import type { WeeklyPatternDay } from '../storage/records';
import { EXERCISE_IDS_V1, MOVE_LIMITS, TEMPLATE_IDS_V1 } from './constants';
import { estimateSeconds } from './duration';
import {
  BLOCKS,
  type Equipment,
  type ExerciseData,
  type ExerciseGroup,
  type ExerciseUnit,
  type TemplateKind,
  VARIANT_KEYS,
  type VariantKey,
} from './types';
import { checkWeeklyPattern } from './week';

export const EXERCISE_DATA_RULES = Object.freeze([
  'shape',
  'id',
  'text',
  'wording',
  'variants',
  'stop-rule-link',
  'beach',
  'slot',
  'blocks',
  'duration',
  'full-body',
  'template-set',
  'default-week',
] as const);
export type ExerciseDataRule = (typeof EXERCISE_DATA_RULES)[number];

export interface ExerciseDataProblem {
  /** A JSON path such as "exercises[6].variants.harder.how" ("" for the file itself). */
  readonly path: string;
  readonly rule: ExerciseDataRule;
}

/** Carries the problems (paths and rule ids only, never a value). */
export class ExerciseDataError extends Error {
  readonly problems: readonly ExerciseDataProblem[];

  constructor(problems: readonly ExerciseDataProblem[]) {
    const listed = problems.map((p) => `${p.path === '' ? '(file)' : p.path} ${p.rule}`);
    super(`The exercise dataset is not valid: ${listed.join('; ')}`);
    this.problems = Object.freeze([...problems]);
  }
}
ExerciseDataError.prototype.name = 'ExerciseDataError';

/**
 * Wording the dataset's visible text may not use (item 26 design M3, M4). Safety wording (pain,
 * stopping, symptoms, professionals) belongs in health.ts `move`; marketing words and the names of
 * well-known programmes stay out because the content is written in-house. Checked only against
 * the exercise name and cues, each variant's name and how-to line, and the template name, short
 * label and summary: never against ids or keys, so `stopRules` and `painFreeOnly` do not trip it.
 * The repository scan (`pnpm scan`) already runs the health and commerce phrase rules on the file.
 */
export const DATASET_WORDING_BANS: readonly RegExp[] = Object.freeze([
  /\b(?:safe|safely|safety|pain\w*|hurt\w*|injur\w*|sore\w*)\b/i,
  /\b(?:doctor|GP|physio\w*|medical|diagnos\w*|clinic\w*)\b/i,
  /\b(?:dizz\w*|faint\w*|breathless\w*|unwell|sick|nause\w*)\b/i,
  /\bshortness\s+of\s+breath\b/i,
  /\b(?:stop\w*|warning|caution|careful|danger\w*|risk\w*)\b/i,
  /\b(?:burn\w*|fat|calories?|kcal|kilojoules?|tone|toning|sculpt\w*|detox\w*|blast\w*|punish\w*|no\s+excuses|beast)\b/i,
  /\b(?:couch\s+to\s+5k|c25k|5\s*x\s*5|tabata|crossfit|p90x|starting\s+strength|7[\s-]minute\s+workout)\b/i,
]);

// ---- The shapes after pass 1. Value domains not yet checked stay wide (strings, numbers). ----

interface ParsedVariant {
  readonly name: string;
  readonly how: string;
  readonly perSide: boolean;
}

interface ParsedExercise {
  readonly id: string;
  readonly name: string;
  readonly group: ExerciseGroup;
  readonly unit: ExerciseUnit;
  readonly step: number;
  readonly requires: Equipment | null;
  readonly tags: readonly string[];
  readonly safetyKeys: readonly string[];
  readonly cues: readonly string[];
  readonly variants: Readonly<Record<VariantKey, ParsedVariant | null>>;
}

interface ParsedSlot {
  readonly exerciseId: string;
  readonly startVariant: string;
  readonly sets: number;
  readonly min: number;
  readonly max: number;
  readonly restSeconds: number;
  readonly onlyWith: string | null;
}

interface ParsedTemplate {
  readonly id: string;
  readonly name: string;
  readonly shortLabel: string;
  readonly kind: TemplateKind;
  readonly tags: readonly string[];
  readonly summary: string;
  readonly warmUp: readonly ParsedSlot[];
  readonly main: readonly ParsedSlot[];
  readonly coolDown: readonly ParsedSlot[];
}

interface ParsedData {
  readonly datasetVersion: 1;
  readonly exercises: readonly ParsedExercise[];
  readonly templates: readonly ParsedTemplate[];
  readonly defaultWeek: readonly WeeklyPatternDay[];
}

const TOP_KEYS = ['datasetVersion', 'exercises', 'templates', 'defaultWeek'] as const;
const EXERCISE_KEYS = [
  'id',
  'name',
  'group',
  'unit',
  'step',
  'requires',
  'tags',
  'safetyKeys',
  'cues',
  'variants',
] as const;
const VARIANT_FIELDS = ['name', 'how', 'perSide'] as const;
const TEMPLATE_KEYS = [
  'id',
  'name',
  'shortLabel',
  'kind',
  'tags',
  'summary',
  'warmUp',
  'main',
  'coolDown',
] as const;
const SLOT_KEYS = [
  'exerciseId',
  'startVariant',
  'sets',
  'min',
  'max',
  'restSeconds',
  'onlyWith',
] as const;
const DAY_KEYS = ['weekday', 'templateIds'] as const;

const GROUPS: readonly unknown[] = ['warm-up', 'mobility', 'lower', 'upper', 'core', 'beach'];
const UNITS: readonly unknown[] = ['reps', 'seconds'];
const KINDS: readonly unknown[] = ['strength', 'walk', 'jog'];
const EQUIPMENT: readonly unknown[] = ['band', 'dumbbell'];
const EXERCISE_ID_RE = /^seed:ex-[a-z0-9]+(?:-[a-z0-9]+)*$/;
const TEMPLATE_ID_RE = /^seed:session-[a-z0-9]+(?:-[a-z0-9]+)*$/;
const SECONDS_STEPS: readonly number[] = [5, 10, 30, 60];

class Problems {
  private readonly list: ExerciseDataProblem[] = [];
  private readonly seen = new Set<string>();

  add(path: string, rule: ExerciseDataRule): void {
    const key = `${path} ${rule}`;
    if (this.seen.has(key)) return;
    this.seen.add(key);
    this.list.push(Object.freeze({ path, rule }));
  }

  get count(): number {
    return this.list.length;
  }

  get all(): ExerciseDataProblem[] {
    return [...this.list];
  }
}

const at = (path: string, key: string | number): string =>
  typeof key === 'number' ? `${path}[${key}]` : path === '' ? key : `${path}.${key}`;

const isString = (v: unknown): v is string => typeof v === 'string';
const isSafeInt = (v: unknown): v is number => isJsonNumber(v) && Number.isSafeInteger(v);
const isStringArray = (v: unknown): v is string[] => Array.isArray(v) && v.every(isString);
const hasDuplicates = (values: readonly string[]): boolean =>
  new Set(values).size !== values.length;

/** A deep copy of a value that passed the shape checks, frozen at every level. */
function frozenCopy(value: unknown): unknown {
  if (Array.isArray(value)) return Object.freeze(value.map(frozenCopy));
  if (isPlainObject(value)) {
    return Object.freeze(
      Object.fromEntries(Object.entries(value).map(([k, v]) => [k, frozenCopy(v)])),
    );
  }
  return value;
}

// ---- Pass 1: shape ----

/** A plain object with exactly these own keys (so a forbidden key always fails). */
function hasExactKeys(
  value: unknown,
  keys: readonly string[],
  path: string,
  problems: Problems,
): value is Record<string, unknown> {
  const ok =
    isPlainObject(value) &&
    Object.keys(value).length === keys.length &&
    keys.every((k) => Object.hasOwn(value, k));
  if (!ok) problems.add(path, 'shape');
  return ok;
}

/** A frozen copy of the record when it has exactly `keys` and passes `check`, otherwise null. */
function parseRecord(
  value: unknown,
  path: string,
  problems: Problems,
  check: (record: Record<string, unknown>, expect: (ok: boolean, key: string) => void) => void,
  keys: readonly string[],
): unknown {
  const before = problems.count;
  if (!hasExactKeys(value, keys, path, problems)) return null;
  check(value, (ok, key) => {
    if (!ok) problems.add(at(path, key), 'shape');
  });
  return problems.count === before ? frozenCopy(value) : null;
}

function parseVariant(value: unknown, path: string, problems: Problems): void {
  if (value === null) return; // a missing required version is a `variants` problem
  parseRecord(
    value,
    path,
    problems,
    (v, expect) => {
      expect(isString(v['name']), 'name');
      expect(isString(v['how']), 'how');
      expect(typeof v['perSide'] === 'boolean', 'perSide');
    },
    VARIANT_FIELDS,
  );
}

function parseExercise(value: unknown, path: string, problems: Problems): ParsedExercise | null {
  return parseRecord(
    value,
    path,
    problems,
    (e, expect) => {
      expect(isString(e['id']), 'id');
      expect(isString(e['name']), 'name');
      expect(GROUPS.includes(e['group']), 'group');
      expect(UNITS.includes(e['unit']), 'unit');
      expect(isSafeInt(e['step']), 'step');
      expect(e['requires'] === null || EQUIPMENT.includes(e['requires']), 'requires');
      expect(isStringArray(e['tags']), 'tags');
      expect(isStringArray(e['safetyKeys']), 'safetyKeys');
      expect(isStringArray(e['cues']), 'cues');
      const variants = e['variants'];
      const variantsPath = at(path, 'variants');
      if (hasExactKeys(variants, VARIANT_KEYS, variantsPath, problems)) {
        for (const key of VARIANT_KEYS)
          parseVariant(variants[key], at(variantsPath, key), problems);
      }
    },
    EXERCISE_KEYS,
  ) as ParsedExercise | null;
}

function parseSlots(value: unknown, path: string, problems: Problems): void {
  if (!Array.isArray(value)) {
    problems.add(path, 'shape');
    return;
  }
  value.forEach((slot, i) => {
    parseRecord(
      slot,
      at(path, i),
      problems,
      (s, expect) => {
        expect(isString(s['exerciseId']), 'exerciseId');
        expect(isString(s['startVariant']), 'startVariant');
        for (const key of ['sets', 'min', 'max', 'restSeconds'] as const) {
          expect(isSafeInt(s[key]), key);
        }
        expect(s['onlyWith'] === null || isString(s['onlyWith']), 'onlyWith');
      },
      SLOT_KEYS,
    );
  });
}

function parseTemplate(value: unknown, path: string, problems: Problems): ParsedTemplate | null {
  return parseRecord(
    value,
    path,
    problems,
    (t, expect) => {
      for (const key of ['id', 'name', 'shortLabel', 'summary'] as const) {
        expect(isString(t[key]), key);
      }
      expect(KINDS.includes(t['kind']), 'kind');
      expect(isStringArray(t['tags']), 'tags');
      for (const block of BLOCKS) parseSlots(t[block], at(path, block), problems);
    },
    TEMPLATE_KEYS,
  ) as ParsedTemplate | null;
}

function parseDay(value: unknown, path: string, problems: Problems): WeeklyPatternDay | null {
  return parseRecord(
    value,
    path,
    problems,
    (d, expect) => {
      expect(isSafeInt(d['weekday']), 'weekday');
      expect(isStringArray(d['templateIds']), 'templateIds');
    },
    DAY_KEYS,
  ) as WeeklyPatternDay | null;
}

/** An array within the length limits (the default week's length is the `default-week` rule's). */
function parseList<T>(
  value: unknown,
  path: string,
  length: { readonly min: number; readonly max: number },
  problems: Problems,
  parse: (item: unknown, path: string, problems: Problems) => T | null,
): (T | null)[] {
  if (!Array.isArray(value) || value.length < length.min || value.length > length.max) {
    problems.add(path, 'shape');
    return [];
  }
  return value.map((item, i) => parse(item, at(path, i), problems));
}

// ---- Pass 2: per-record rules ----

function wording(text: string, path: string, problems: Problems): void {
  if (DATASET_WORDING_BANS.some((ban) => ban.test(text))) problems.add(path, 'wording');
}

function exerciseRules(e: ParsedExercise, path: string, problems: Problems): void {
  if (!EXERCISE_ID_RE.test(e.id) || !isSeedId(e.id)) problems.add(at(path, 'id'), 'id');

  // text and wording
  if (!isText(e.name, 1, 40)) problems.add(at(path, 'name'), 'text');
  wording(e.name, at(path, 'name'), problems);
  if (e.cues.length < 2 || e.cues.length > 3) problems.add(at(path, 'cues'), 'text');
  e.cues.forEach((cue, i) => {
    if (!isText(cue, 1, 90) || !cue.endsWith('.')) problems.add(at(at(path, 'cues'), i), 'text');
    wording(cue, at(at(path, 'cues'), i), problems);
  });
  const variantNames = new Set<string>();
  for (const key of VARIANT_KEYS) {
    const variant = e.variants[key];
    const variantPath = at(at(path, 'variants'), key);
    if (variant === null) {
      if (key === 'easier' || key === 'standard' || key === 'harder') {
        problems.add(variantPath, 'variants');
      }
      continue;
    }
    if (!isText(variant.name, 1, 40) || variantNames.has(variant.name.toLowerCase())) {
      problems.add(at(variantPath, 'name'), 'text');
    }
    variantNames.add(variant.name.toLowerCase());
    if (!isText(variant.how, 1, 140)) problems.add(at(variantPath, 'how'), 'text');
    wording(variant.name, at(variantPath, 'name'), problems);
    wording(variant.how, at(variantPath, 'how'), problems);
  }

  // variants: equipment versions only where the movement itself needs no equipment (C112)
  if (e.requires !== null && (e.variants.band !== null || e.variants.dumbbell !== null)) {
    problems.add(at(path, 'variants'), 'variants');
  }

  // stop-rule-link (EX-01, HS-28): the stop rules first, then only known safety keys
  const keys = e.safetyKeys;
  if (
    keys[0] !== 'stopRules' ||
    hasDuplicates(keys) ||
    keys.some((k) => !Object.hasOwn(move.safety, k))
  ) {
    problems.add(at(path, 'safetyKeys'), 'stop-rule-link');
  }

  // beach (HS-12, C51): the beach tag and the beach prompts go together
  const beach = e.tags.includes('beach');
  if (
    e.tags.some((t) => t !== 'beach' && t !== 'jog') ||
    hasDuplicates(e.tags) ||
    (e.tags.includes('jog') && !beach) ||
    beach !== keys.includes('beachPrompts')
  ) {
    problems.add(at(path, 'tags'), 'beach');
  }

  // slot: the progression and rounding step suits the unit
  if (e.unit === 'reps' ? e.step !== 1 : !SECONDS_STEPS.includes(e.step)) {
    problems.add(at(path, 'step'), 'slot');
  }
}

function templateRules(t: ParsedTemplate, path: string, problems: Problems): void {
  if (!TEMPLATE_ID_RE.test(t.id) || !isSeedId(t.id)) problems.add(at(path, 'id'), 'id');
  if (!isText(t.name, 1, 30)) problems.add(at(path, 'name'), 'text');
  if (!isText(t.shortLabel, 1, 4)) problems.add(at(path, 'shortLabel'), 'text');
  if (!isText(t.summary, 1, 90)) problems.add(at(path, 'summary'), 'text');
  for (const key of ['name', 'shortLabel', 'summary'] as const) {
    wording(t[key], at(path, key), problems);
  }
  const beachTags = t.kind === 'strength' ? [] : ['beach'];
  if (t.tags.length !== beachTags.length || t.tags.some((tag, i) => tag !== beachTags[i])) {
    problems.add(at(path, 'tags'), 'beach');
  }

  if (BLOCKS.reduce((n, block) => n + t[block].length, 0) > 20) problems.add(path, 'slot');
  for (const block of BLOCKS) {
    const blockPath = at(path, block);
    if (t[block].length === 0) problems.add(blockPath, 'blocks');
    t[block].forEach((slot, i) => {
      const slotPath = at(blockPath, i);
      if (
        (slot.startVariant !== 'easier' && slot.startVariant !== 'standard') ||
        slot.sets < 1 ||
        slot.sets > 10 ||
        slot.min > slot.max ||
        slot.restSeconds < 0 ||
        slot.restSeconds > 180 ||
        slot.restSeconds % 15 !== 0 ||
        (slot.onlyWith !== null && !EQUIPMENT.includes(slot.onlyWith))
      ) {
        problems.add(slotPath, 'slot');
      }
      if (
        block !== 'main' &&
        (slot.sets !== 1 ||
          slot.min !== slot.max ||
          slot.restSeconds !== 0 ||
          slot.onlyWith !== null)
      ) {
        problems.add(slotPath, 'blocks');
      }
    });
  }
  if (hasDuplicates(t.main.map((s) => s.exerciseId))) problems.add(at(path, 'main'), 'blocks');
}

// ---- Pass 3: cross-record rules ----

const sameDose = (a: ParsedSlot, b: ParsedSlot): boolean =>
  a.startVariant === b.startVariant &&
  a.sets === b.sets &&
  a.min === b.min &&
  a.max === b.max &&
  a.restSeconds === b.restSeconds;

const startVariantOf = (e: ParsedExercise, slot: ParsedSlot): ParsedVariant | null =>
  slot.startVariant === 'easier' || slot.startVariant === 'standard'
    ? e.variants[slot.startVariant]
    : null;

function crossRules(data: ParsedData, problems: Problems): void {
  const { exercises, templates, defaultWeek } = data;
  // The last entry wins for a repeated id, as in lookup.ts, so `resolved` below checks the same
  // exercise that estimateSeconds reads.
  const byId = new Map(exercises.map((e) => [e.id, e]));

  // id: unique across both lists, and every version-1 id kept
  const seenIds = new Set<string>();
  const ids = [
    ...exercises.map((e, i) => ({ id: e.id, path: at(at('exercises', i), 'id') })),
    ...templates.map((t, i) => ({ id: t.id, path: at(at('templates', i), 'id') })),
  ];
  for (const { id, path } of ids) {
    if (seenIds.has(id)) problems.add(path, 'id');
    seenIds.add(id);
  }
  if (EXERCISE_IDS_V1.some((id) => !exercises.some((e) => e.id === id))) {
    problems.add('exercises', 'id');
  }
  if (TEMPLATE_IDS_V1.some((id) => !templates.some((t) => t.id === id))) {
    problems.add('templates', 'id');
  }

  // text: exercise names and short labels unique, ignoring case
  if (hasDuplicates(exercises.map((e) => e.name.toLowerCase()))) problems.add('exercises', 'text');
  if (hasDuplicates(templates.map((t) => t.shortLabel.toLowerCase()))) {
    problems.add('templates', 'text');
  }

  const firstMainSlot = new Map<string, ParsedSlot>();
  const mainExercises = new Set<string>();
  const fixedExercises = new Set<string>();
  const used = new Set<string>();
  templates.forEach((t, ti) => {
    const path = at('templates', ti);
    // The length can be estimated only when every slot has a known exercise and start version.
    const resolved = BLOCKS.every((block) =>
      t[block].every((slot) => {
        const e = byId.get(slot.exerciseId);
        return e !== undefined && startVariantOf(e, slot) !== null;
      }),
    );
    for (const block of BLOCKS) {
      const work = t[block].reduce((total, slot, si) => {
        const slotPath = at(at(path, block), si);
        const e = byId.get(slot.exerciseId);
        if (e === undefined) {
          problems.add(at(slotPath, 'exerciseId'), 'slot');
          return total;
        }
        used.add(e.id);
        const [low, high] = e.unit === 'reps' ? [1, 30] : [5, 1800];
        if (
          slot.min % e.step !== 0 ||
          slot.max % e.step !== 0 ||
          slot.min < Math.max(e.step, low) ||
          slot.max > high ||
          (e.requires !== null && slot.onlyWith !== e.requires)
        ) {
          problems.add(slotPath, 'slot');
        }
        if (block === 'main') {
          mainExercises.add(e.id);
          const first = firstMainSlot.get(e.id);
          if (first === undefined) firstMainSlot.set(e.id, slot);
          else if (!sameDose(first, slot)) problems.add(slotPath, 'slot');
          if (t.kind === 'strength' && e.tags.includes('beach')) {
            problems.add(at(slotPath, 'exerciseId'), 'beach');
          }
          return total;
        }
        fixedExercises.add(e.id);
        if (e.unit !== 'seconds') problems.add(slotPath, 'blocks');
        return total + slot.min * (startVariantOf(e, slot)?.perSide === true ? 2 : 1);
      }, 0);
      if (block === 'warmUp' && work !== MOVE_LIMITS.warmUpSeconds) {
        problems.add(at(path, block), 'blocks');
      }
      if (
        block === 'coolDown' &&
        (work < MOVE_LIMITS.coolDownSeconds.min || work > MOVE_LIMITS.coolDownSeconds.max)
      ) {
        problems.add(at(path, block), 'blocks');
      }
    }

    // duration: about 20–35 minutes, from the bottom with bodyweight to the top with everything
    if (resolved) {
      const typed = data as unknown as ExerciseData;
      const template = typed.templates[ti];
      if (
        template !== undefined &&
        (estimateSeconds(typed, template, 'start', { bands: false, dumbbells: false }) <
          MOVE_LIMITS.sessionSeconds.min ||
          estimateSeconds(typed, template, 'top', { bands: true, dumbbells: true }) >
            MOVE_LIMITS.sessionSeconds.max)
      ) {
        problems.add(path, 'duration');
      }
    }

    // full-body: lower, upper and core, and a lighter session never empty
    if (t.kind === 'strength') {
      const main = t.main.flatMap((slot) => {
        const e = byId.get(slot.exerciseId);
        return e === undefined ? [] : [{ slot, e }];
      });
      const groups = new Set(main.map(({ e }) => e.group));
      const always = main.filter(
        ({ slot, e }) => slot.onlyWith === null && !e.safetyKeys.includes('painFreeOnly'),
      );
      if (
        !groups.has('lower') ||
        !groups.has('upper') ||
        !groups.has('core') ||
        always.length < 3
      ) {
        problems.add(at(path, 'main'), 'full-body');
      }
    }
  });
  // Stored volumes are pure main-block volumes.
  if ([...mainExercises].some((id) => fixedExercises.has(id))) problems.add('templates', 'blocks');

  // template-set: three strength sessions, one beach walk and one opt-in jog
  const ofKind = (kind: TemplateKind) => templates.filter((t) => t.kind === kind);
  const [walk, ...otherWalks] = ofKind('walk');
  const [jog, ...otherJogs] = ofKind('jog');
  const onlyExercise = (t: ParsedTemplate | undefined) =>
    t?.main.length === 1 && t.main[0] !== undefined
      ? { slot: t.main[0], e: byId.get(t.main[0].exerciseId) }
      : null;
  const walkMain = onlyExercise(walk);
  const jogMain = onlyExercise(jog);
  if (
    ofKind('strength').length !== 3 ||
    otherWalks.length > 0 ||
    otherJogs.length > 0 ||
    walkMain?.e?.tags.includes('beach') !== true ||
    walkMain.e.tags.includes('jog') ||
    jogMain?.e?.tags.includes('jog') !== true ||
    jogMain.slot.max > MOVE_LIMITS.jogIntervalMaxSeconds ||
    exercises.some((e) => !used.has(e.id))
  ) {
    problems.add('templates', 'template-set');
  }

  // default-week (EX-05): seven days, the plan rules, two strength sessions and no jog
  const weekdays = defaultWeek.map((d) => d.weekday).sort((a, b) => a - b);
  const templateIds = new Set(templates.map((t) => t.id));
  if (
    weekdays.length !== 7 ||
    weekdays.some((d, i) => d !== i + 1) ||
    defaultWeek.some((d) => d.templateIds.some((id) => !templateIds.has(id)))
  ) {
    problems.add('defaultWeek', 'default-week');
    return;
  }
  const kinds = defaultWeek.flatMap((d) =>
    d.templateIds.map((id) => templates.find((t) => t.id === id)?.kind),
  );
  if (
    checkWeeklyPattern(data as unknown as ExerciseData, defaultWeek, { jogUnlocked: false })
      .length > 0 ||
    kinds.filter((k) => k === 'strength').length !== MOVE_LIMITS.strengthPerWeek.min ||
    kinds.includes('jog')
  ) {
    problems.add('defaultWeek', 'default-week');
  }
}

function inspect(raw: unknown): { problems: ExerciseDataProblem[]; data: ExerciseData | null } {
  const problems = new Problems();
  if (!hasExactKeys(raw, TOP_KEYS, '', problems)) return { problems: problems.all, data: null };
  if (raw['datasetVersion'] !== 1) problems.add('datasetVersion', 'shape');
  const exercises = parseList(
    raw['exercises'],
    'exercises',
    { min: 1, max: 60 },
    problems,
    parseExercise,
  );
  const templates = parseList(
    raw['templates'],
    'templates',
    { min: 1, max: 20 },
    problems,
    parseTemplate,
  );
  const defaultWeek = parseList(
    raw['defaultWeek'],
    'defaultWeek',
    { min: 0, max: Number.MAX_SAFE_INTEGER },
    problems,
    parseDay,
  );
  const shapeOk = problems.count === 0;

  exercises.forEach((e, i) => {
    if (e !== null) exerciseRules(e, at('exercises', i), problems);
  });
  templates.forEach((t, i) => {
    if (t !== null) templateRules(t, at('templates', i), problems);
  });
  if (!shapeOk) return { problems: problems.all, data: null };

  const data = Object.freeze({
    datasetVersion: 1 as const,
    exercises: Object.freeze(exercises.filter((e): e is ParsedExercise => e !== null)),
    templates: Object.freeze(templates.filter((t): t is ParsedTemplate => t !== null)),
    defaultWeek: Object.freeze(defaultWeek.filter((d): d is WeeklyPatternDay => d !== null)),
  });
  crossRules(data, problems);
  return { problems: problems.all, data: data as unknown as ExerciseData };
}

/** Every problem in the dataset ([] when it is valid). Never throws. */
export function exerciseDataProblems(raw: unknown): ExerciseDataProblem[] {
  return inspect(raw).problems;
}

/** The typed dataset, deep-frozen, or an ExerciseDataError listing every problem. */
export function parseExerciseData(raw: unknown): ExerciseData {
  const { problems, data } = inspect(raw);
  if (problems.length > 0 || data === null) throw new ExerciseDataError(problems);
  return data;
}
