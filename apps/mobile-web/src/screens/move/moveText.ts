/**
 * The Move screens' text put together from health.ts (item 27 design section 1.16): amounts,
 * the week strip's chips and sentences, and the logged movements of a session.
 */
import {
  type DayState,
  type DayView,
  estimateSeconds,
  type Exercise,
  type ExerciseData,
  exerciseById,
  fillTemplate,
  heatWaterMl,
  joinList,
  type MoveContext,
  type SessionRecord,
  type SessionTemplate,
  type TemplateSlot,
  templateById,
  todayHeadline,
  variantOf,
} from '@diet/core';
import { move, moveScreen } from '@diet/core/copy/health';
import { formatWeekdayLong } from '../../format';
import { routeHref } from '../../routes';

const { amount: words } = moveScreen;

/** "9 reps", "1 rep", "30 seconds", "15 minutes", "1 minute 30 seconds", "… each side". */
export function amountText(unit: 'reps' | 'seconds', value: number, perSide: boolean): string {
  let text: string;
  if (unit === 'reps') {
    text = value === 1 ? words.rep : fillTemplate(words.reps, { n: value });
  } else if (value < 60) {
    text = fillTemplate(words.seconds, { n: value });
  } else {
    const minutes = Math.floor(value / 60);
    const minuteText = minutes === 1 ? words.minute : fillTemplate(words.minutes, { n: minutes });
    const seconds = value % 60;
    text =
      seconds === 0
        ? minuteText
        : fillTemplate(words.mixed, {
            minutes: minuteText,
            seconds: fillTemplate(words.seconds, { n: seconds }),
          });
  }
  return perSide ? fillTemplate(words.perSide, { amount: text }) : text;
}

/** The known templates of these ids, strength first (the strip's order; item 26 1.2). */
export function templatesOf(data: ExerciseData, ids: readonly string[]): SessionTemplate[] {
  const order = ['strength', 'walk', 'jog'];
  return ids
    .map((id) => templateById(data, id))
    .filter((t): t is SessionTemplate => t !== undefined)
    .map((t, i) => ({ t, i }))
    .sort((a, b) => order.indexOf(a.t.kind) - order.indexOf(b.t.kind) || a.i - b.i)
    .map(({ t }) => t);
}

/** Template names joined as "Session A and Beach walk". */
export function itemNames(data: ExerciseData, ids: readonly string[]): string {
  return joinList(
    templatesOf(data, ids).map((t) => t.name),
    moveScreen.listComma,
    moveScreen.listAnd,
  );
}

/** The strip's chip lines: "Rest", or the short labels of the day's sessions, strength first. */
export function dayChipText(
  data: ExerciseData,
  day: Pick<DayView, 'date' | 'templateIds'>,
  state: DayState,
  rowsThatDay: readonly SessionRecord[],
): string[] {
  if (state === 'rest-day' || state === 'rested') return [move.week.restChip];
  const ids =
    state === 'done' && rowsThatDay.length > 0
      ? [...new Set(rowsThatDay.map((r) => r.templateId))]
      : day.templateIds;
  const labels = templatesOf(data, ids).map((t) => t.shortLabel);
  return labels.length === 0 ? [move.week.restChip] : labels;
}

/**
 * The strip's sentence for one day, for screen readers: "Tuesday: Session A (today)", "Monday:
 * rest day, counts as success". A day whose jog is shown as the walk adds item 26's line.
 */
export function daySentence(
  data: ExerciseData,
  day: Pick<DayView, 'date' | 'templateIds'>,
  state: DayState,
  isToday: boolean,
  shownAsWalk: boolean,
): string {
  const values = { day: formatWeekdayLong(day.date), names: itemNames(data, day.templateIds) };
  const sentence = fillTemplate(moveScreen.week.day[stateKey(state)], values);
  const text = isToday ? fillTemplate(moveScreen.week.today, { text: sentence }) : sentence;
  return shownAsWalk ? `${text}. ${move.jog.shownAsWalk}` : text;
}

const stateKey = (state: DayState): keyof typeof moveScreen.week.day =>
  state === 'rest-day' ? 'restDay' : state === 'not-done' ? 'notDone' : state;

/**
 * The stepper's step: 5 minutes for a timed movement of 10 minutes or more whose own step
 * divides 5 minutes (the walk), otherwise the exercise's step.
 */
export function displayStep(exercise: Exercise, slot: TemplateSlot | null): number {
  if (
    exercise.unit === 'seconds' &&
    300 % exercise.step === 0 &&
    slot !== null &&
    slot.min >= 600
  ) {
    return 300;
  }
  return exercise.step;
}

/** "Squat to a chair: 9 reps, 9 reps" for each movement with ticked sets (history, summaries). */
export function movementLines(data: ExerciseData, row: SessionRecord): string[] {
  return row.movements
    .filter((m) => m.done.length > 0)
    .map((m) => {
      const exercise = exerciseById(data, m.exerciseId);
      const variant = exercise === undefined ? null : variantOf(exercise, m.variant);
      const name = variant?.name ?? exercise?.name ?? moveScreen.today.unknownTemplate;
      const perSide = variant?.perSide ?? false;
      const amounts = m.done.map((set) =>
        set.reps === null
          ? amountText('seconds', set.seconds ?? 0, perSide)
          : amountText('reps', set.reps, perSide),
      );
      return fillTemplate(moveScreen.history.movement, {
        name,
        amounts: amounts.join(moveScreen.listComma),
      });
    });
}

/** The headline of today: a rest day, the sessions planned, all done, or rested (never a failure). */
export function headlineText(data: ExerciseData, ctx: MoveContext): string {
  const headline = todayHeadline(ctx.items);
  switch (headline.kind) {
    case 'rest-day':
      return move.rest.restDay;
    case 'planned':
      return fillTemplate(moveScreen.today.planned, {
        names: itemNames(data, headline.templateIds),
      });
    case 'done':
      return moveScreen.today.allDone;
    case 'rested':
      return move.rest.rested;
  }
}

/** The beach walk's minimum, in minutes, for the tolerated-walk lines (15 in the shipped data). */
export function walkMinutes(data: ExerciseData): number {
  const walk = data.templates.find((t) => t.kind === 'walk');
  return Math.round((walk?.main[0]?.min ?? 0) / 60);
}

/** The line under a walk's or a jog's ratings: what they decide for jogging (C51). */
export function ratingsNote(data: ExerciseData, templateId: string): string | null {
  const kind = templateById(data, templateId)?.kind;
  if (kind === 'walk') {
    return fillTemplate(moveScreen.finish.walkRatings, { minutes: walkMinutes(data) });
  }
  return kind === 'jog' ? moveScreen.finish.jogRatings : null;
}

/** The heat water line of a session (design section 2.6): at least 500 mL, per started hour. */
export function heatWaterText(
  data: ExerciseData,
  template: SessionTemplate,
  ctx: MoveContext,
): string {
  return fillTemplate(moveScreen.before.heatWater, {
    ml: heatWaterMl(estimateSeconds(data, template, 'top', ctx.equipment)),
  });
}

/** A session link: `#/move-session/a`, `#/move-session/a/finish`. */
export const sessionHref = (slug: string, finish = false): string =>
  `${routeHref('move-session')}/${slug}${finish ? '/finish' : ''}`;
