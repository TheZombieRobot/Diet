/**
 * The session screen's state and today's summary (item 27 design section 2.3; HS-28, HS-29,
 * RD-05, M29). The resolver, every Start link and the session flow all go through
 * sessionScreenState, which goes through item 26's start gate.
 */
import {
  type BeforeStartStep,
  type ExerciseData,
  type SessionTemplate,
  sessionHasWork,
  type StartProblem,
  templateById,
} from '../exercise';
import type { Id } from '../storage/primitives';
import type { SessionRecord } from '../storage/records';
import type { LocalDate } from '../util/time';
import { type MoveContext, startGateFor } from './context';
import { templateSlug } from './display';
import type { TodayItem } from './items';

export type CompleteTarget =
  | { readonly kind: 'finish'; readonly templateId: string }
  | { readonly kind: 'start'; readonly templateId: string }
  | { readonly kind: 'choose' }
  | { readonly kind: 'none' };

/**
 * Where "Complete workout" goes (item 26 3.14 point 6): a started session at its finish step
 * (also one its gate now refuses, which can only be finished), else the one session not started
 * at its start, a chooser for two, or nothing. It never writes.
 */
export function completeWorkoutTarget(items: readonly TodayItem[]): CompleteTarget {
  const started = items.find(
    (i) => i.state === 'in-progress' && templateSlug(i.templateId) !== null,
  );
  if (started !== undefined) return { kind: 'finish', templateId: started.templateId };
  const startable = items.filter(
    (i) => i.planned && i.template !== null && i.state === 'not-started',
  );
  const [only] = startable;
  if (startable.length === 1 && only !== undefined) {
    return { kind: 'start', templateId: only.templateId };
  }
  return startable.length > 1 ? { kind: 'choose' } : { kind: 'none' };
}

export type TodayHeadline =
  | { readonly kind: 'rest-day' }
  | { readonly kind: 'planned'; readonly templateIds: readonly string[] }
  | { readonly kind: 'done' }
  | { readonly kind: 'rested' };

/** Today's line on the week card: never a failure (HS section 6 "Rest … counted as success"). */
export function todayHeadline(items: readonly TodayItem[]): TodayHeadline {
  if (items.length === 0) return { kind: 'rest-day' };
  const open = items.filter(
    (i) => i.planned && (i.state === 'not-started' || i.state === 'in-progress'),
  );
  if (open.length > 0) return { kind: 'planned', templateIds: open.map((i) => i.templateId) };
  return items.every((i) => i.state === 'rested') ? { kind: 'rested' } : { kind: 'done' };
}

export type RestUndo = 'remove' | 'reopen' | null;

export type SessionScreenState =
  | { readonly kind: 'blocked' }
  | {
      readonly kind: 'refused';
      readonly problem: StartProblem;
      readonly template: SessionTemplate | null;
    }
  | {
      readonly kind: 'before-start';
      readonly template: SessionTemplate;
      readonly steps: readonly BeforeStartStep[];
      readonly reuseRowId: Id | null;
    }
  | { readonly kind: 'log'; readonly template: SessionTemplate; readonly row: SessionRecord }
  | {
      readonly kind: 'finish-only';
      readonly reason: StartProblem | 'day-changed';
      readonly template: SessionTemplate | null;
      readonly row: SessionRecord;
    }
  | {
      readonly kind: 'done';
      readonly template: SessionTemplate | null;
      readonly row: SessionRecord;
      readonly editable: boolean;
    }
  | {
      readonly kind: 'rested';
      readonly template: SessionTemplate | null;
      readonly row: SessionRecord;
      readonly undo: RestUndo;
    };

/**
 * What an undo of a rest does (N5): an unchecked rest today with no work is removed; a rest chosen
 * from the check today is reopened (its answers kept) while the gate still lets it start; anything
 * else (skipped, an earlier day, a refusal) has no undo.
 */
export function restUndo(data: ExerciseData, ctx: MoveContext, row: SessionRecord): RestUndo {
  if (row.date !== ctx.today || row.status !== 'rested') return null;
  if (row.preCheck === null) return sessionHasWork(row) ? null : 'remove';
  return startGateFor(data, ctx, row.templateId, row.id).kind === 'ready' ? 'reopen' : null;
}

/**
 * The session screen for one template, in order: (1) RD-05 blocks, whatever is stored; (2) the
 * row the screen had open, when midnight has passed, stays in view to be finished or read; (3) a
 * slug that is no template is refused; (4) today's item for the template, by its state, with an
 * in-progress row the gate now refuses kept for finishing only; (5) otherwise the gate decides.
 */
export function sessionScreenState(
  data: ExerciseData,
  ctx: MoveContext,
  templateId: string | null,
  pinnedRowId: Id | null,
): SessionScreenState {
  // Compared as unknown: only exactly true opens exercise plans (C41).
  if ((ctx.gates.exercisePlansAvailable as unknown) !== true) return { kind: 'blocked' };
  const template = (id: string) => templateById(data, id) ?? null;

  const pinned = pinnedRowId === null ? undefined : ctx.sessions.find((s) => s.id === pinnedRowId);
  if (pinned !== undefined && pinned.date < ctx.today && pinned.templateId === templateId) {
    const t = template(pinned.templateId);
    if (pinned.status === 'planned' && pinned.preCheck !== null) {
      return { kind: 'finish-only', reason: 'day-changed', template: t, row: pinned };
    }
    if (pinned.status === 'done') {
      return { kind: 'done', template: t, row: pinned, editable: false };
    }
    if (pinned.status === 'rested' || pinned.status === 'skipped') {
      return { kind: 'rested', template: t, row: pinned, undo: null };
    }
  }

  if (templateId === null) return { kind: 'refused', problem: 'unknown-template', template: null };
  const item = ctx.items.find((i) => i.templateId === templateId);
  if (item !== undefined && item.row !== null && item.state !== 'not-started') {
    const { row } = item;
    if (item.state === 'done') {
      return { kind: 'done', template: item.template, row, editable: row.preCheck !== null };
    }
    if (item.state === 'rested') {
      return { kind: 'rested', template: item.template, row, undo: restUndo(data, ctx, row) };
    }
    const gate = startGateFor(data, ctx, templateId, row.id);
    if (gate.kind === 'blocked') return { kind: 'blocked' };
    if (gate.kind === 'ready' && item.template !== null) {
      return { kind: 'log', template: item.template, row };
    }
    const reason = gate.kind === 'refused' ? gate.problem : 'unknown-template';
    return { kind: 'finish-only', reason, template: item.template, row };
  }

  const reuseRowId = item?.row?.id ?? null;
  const gate = startGateFor(data, ctx, templateId, reuseRowId);
  if (gate.kind === 'blocked') return { kind: 'blocked' };
  const t = template(templateId);
  if (gate.kind === 'refused' || t === null) {
    return {
      kind: 'refused',
      problem: gate.kind === 'refused' ? gate.problem : 'unknown-template',
      template: t,
    };
  }
  return { kind: 'before-start', template: t, steps: gate.steps, reuseRowId };
}

/**
 * The history list (EX-04): rows dated today or earlier that are done, rested or skipped, or have
 * a ticked set; newest first, then the latest finished, then by id. Throws when `limit` is below 1.
 */
export function historyRows(
  sessions: readonly SessionRecord[],
  today: LocalDate,
  limit: number,
): SessionRecord[] {
  if (!Number.isInteger(limit) || limit < 1) {
    throw new RangeError(`historyRows needs a limit of 1 or more, got ${limit}`);
  }
  return sessions
    .filter(
      (s) =>
        s.date <= today && (s.status !== 'planned' || s.movements.some((m) => m.done.length > 0)),
    )
    .sort((a, b) => {
      if (a.date !== b.date) return a.date < b.date ? 1 : -1;
      const ac = a.completedAt;
      const bc = b.completedAt;
      if (ac !== bc) {
        if (ac === null) return 1;
        if (bc === null) return -1;
        return ac < bc ? 1 : -1;
      }
      return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
    })
    .slice(0, limit);
}
