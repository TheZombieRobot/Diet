/**
 * The weekly plan and the week view (HEALTH_SAFETY.md section 6: two to three strength sessions,
 * rest days scheduled and never optional, no compulsory running; EX-05; UX 4a).
 *
 * The rules hold in three places, never in the stored-record validator (item 26 design M23): when
 * the plan is edited (checkWeeklyPattern), whenever a week is shown (resolveWeeklyPattern, so an
 * imported or out-of-date plan cannot bypass them), and at every Start on the week actually done
 * (start.ts). A rest day is a day with no session; a walk day is not a rest day.
 */
import type { Id, SeedId } from '../storage/primitives';
import type { SessionRecord, WeeklyPatternDay } from '../storage/records';
import { addDays, type IsoWeekday, isoWeekdayOf, type LocalDate, weekStartOf } from '../util/time';
import { MOVE_LIMITS } from './constants';
import { templateById } from './lookup';
import type { EquipmentToggles, ExerciseData, SessionTemplate } from './types';
import { slotAvailable } from './variants';

export const WEEK_PROBLEM_CODES = Object.freeze([
  'unknown-template',
  'day-too-full',
  'strength-count',
  'rest-days',
  'strength-back-to-back',
  'jog-locked',
  'jog-limit',
  'jog-on-strength-day',
] as const);
export type WeekProblem = (typeof WEEK_PROBLEM_CODES)[number];

export interface ResolvedDay {
  readonly weekday: IsoWeekday;
  readonly templateIds: readonly SeedId[];
}

export interface ResolvedWeek {
  /** Seven days, Monday first. */
  readonly days: readonly ResolvedDay[];
  readonly source: 'default' | 'stored' | 'stored-adjusted' | 'default-fallback';
  /** A jog was shown as the beach walk (or dropped beside it) because jogging is not unlocked. */
  readonly jogShownAsWalk: boolean;
  /** The stored week's problems, only for 'default-fallback'. */
  readonly problems: readonly WeekProblem[];
}

export const DAY_STATES = Object.freeze([
  'rest-day',
  'planned',
  'done',
  'rested',
  'not-done',
] as const);
export type DayState = (typeof DAY_STATES)[number];

export interface DayView {
  readonly date: LocalDate;
  readonly templateIds: readonly SeedId[];
  /** No state is a failure: a past day not done reads "Not done. Rest counts too." */
  readonly state: DayState;
}

const hasTicks = (row: SessionRecord): boolean => row.movements.some((m) => m.done.length > 0);

/** "Work" on a session row: status done, or at least one ticked set. */
export function sessionHasWork(row: SessionRecord): boolean {
  return row.status === 'done' || hasTicks(row);
}

/**
 * The row being resumed or re-planned: the stored row with this id, only when it is dated today
 * and holds this template. Anything else (a row from before midnight, another session, a missing
 * id) gives null, so a wrong id never takes a row out of the weekly counts or the history.
 */
export function resumedRow(
  sessions: readonly SessionRecord[],
  sessionId: Id | null,
  today: LocalDate,
  templateId: string,
): SessionRecord | null {
  if (sessionId === null) return null;
  const row = sessions.find((s) => s.id === sessionId);
  return row !== undefined && row.date === today && row.templateId === templateId ? row : null;
}

/** The days Monday first, or null unless there are 7 with weekdays 1–7 once each. */
function fullWeek(pattern: readonly WeeklyPatternDay[]): ResolvedDay[] | null {
  if (pattern.length !== 7) return null;
  const days = [...pattern].sort((a, b) => a.weekday - b.weekday);
  if (days.some((d, i) => d.weekday !== i + 1)) return null;
  return days.map((d) => ({ weekday: d.weekday as IsoWeekday, templateIds: d.templateIds }));
}

const frozenWeek = (week: ResolvedWeek): ResolvedWeek =>
  Object.freeze({
    ...week,
    days: Object.freeze(
      week.days.map((d) =>
        Object.freeze({ weekday: d.weekday, templateIds: Object.freeze([...d.templateIds]) }),
      ),
    ),
    problems: Object.freeze([...week.problems]),
  });

/**
 * The problems of a weekly plan, unique and in WEEK_PROBLEM_CODES order ([] means it may be
 * saved). Unknown ids are reported and otherwise ignored. Throws a RangeError unless the plan has
 * 7 days with weekdays 1–7 once each (the stored validator and the editor guarantee that).
 */
export function checkWeeklyPattern(
  data: ExerciseData,
  pattern: readonly WeeklyPatternDay[],
  ctx: { readonly jogUnlocked: boolean },
): WeekProblem[] {
  const days = fullWeek(pattern);
  if (days === null) {
    throw new RangeError('A weekly plan needs 7 days, Monday (1) to Sunday (7), once each');
  }
  const found = new Set<WeekProblem>();
  const counts = days.map((day) => {
    const count = { strength: 0, beach: 0, jog: 0 };
    for (const id of day.templateIds) {
      const template = templateById(data, id);
      if (template === undefined) {
        found.add('unknown-template');
        continue;
      }
      if (template.kind === 'strength') count.strength += 1;
      else count.beach += 1;
      if (template.kind === 'jog') count.jog += 1;
    }
    return count;
  });
  // The day after, Sunday wrapping to Monday.
  const next = (i: number) => counts[(i + 1) % counts.length] ?? { strength: 0, beach: 0, jog: 0 };

  if (counts.some((c) => c.strength > 1 || c.beach > 1)) found.add('day-too-full');
  const strengthDays = counts.filter((c) => c.strength > 0).length;
  if (
    strengthDays < MOVE_LIMITS.strengthPerWeek.min ||
    strengthDays > MOVE_LIMITS.strengthPerWeek.max
  ) {
    found.add('strength-count');
  }
  if (counts.filter((c) => c.strength + c.beach === 0).length < MOVE_LIMITS.restDaysMin) {
    found.add('rest-days');
  }
  if (counts.some((c, i) => c.strength > 0 && next(i).strength > 0)) {
    found.add('strength-back-to-back');
  }
  if (!ctx.jogUnlocked && counts.some((c) => c.jog > 0)) found.add('jog-locked');
  const jogDays = counts.filter((c) => c.jog > 0).length;
  if (jogDays > MOVE_LIMITS.jogDaysMax || counts.some((c, i) => c.jog > 0 && next(i).jog > 0)) {
    found.add('jog-limit');
  }
  if (counts.some((c) => c.jog > 0 && c.strength > 0)) found.add('jog-on-strength-day');
  return WEEK_PROBLEM_CODES.filter((code) => found.has(code));
}

/**
 * The week to show. With no stored plan, the default week. Otherwise the stored plan with unknown
 * ids dropped and, while jogging is not unlocked, each jog shown as the beach walk (or dropped when
 * the day already has the walk). If the result breaks any rule, the default week is shown with the
 * stored plan's problems: every week shown passes the rules, however it was stored.
 */
export function resolveWeeklyPattern(
  data: ExerciseData,
  stored: readonly WeeklyPatternDay[] | null,
  ctx: { readonly jogUnlocked: boolean },
): ResolvedWeek {
  const defaults = fullWeek(data.defaultWeek) ?? [];
  if (stored === null) {
    return frozenWeek({ days: defaults, source: 'default', jogShownAsWalk: false, problems: [] });
  }
  const fallback = (problems: readonly WeekProblem[]) =>
    frozenWeek({ days: defaults, source: 'default-fallback', jogShownAsWalk: false, problems });
  // Cannot come from storage, whose validator requires the 7 days; stored data never throws.
  const days = fullWeek(stored);
  if (days === null) return fallback([]);

  const walk = data.templates.find((t) => t.kind === 'walk');
  const unknown = (id: SeedId) => templateById(data, id) === undefined;
  const lockedJog = (id: SeedId) => !ctx.jogUnlocked && templateById(data, id)?.kind === 'jog';
  const adjusted = days.map((day) => {
    const ids: SeedId[] = [];
    for (const id of day.templateIds) {
      if (unknown(id)) continue;
      if (!lockedJog(id)) ids.push(id);
      else if (walk !== undefined && !day.templateIds.includes(walk.id) && !ids.includes(walk.id)) {
        ids.push(walk.id);
      }
    }
    return { weekday: day.weekday, templateIds: ids };
  });
  const jogShownAsWalk = days.some((day) => day.templateIds.some(lockedJog));
  const changed = jogShownAsWalk || days.some((day) => day.templateIds.some(unknown));
  const problems = checkWeeklyPattern(data, adjusted, ctx);
  if (problems.length > 0) return fallback(problems);
  return frozenWeek({
    days: adjusted,
    source: changed ? 'stored-adjusted' : 'stored',
    jogShownAsWalk,
    problems: [],
  });
}

/** The templates planned on a date's ISO weekday, in stored order. */
export function templatesOn(
  data: ExerciseData,
  week: ResolvedWeek,
  date: LocalDate,
): SessionTemplate[] {
  const weekday = isoWeekdayOf(date);
  const ids = week.days.find((d) => d.weekday === weekday)?.templateIds ?? [];
  return ids
    .map((id) => templateById(data, id))
    .filter((t): t is SessionTemplate => t !== undefined);
}

/**
 * The seven days from weekStart, each with its state from the rows dated that day: done (a done
 * row, or ticked sets on an earlier day); rested (a rested or skipped row); planned (sessions
 * planned, today or later); not-done (sessions planned on an earlier day); otherwise a rest day.
 */
export function weekDays(
  data: ExerciseData,
  week: ResolvedWeek,
  sessions: readonly SessionRecord[],
  weekStart: LocalDate,
  today: LocalDate,
): DayView[] {
  return Array.from({ length: 7 }, (_, i) => {
    const date = addDays(weekStart, i);
    const rows = sessions.filter((s) => s.date === date);
    const templateIds = templatesOn(data, week, date).map((t) => t.id);
    let state: DayState;
    if (rows.some((r) => r.status === 'done' || (date < today && hasTicks(r)))) state = 'done';
    else if (rows.some((r) => r.status === 'rested' || r.status === 'skipped')) state = 'rested';
    else if (templateIds.length > 0) state = date < today ? 'not-done' : 'planned';
    else state = 'rest-day';
    return Object.freeze({ date, templateIds: Object.freeze(templateIds), state });
  });
}

/**
 * This session plus the later days of today's ISO week that hold an available main slot for the
 * exercise: the weekly amount left is shared between them (C76). Always at least 1.
 */
export function occurrencesLeft(
  data: ExerciseData,
  week: ResolvedWeek,
  exerciseId: string,
  today: LocalDate,
  equipment: EquipmentToggles,
): number {
  const sunday = addDays(weekStartOf(today), 6);
  let count = 1;
  for (let date = addDays(today, 1); date <= sunday; date = addDays(date, 1)) {
    const planned = templatesOn(data, week, date).some((t) =>
      t.main.some((s) => s.exerciseId === exerciseId && slotAvailable(data, s, equipment)),
    );
    if (planned) count += 1;
  }
  return count;
}
