/**
 * Every sessions write of the Move screens (item 27 design section 1.16; item 26 3.14 point 5).
 * Each one is checked inside its own write transaction (repos/sessions.ts), on the stored rows as
 * they are at that moment: item 26's sessionWriteProblem on the row the write would leave, so no
 * row with work is written without the pre-session check and no row after a yes holds more than
 * the lighter session (HS-29); and the state the screen showed, so a tab that has not caught up
 * never undoes what another tab did, two tabs never both start a session, and nothing is logged
 * for a day that has ended (item 27 review). An update sends only its patch, so ticks written
 * meanwhile in another tab are never overwritten by a stale whole row.
 */
import {
  type ExerciseData,
  type Id,
  type LocalDate,
  localDateOf,
  type MoveContext,
  type PreCheck,
  planSession,
  restedSessionDraft,
  type SessionDraft,
  sessionHasWork,
  type SessionRecord,
  sessionScreenState,
  sessionWriteProblem,
  startedSessionDraft,
  startGateFor,
  templateById,
} from '@diet/core';
import { moveScreen } from '@diet/core/copy/health';
import type { UpdatePatch } from '../../db/repos';
import type { SessionsRule } from '../../db/repos/sessions';
import type { AppStorage } from '../../db/runtime';
import { saveFailureMessage } from '../../onboarding/useSave';

export type MoveRefusal = 'no-pre-check' | 'lighter-only' | 'changed';

/** A write refused before it reached the records: nothing was changed. */
export class MoveWriteRefused extends Error {
  readonly code: MoveRefusal;

  constructor(code: MoveRefusal) {
    super(`The session write was refused: ${code}`);
    this.name = 'MoveWriteRefused';
    this.code = code;
  }
}

/**
 * What a stored row must still be for an update to go ahead, read inside the write:
 * - 'in-progress': started with the check and dated today (a tick, Undo, a version change);
 * - 'unticked': the same with nothing ticked ("Rest instead" in the session);
 * - 'unchecked': an unchecked row with no work, dated today ("Rest instead" on Move or Today);
 * - 'finishable': with its check, in progress or done (Save on the finish card);
 * - 'done': done (a rating changed on Move or Today).
 */
export type RowState = 'in-progress' | 'unticked' | 'unchecked' | 'finishable' | 'done';

/** @transactionScope The phone's date now, read inside the write. */
function todayOf(storage: AppStorage): LocalDate {
  return localDateOf(storage.env.now(), storage.env.timeZone());
}

const ticked = (row: SessionRecord): boolean => row.movements.some((m) => m.done.length > 0);

/** @transactionScope Whether the stored row is still in `state` (RowState). */
function rowIs(state: RowState, row: SessionRecord, today: LocalDate): boolean {
  const inProgress = row.status === 'planned' && row.preCheck !== null;
  switch (state) {
    case 'in-progress':
      return inProgress && row.date === today;
    case 'unticked':
      return inProgress && row.date === today && !ticked(row);
    case 'unchecked':
      return (
        row.status === 'planned' &&
        row.preCheck === null &&
        !sessionHasWork(row) &&
        row.date === today
      );
    case 'finishable':
      return row.preCheck !== null && (row.status === 'planned' || row.status === 'done');
    case 'done':
      return row.status === 'done';
  }
}

/** @transactionScope Item 26's write check on the row as it would be written (HS-29). */
function refuseProblem(data: ExerciseData, next: SessionRecord): void {
  const problem = sessionWriteProblem(data, next);
  if (problem !== null) throw new MoveWriteRefused(problem);
}

/**
 * @transactionScope A new row only for today, and only while no other row of its session today
 * was started, finished or rested.
 */
function refuseTaken(
  next: SessionRecord,
  reuseRowId: Id | null,
  rows: readonly SessionRecord[],
  today: LocalDate,
): void {
  const taken = rows.some(
    (r) =>
      r.id !== reuseRowId &&
      r.date === next.date &&
      r.templateId === next.templateId &&
      (r.status !== 'planned' || r.preCheck !== null || ticked(r)),
  );
  if (next.date !== today || taken) throw new MoveWriteRefused('changed');
}

/**
 * Create: the full draft, for today. Update: only the changed fields, while the row is `state`;
 * a change of the movements worked out from `basis` (the row as read) goes ahead only while the
 * stored movements are still those, so a tick from another tab in between is never lost.
 */
export function writeSession(
  storage: AppStorage,
  data: ExerciseData,
  id: null,
  draft: SessionDraft,
): Promise<SessionRecord>;
export function writeSession(
  storage: AppStorage,
  data: ExerciseData,
  id: Id,
  patch: UpdatePatch<'sessions'>,
  state: RowState,
  basis?: SessionRecord,
): Promise<SessionRecord>;
export function writeSession(
  storage: AppStorage,
  data: ExerciseData,
  id: Id | null,
  change: SessionDraft | UpdatePatch<'sessions'>,
  state?: RowState,
  basis?: SessionRecord,
): Promise<SessionRecord> {
  const { sessions } = storage.repos;
  if (id === null) {
    /** @transactionScope */
    const rule: SessionsRule = (next, _stored, rows) => {
      refuseProblem(data, next);
      refuseTaken(next, null, rows, todayOf(storage));
    };
    return sessions.createChecked(change as SessionDraft, rule);
  }
  /** @transactionScope */
  const rule: SessionsRule = (next, stored) => {
    refuseProblem(data, next);
    if (
      stored === null ||
      state === undefined ||
      !rowIs(state, stored, todayOf(storage)) ||
      (basis !== undefined && JSON.stringify(stored.movements) !== JSON.stringify(basis.movements))
    ) {
      throw new MoveWriteRefused('changed');
    }
  };
  return sessions.updateChecked(id, change, rule);
}

/** Removes an unchecked rest of today with no work ("Undo rest"); anything else is left. */
export function removeRestedSession(storage: AppStorage, id: Id): Promise<boolean> {
  /** @transactionScope */
  const removable = (row: SessionRecord): boolean =>
    row.status === 'rested' &&
    row.preCheck === null &&
    !sessionHasWork(row) &&
    row.date === todayOf(storage);
  return storage.repos.sessions.removeIf(id, removable);
}

export interface StartInput {
  /** The context the choice was made in. */
  readonly ctx: MoveContext;
  readonly templateId: string;
  readonly check: PreCheck;
  readonly choice: 'planned' | 'lighter' | 'rest';
  /** A rest from the check being changed back (the stored answers, locked), or null. */
  readonly reopened: Id | null;
}

/** Starts in this tab run one after another, so the second reads the first's row (N31). */
let startQueue: Promise<unknown> = Promise.resolve();

/**
 * The choice after the check (item 27 design 1.8). The screen must still be what the owner
 * answered on; then, inside the write, the phone's date must still be the day answered for, no
 * other row of the session may be started, finished or rested that day, the reused row must be as
 * it was, and the start gate is run on the stored rows, so midnight, a second tab or a quick
 * second tap writes nothing. A planned or lighter choice writes item 26's planSession, which is
 * the lighter session after any yes whatever was asked, and also while a Kickstart stop sign or a
 * fast past 24 hours holds (ruling 9); a rest writes a rested row with the check, and a reopened
 * rest stays as it is.
 */
export function startSession(
  storage: AppStorage,
  data: ExerciseData,
  input: StartInput,
): Promise<void> {
  const run = startQueue.then(() => startOnce(storage, data, input));
  startQueue = run.catch(() => undefined);
  return run;
}

async function startOnce(
  storage: AppStorage,
  data: ExerciseData,
  input: StartInput,
): Promise<void> {
  const { ctx, templateId, check: preCheck, reopened } = input;
  const ruling9 = ctx.stopSignOn !== null || ctx.fastOverCeiling;
  const choice = input.choice === 'planned' && ruling9 ? 'lighter' : input.choice;
  const state = sessionScreenState(data, ctx, templateId, null);
  let reuseRowId: Id | null;
  if (state.kind === 'before-start' && reopened === null) reuseRowId = state.reuseRowId;
  else if (state.kind === 'rested' && reopened !== null && state.row.id === reopened) {
    reuseRowId = reopened;
  } else throw new MoveWriteRefused('changed');
  const template = templateById(data, templateId);
  if (template === undefined) throw new MoveWriteRefused('changed');
  // A reopened rest kept as a rest: nothing to write.
  if (choice === 'rest' && reopened !== null) return;

  /** @transactionScope The start, checked on the stored rows inside its write. */
  const rule: SessionsRule = (next, stored, rows) => {
    refuseProblem(data, next);
    refuseTaken(next, reuseRowId, rows, todayOf(storage));
    const reusedChanged =
      reuseRowId !== null &&
      (stored === null ||
        sessionHasWork(stored) ||
        (reopened === null
          ? stored.status !== 'planned' || stored.preCheck !== null
          : stored.status !== 'rested' || stored.preCheck === null));
    const gate = startGateFor(data, { ...ctx, sessions: rows }, templateId, reuseRowId);
    if (next.date !== ctx.today || reusedChanged || gate.kind !== 'ready') {
      throw new MoveWriteRefused('changed');
    }
  };

  const { sessions } = storage.repos;
  if (choice === 'rest') {
    if (reuseRowId === null) {
      await sessions.createChecked(
        restedSessionDraft({ today: ctx.today, templateId: template.id, preCheck }),
        rule,
      );
    } else {
      await sessions.updateChecked(reuseRowId, { status: 'rested', preCheck }, rule);
    }
    return;
  }
  const plan = planSession(data, template, {
    preCheck,
    choice,
    equipment: ctx.equipment,
    sessions: await sessions.list(),
    week: ctx.week,
    today: ctx.today,
    sessionId: reuseRowId,
    variantOverrides: new Map(),
  });
  const draft = startedSessionDraft({ today: ctx.today, templateId: template.id, preCheck, plan });
  if (reuseRowId === null) await sessions.createChecked(draft, rule);
  else {
    await sessions.updateChecked(
      reuseRowId,
      { status: 'planned', preCheck, movements: draft.movements },
      rule,
    );
  }
}

/** The message for a failed Move write: its own refusals, then the app's (useSave's argument). */
export function moveSaveMessage(error: unknown): string | null {
  if (error instanceof MoveWriteRefused) {
    if (error.code === 'no-pre-check') return moveScreen.errors.noCheck;
    if (error.code === 'lighter-only') return moveScreen.errors.lighterOnly;
    return moveScreen.errors.changed;
  }
  if (error instanceof RangeError && error.message === 'max-sets')
    return moveScreen.session.maxSets;
  return saveFailureMessage(error);
}
