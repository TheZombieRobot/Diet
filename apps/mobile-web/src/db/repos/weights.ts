/**
 * Weigh-ins (storage spec sections 4.6 and 8.2; C42). The generic repository, plus the
 * onboarding weight (at most one, section 5 rule 4) and a query by local date (section 3.6).
 */
import {
  DEFAULT_HOME_TIME_ZONE,
  type LocalDate,
  localDateOf,
  resolveZone,
  utcRangeCovering,
  type WeightRecord,
} from '@diet/core';
import Dexie from 'dexie';
import type { RepoContext } from './context';
import { type CreateInput, type CrudRepo, crudRepo } from './crud';

export interface WeightsRepo extends CrudRepo<'weights'> {
  /** The weight entered at onboarding, as the first weights row (C42). A second one is refused. */
  readonly addOnboardingWeight: (
    input: Omit<CreateInput<'weights'>, 'source'>,
  ) => Promise<WeightRecord>;
  /** Weigh-ins whose local date, in their own recorded zone, lies in [from, to]. */
  readonly between: (from: LocalDate, to: LocalDate) => Promise<WeightRecord[]>;
}

export function weightsRepo(ctx: RepoContext): WeightsRepo {
  const crud = crudRepo(ctx, 'weights');
  const { db } = ctx;
  return {
    ...crud,
    addOnboardingWeight: (input) => crud.create({ ...input, source: 'onboarding' }),
    between: async (from, to) => {
      const { lower, upper } = utcRangeCovering(from, to);
      const [rows, settings] = await db.transaction('r', ['weights', 'settings'], () =>
        Dexie.Promise.all([
          db.weights.where('at').between(lower, upper, true, false).toArray(),
          db.settings.get('singleton'),
        ]),
      );
      const home = settings?.homeTimeZone ?? DEFAULT_HOME_TIME_ZONE;
      return rows.filter((w) => {
        const date = localDateOf(
          w.at,
          resolveZone(w.timeZone, home, DEFAULT_HOME_TIME_ZONE).timeZone,
        );
        return date >= from && date <= to;
      });
    },
  };
}
