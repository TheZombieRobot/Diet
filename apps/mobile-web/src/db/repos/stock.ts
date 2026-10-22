/**
 * The garden and pantry rows for the stock read (item 19 design section 3; G18): one read-only
 * transaction, so the two lists are from the same moment. Read only: the planner and the grocery
 * list never write these stores, and nothing here reaches the photos.
 */
import type { GardenRecord, PantryRecord } from '@diet/core';
import Dexie from 'dexie';
import type { RepoContext } from './context';

export interface StockRepo {
  readonly rows: () => Promise<{ garden: GardenRecord[]; pantry: PantryRecord[] }>;
}

export function stockRepo({ db }: RepoContext): StockRepo {
  return {
    rows: () =>
      db.transaction('r', ['garden', 'pantry'], () =>
        Dexie.Promise.all([db.garden.toArray(), db.pantry.toArray()]).then(([garden, pantry]) => ({
          garden,
          pantry,
        })),
      ),
  };
}
