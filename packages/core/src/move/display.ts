/**
 * What the Move screens show about templates and the week (item 27 design sections 2.4 and 2.6):
 * route slugs, the session length, the week footer, and the heat water figure.
 */
import { fillTemplate } from '../copy/template';
import { move, moveScreen, readiness } from '../copy/health';
import {
  beachPromptLines,
  type EquipmentToggles,
  estimateSeconds,
  type ExerciseData,
  isBeachTemplate,
  MOVE_LIMITS,
  type ResolvedWeek,
  type SessionTemplate,
  templateById,
} from '../exercise';
import type { SessionRecord } from '../storage/records';
import type { LocalDate } from '../util/time';

const TEMPLATE_PREFIX = 'seed:session-';
/** The 64-character SeedId limit less the prefix. */
const SLUG_MAX = 64 - TEMPLATE_PREFIX.length;

/** The template id without its prefix ('seed:session-beach-walk' → 'beach-walk'), or null. */
export function templateSlug(id: string): string | null {
  return id.startsWith(TEMPLATE_PREFIX) && id.length > TEMPLATE_PREFIX.length
    ? id.slice(TEMPLATE_PREFIX.length)
    : null;
}

/**
 * The template id a route slug names, or null when the slug cannot be one. Whether the template
 * exists is the start gate's business ('unknown-template').
 */
export function templateIdFromSlug(slug: string): string | null {
  const lower = slug.toLowerCase();
  if (lower.length > SLUG_MAX || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(lower)) return null;
  return `${TEMPLATE_PREFIX}${lower}`;
}

/** The key of move.equipment for the two toggles (the mock-up's "Bodyweight"; C112). */
export function equipmentKey(eq: EquipmentToggles): keyof typeof move.equipment {
  if (eq.bands && eq.dumbbells) return 'both';
  if (eq.bands) return 'bands';
  return eq.dumbbells ? 'dumbbells' : 'none';
}

/** Item 26's start estimate in whole minutes ("About 25 minutes"; HS section 6 "about 20–35"). */
export function sessionMinutes(
  data: ExerciseData,
  template: SessionTemplate,
  equipment: EquipmentToggles,
): number {
  return Math.round(estimateSeconds(data, template, 'start', equipment) / 60);
}

export interface WeekFooter {
  /** The week's strength sessions ("A, B") and their length ("25 to 27"), or null with none. */
  readonly strength: { readonly labels: string; readonly minutes: string } | null;
  readonly walk: boolean;
  readonly jog: boolean;
}

/** The lines under the week strip (item 26 1.2): the strength sessions, the walk and the jog. */
export function weekFooter(
  data: ExerciseData,
  week: ResolvedWeek,
  equipment: EquipmentToggles,
): WeekFooter {
  const templates = week.days.flatMap((d) =>
    d.templateIds
      .map((id) => templateById(data, id))
      .filter((t): t is SessionTemplate => t !== undefined),
  );
  const strength = [...new Set(templates.filter((t) => t.kind === 'strength'))];
  const minutes = strength.map((t) => sessionMinutes(data, t, equipment));
  const low = Math.min(...minutes);
  const high = Math.max(...minutes);
  return Object.freeze({
    strength:
      strength.length === 0
        ? null
        : Object.freeze({
            labels: strength.map((t) => t.shortLabel).join(moveScreen.listComma),
            minutes:
              low === high
                ? String(low)
                : fillTemplate(moveScreen.week.minutesRange, { low, high }),
          }),
    walk: templates.some((t) => t.kind === 'walk'),
    jog: templates.some((t) => t.kind === 'jog'),
  });
}

/** HEALTH_SAFETY.md section 6: "500 mL per hour of activity in the heat is the in-app default". */
export const HEAT_WATER_ML_PER_HOUR = 500;

/**
 * Water to carry for an activity of `seconds`: 500 mL for each started hour, never below 500 mL,
 * so the figure is never less than the per-hour default.
 */
export function heatWaterMl(seconds: number): number {
  if (!Number.isFinite(seconds) || seconds < 0) {
    throw new RangeError(`heatWaterMl needs seconds of 0 or more, got ${seconds}`);
  }
  return HEAT_WATER_ML_PER_HOUR * Math.max(1, Math.ceil(seconds / 3600));
}

/** Ticked seconds, plus ticked reps at the length estimate's 4 s a rep; per-side amounts once. */
function loggedSeconds(row: SessionRecord): number {
  let total = 0;
  for (const m of row.movements) {
    for (const set of m.done) total += set.seconds ?? (set.reps ?? 0) * MOVE_LIMITS.secondsPerRep;
  }
  return Math.max(0, total);
}

/**
 * The day's extra water for item 23's water guide (cross-item ruling 12): for each session dated
 * today that was started or done, with a known template, that is a beach session or whose check
 * did not answer the hot-day question exactly "no", the heat water for the longer of its top
 * length estimate and what was logged. Rested, skipped and unchecked rows add nothing.
 */
export function heatWaterExtraMl(
  data: ExerciseData,
  sessions: readonly SessionRecord[],
  today: LocalDate,
  equipment: EquipmentToggles,
): number {
  let total = 0;
  for (const row of sessions) {
    if (row.date !== today) continue;
    const started = row.status === 'done' || (row.status === 'planned' && row.preCheck !== null);
    const template = templateById(data, row.templateId);
    if (!started || template === undefined) continue;
    const hot = row.preCheck !== null && row.preCheck.heatOrSun !== 'no';
    if (!hot && !isBeachTemplate(data, template)) continue;
    const seconds = Math.max(estimateSeconds(data, template, 'top', equipment), loggedSeconds(row));
    total += heatWaterMl(seconds);
  }
  return total;
}

/**
 * The beach prompts' electrolytes line and item 13's blood-pressure salt sentence, under item 26's
 * own gating (keto with the keto ceiling available; the salt sentence unless answer 4 is exactly
 * no), for a hot-day session that is not at the beach (cross-item ruling 24).
 */
export function heatElectrolyteLines(input: Parameters<typeof beachPromptLines>[0]): string[] {
  return beachPromptLines(input).filter(
    (line) =>
      line === move.safety.beachPrompts.electrolytes ||
      line === readiness.bloodPressure.electrolyte,
  );
}
