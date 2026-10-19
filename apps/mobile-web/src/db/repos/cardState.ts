/**
 * Card state (storage spec sections 4.12 and 8.2; C44). One row per card and trigger, keyed by
 * both, so a dismissal applies only to its own trigger. markShown, dismiss and done upsert the row;
 * dismiss also stores the zone the dismissal was made in (section 3.5). done is refused for a card
 * whose dismissal is not final: the rapid-loss and alcohol-help cards can never be turned off
 * (C46). Every time is the moment of writing, never a time ahead (prepare.ts).
 */
import { type CardId, type CardStateRecord, cardTrigger } from '@diet/core';
import { StorageRuleError } from '../errors';
import { prepare } from '../prepare';
import { guardedWrite, type RepoContext } from './context';
import { assertOp } from './crud';

export interface CardStateRepo {
  readonly get: (cardId: CardId, trigger: string) => Promise<CardStateRecord | undefined>;
  readonly markShown: (cardId: CardId, trigger: string) => Promise<CardStateRecord>;
  readonly dismiss: (cardId: CardId, trigger: string) => Promise<CardStateRecord>;
  readonly done: (cardId: CardId, trigger: string) => Promise<CardStateRecord>;
}

type Change = (existing: CardStateRecord | undefined) => Partial<CardStateRecord>;

export function cardStateRepo(ctx: RepoContext): CardStateRepo {
  const { db, env } = ctx;
  const upsert = (cardId: CardId, trigger: string, change: Change) =>
    guardedWrite(ctx, () =>
      db.transaction('rw', ['card_state'], () =>
        db.card_state.get([cardId, trigger]).then((existing) => {
          const base: CardStateRecord = existing ?? {
            cardId,
            trigger,
            firstShownAt: null,
            dismissedAt: null,
            dismissedTimeZone: null,
            doneAt: null,
          };
          const row = prepare(
            'card_state',
            { ...base, ...change(existing) },
            env,
            existing ?? null,
          );
          return db.card_state.put(row).then(() => row);
        }),
      ),
    );
  return {
    get: (cardId, trigger) => {
      assertOp('card_state', 'get');
      return db.card_state.get([cardId, trigger]);
    },
    markShown: (cardId, trigger) =>
      upsert(cardId, trigger, (e) => ({ firstShownAt: e?.firstShownAt ?? env.now() })),
    dismiss: (cardId, trigger) =>
      upsert(cardId, trigger, (e) => {
        const now = env.now();
        return {
          firstShownAt: e?.firstShownAt ?? now,
          dismissedAt: now,
          dismissedTimeZone: env.timeZone(),
        };
      }),
    done: (cardId, trigger) => {
      if (cardTrigger(cardId, trigger)?.dismissal.kind !== 'final') {
        return Promise.reject(new StorageRuleError('card_state', 'not-final'));
      }
      return upsert(cardId, trigger, (e) => {
        const now = env.now();
        return { firstShownAt: e?.firstShownAt ?? now, doneAt: now };
      });
    },
  };
}
