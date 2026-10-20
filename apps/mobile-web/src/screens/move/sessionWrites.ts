/**
 * Every sessions write of the Move screens (item 27 design section 1.16; item 26 3.14 point 5).
 * Each one is checked with item 26's sessionWriteProblem first, on the stored row merged with the
 * change, so no row with work is written without the pre-session check and no row after a yes
 * holds more than the lighter session (HS-29). An update sends only its patch, so ticks written
 * meanwhile in another tab are never overwritten by a stale whole row.
 */
import {
  type ExerciseData,
  type Id,
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
import { StorageRuleError } from '../../db/errors';
import type { UpdatePatch } from '../../db/repos';
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

/** The id a draft is checked under before the repository gives it its own. */
const PLACEHOLDER_ID = '00000000-0000-4000-8000-000000000000';

function check(data: ExerciseData, candidate: SessionRecord): void {
  const problem = sessionWriteProblem(data, candidate);
  if (problem !== null) throw new MoveWriteRefused(problem);
}

/** Create: the full draft. Update: only the changed fields. */
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
): Promise<SessionRecord>;
export async function writeSession(
  storage: AppStorage,
  data: ExerciseData,
  id: Id | null,
  change: SessionDraft | UpdatePatch<'sessions'>,
): Promise<SessionRecord> {
  const { sessions } = storage.repos;
  if (id === null) {
    const draft = change as SessionDraft;
    check(data, { id: PLACEHOLDER_ID, ...draft, completedAt: null, timeZone: null });
    return sessions.create(draft);
  }
  const stored = await sessions.get(id);
  if (stored === undefined) throw new StorageRuleError('sessions', 'not-found');
  check(data, { ...stored, ...change });
  return sessions.update(id, change);
}

/** Removes an unchecked rest with no work ("Undo rest"); anything else is left. */
export async function removeRestedSession(storage: AppStorage, id: Id): Promise<boolean> {
  const row = await storage.repos.sessions.get(id);
  if (row?.status !== 'rested' || row.preCheck !== null || sessionHasWork(row)) return false;
  await storage.repos.sessions.remove(id);
  return true;
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
 * answered on; today's rows are read again, and the start gate is run on them, so midnight, a
 * second tab or a quick second tap writes nothing. A planned or lighter choice writes item 26's
 * planSession, which is the lighter session after any yes whatever was asked; a rest writes a
 * rested row with the check, and a reopened rest stays as it is.
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
  const { ctx, templateId, check: preCheck, choice, reopened } = input;
  const state = sessionScreenState(data, ctx, templateId, null);
  let reuseRowId: Id | null;
  if (state.kind === 'before-start' && reopened === null) reuseRowId = state.reuseRowId;
  else if (state.kind === 'rested' && reopened !== null && state.row.id === reopened) {
    reuseRowId = reopened;
  } else throw new MoveWriteRefused('changed');

  const fresh = await storage.repos.sessions.list();
  const today = fresh.filter((r) => r.date === ctx.today && r.templateId === templateId);
  const taken = today.some(
    (r) =>
      r.id !== reuseRowId &&
      (r.status !== 'planned' || r.preCheck !== null || r.movements.some((m) => m.done.length > 0)),
  );
  const reused = reuseRowId === null ? null : today.find((r) => r.id === reuseRowId);
  const reusedChanged =
    reused === undefined ||
    (reused !== null &&
      (sessionHasWork(reused) ||
        (reopened === null
          ? reused.status !== 'planned' || reused.preCheck !== null
          : reused.status !== 'rested' || reused.preCheck === null)));
  const gate = startGateFor(data, { ...ctx, sessions: fresh }, templateId, reuseRowId);
  const template = templateById(data, templateId);
  if (taken || reusedChanged || gate.kind !== 'ready' || template === undefined) {
    throw new MoveWriteRefused('changed');
  }

  if (choice === 'rest') {
    if (reopened !== null) return;
    if (reuseRowId === null) {
      await writeSession(
        storage,
        data,
        null,
        restedSessionDraft({ today: ctx.today, templateId: template.id, preCheck }),
      );
    } else {
      await writeSession(storage, data, reuseRowId, { status: 'rested', preCheck });
    }
    return;
  }
  const plan = planSession(data, template, {
    preCheck,
    choice,
    equipment: ctx.equipment,
    sessions: fresh,
    week: ctx.week,
    today: ctx.today,
    sessionId: reuseRowId,
    variantOverrides: new Map(),
  });
  const draft = startedSessionDraft({ today: ctx.today, templateId: template.id, preCheck, plan });
  if (reuseRowId === null) await writeSession(storage, data, null, draft);
  else {
    await writeSession(storage, data, reuseRowId, {
      status: 'planned',
      preCheck,
      movements: draft.movements,
    });
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
