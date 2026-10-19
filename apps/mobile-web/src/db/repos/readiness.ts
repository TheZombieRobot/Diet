/**
 * Readiness answers (storage spec sections 4.4, 8.2 and 13; C41, D29). One row per answered
 * question or confirmation; no row means unanswered, and unanswered counts as gated. Nothing is
 * ever seeded.
 *
 * answer(id, yesNo) stamps the current wording version and answeredAt. Answering q3 deletes any
 * prescriberAgreed row, and answering q6 any gpExerciseDiscussed row, in the same transaction, so
 * re-answering needs a fresh confirmation. A confirmation is refused unless its question has a
 * row under the current wording.
 */
import {
  CONFIRMATION_QUESTION,
  READINESS_CONFIRMATION_IDS,
  READINESS_WORDING,
  type ReadinessConfirmationId,
  type ReadinessId,
  type ReadinessRecord,
  type YesNo,
} from '@diet/core';
import Dexie from 'dexie';
import { StorageRuleError } from '../errors';
import { prepare } from '../prepare';
import { guardedWrite, type RepoContext } from './context';
import { assertOp } from './crud';

export interface ReadinessRepo {
  readonly list: () => Promise<ReadinessRecord[]>;
  readonly answer: (id: ReadinessId, answer: YesNo) => Promise<ReadinessRecord>;
  /** Removes an answer (tests and a future rewording). */
  readonly clear: (id: ReadinessId) => Promise<void>;
}

const isConfirmation = (id: ReadinessId): id is ReadinessConfirmationId =>
  (READINESS_CONFIRMATION_IDS as readonly string[]).includes(id);

/** The confirmation an answer to `id` makes stale (D29). */
const staleConfirmation = (id: ReadinessId): ReadinessConfirmationId | null =>
  READINESS_CONFIRMATION_IDS.find((c) => CONFIRMATION_QUESTION[c] === id) ?? null;

export function readinessRepo(ctx: RepoContext): ReadinessRepo {
  const { db, env } = ctx;
  return {
    list: () => {
      assertOp('readiness', 'list');
      return db.readiness.toArray();
    },
    answer: (id, answer) =>
      guardedWrite(ctx, () => {
        const row = prepare(
          'readiness',
          { questionId: id, answer, wordingVersion: READINESS_WORDING[id], answeredAt: env.now() },
          env,
        );
        const question = isConfirmation(id) ? CONFIRMATION_QUESTION[id] : id;
        const stale = staleConfirmation(id);
        return db.transaction('rw', ['readiness'], () =>
          db.readiness
            .get(question)
            .then((questionRow) => {
              const current =
                questionRow !== undefined &&
                questionRow.wordingVersion === READINESS_WORDING[questionRow.questionId];
              if (isConfirmation(id) && !current) {
                throw new StorageRuleError('readiness', 'confirmation-without-answer');
              }
              const writes: PromiseLike<unknown>[] = [db.readiness.put(row)];
              if (stale !== null) writes.push(db.readiness.delete(stale));
              return Dexie.Promise.all(writes);
            })
            .then(() => row),
        );
      }),
    clear: (id) =>
      guardedWrite(ctx, () => db.transaction('rw', ['readiness'], () => db.readiness.delete(id))),
  };
}
