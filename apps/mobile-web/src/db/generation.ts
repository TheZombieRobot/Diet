/**
 * The records' generation (storage spec section 10.5 step 6; the regression review): a random id
 * in localStorage, made anew when the database is created (populate, which also follows
 * delete-all) and when a restore replaces the records. An unanswered "Can you see the file?"
 * (screens/backup/pendingCheck.ts) remembers the generation its file was made from, and Yes
 * records the backup only while it is still the same. So a tab that missed another tab's restore
 * or delete-all (Chrome discarded it, and it kept its sessionStorage) cannot record a backup of
 * records that are no longer on the phone. It holds no record, is never backed up, and delete-all
 * clears it with the rest of localStorage. Where localStorage is blocked it reads as null on both
 * sides, and the gate message (runtime.ts) is the only guard.
 */
export const DB_GENERATION_KEY = 'diet-db-generation';

/** The current generation, or null when there is none or localStorage is blocked. */
export function readGeneration(storage: () => Storage): string | null {
  try {
    return storage().getItem(DB_GENERATION_KEY);
  } catch {
    return null;
  }
}

/** Starts a new generation: the records were created or replaced. */
export function newGeneration(storage: () => Storage, randomId: () => string): void {
  try {
    storage().setItem(DB_GENERATION_KEY, randomId());
  } catch {
    // Blocked storage: the generation stays unknown.
  }
}

/** At startup: a new generation for a database just created, or when none is recorded. */
export function ensureGeneration(
  storage: () => Storage,
  randomId: () => string,
  created: boolean,
): void {
  if (created || readGeneration(storage) === null) newGeneration(storage, randomId);
}
