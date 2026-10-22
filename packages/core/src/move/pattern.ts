/**
 * The weekly plan editor (item 27 design section 2.7; EX-05, EX-07): one strength and one beach
 * choice a day, item 26's checkWeeklyPattern, and a rolling check that joins the last six days'
 * work to the new plan, so a mid-week change never leaves fewer than two rest days in 7 days in a
 * row (HEALTH_SAFETY.md section 6 "Rest days are scheduled, not optional"; N33).
 */
import {
  type ExerciseData,
  MOVE_LIMITS,
  resolveWeeklyPattern,
  type ResolvedWeek,
  type SessionTemplate,
  sessionHasWork,
  templateById,
  templatesOn,
} from '../exercise';
import type { SeedId } from '../storage/primitives';
import type { SessionRecord, WeeklyPatternDay } from '../storage/records';
import { addDays, type IsoWeekday, type LocalDate } from '../util/time';

export interface DayChoice {
  readonly strength: SeedId | null;
  readonly beach: SeedId | null;
}

/** The week as shown, in the stored shape, Monday first: the editor's starting draft. */
export function editorStart(week: ResolvedWeek): WeeklyPatternDay[] {
  return week.days.map((d) => ({ weekday: d.weekday, templateIds: [...d.templateIds] }));
}

/** A day's strength and beach session (the first of each kind); unknown ids are ignored. */
export function dayChoiceOf(
  data: ExerciseData,
  day: Pick<WeeklyPatternDay, 'templateIds'>,
): DayChoice {
  const kindOf = (id: SeedId) => templateById(data, id)?.kind;
  return {
    strength: day.templateIds.find((id) => kindOf(id) === 'strength') ?? null,
    beach: day.templateIds.find((id) => kindOf(id) === 'walk' || kindOf(id) === 'jog') ?? null,
  };
}

/** The draft with one day's sessions replaced by the choice (strength first). */
export function withDayChoice(
  pattern: readonly WeeklyPatternDay[],
  weekday: IsoWeekday,
  choice: DayChoice,
): WeeklyPatternDay[] {
  if (!pattern.some((d) => d.weekday === weekday)) {
    throw new RangeError(`The plan has no weekday ${weekday}`);
  }
  const ids = [choice.strength, choice.beach].filter((id): id is SeedId => id !== null);
  return pattern.map((d) => (d.weekday === weekday ? { weekday, templateIds: ids } : d));
}

/** What a day may hold: the strength sessions, and the beach walk, plus the jog only when unlocked. */
export function patternOptions(
  data: ExerciseData,
  jogUnlocked: boolean,
): { readonly strength: readonly SessionTemplate[]; readonly beach: readonly SessionTemplate[] } {
  return {
    strength: data.templates.filter((t) => t.kind === 'strength'),
    beach: data.templates.filter((t) => t.kind === 'walk' || (jogUnlocked && t.kind === 'jog')),
  };
}

/**
 * Called once checkWeeklyPattern has no problems. A day is active when it holds work: before
 * today, a row dated that day with work; today, a row with work or a planned session without a
 * done, rested or skipped row; after today, anything planned. Any 7 days in a row from today − 6
 * to today + 6 with more than 5 active days refuses the plan. `draft` null is the standard week.
 */
export function planChangeRestProblem(
  data: ExerciseData,
  draft: readonly WeeklyPatternDay[] | null,
  input: {
    readonly sessions: readonly SessionRecord[];
    readonly today: LocalDate;
    readonly jogUnlocked: boolean;
  },
): 'rolling-rest-days' | null {
  const { sessions, today } = input;
  const week = resolveWeeklyPattern(data, draft, { jogUnlocked: input.jogUnlocked });
  const rowsOn = (date: LocalDate) => sessions.filter((s) => s.date === date);
  const active = (date: LocalDate): boolean => {
    const rows = rowsOn(date);
    if (date < today) return rows.some(sessionHasWork);
    const planned = templatesOn(data, week, date);
    if (date > today) return planned.length > 0;
    if (rows.some(sessionHasWork)) return true;
    return planned.some(
      (t) =>
        !rows.some(
          (r) =>
            r.templateId === t.id &&
            (r.status === 'done' || r.status === 'rested' || r.status === 'skipped'),
        ),
    );
  };
  for (let start = addDays(today, -6); start <= today; start = addDays(start, 1)) {
    let count = 0;
    for (let i = 0; i < 7; i += 1) if (active(addDays(start, i))) count += 1;
    if (count > MOVE_LIMITS.activeDaysMax) return 'rolling-rest-days';
  }
  return null;
}
