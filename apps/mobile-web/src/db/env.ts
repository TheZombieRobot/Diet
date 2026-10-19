/**
 * The storage environment (storage spec section 8.1): the clock, the device zone and randomness,
 * injected so tests control them. The production version uses the real clock, the device zone of
 * section 3.4 (deviceTimeZone over the home zone) and WebCrypto.
 */
import {
  DEFAULT_HOME_TIME_ZONE,
  deviceTimeZone,
  type Id,
  type Instant,
  type MigrationEnv,
  resolveZone,
  type TimeZone,
} from '@diet/core';

export interface StorageEnv {
  readonly now: () => Instant;
  /** The zone new records take: the device zone, falling back to the home zone (section 3.4). */
  readonly timeZone: () => TimeZone;
  readonly randomId: () => Id;
  readonly randomBytes: (n: number) => Uint8Array;
}

/** settings.homeTimeZone as last read, so new records never take an unusable zone (section 3.4). */
let homeTimeZone: TimeZone = DEFAULT_HOME_TIME_ZONE;

export function rememberHomeTimeZone(zone: TimeZone): void {
  homeTimeZone = zone;
}

export function browserEnv(): StorageEnv {
  return {
    now: () => new Date().toISOString(),
    timeZone: () => deviceTimeZone(resolveZone(homeTimeZone, DEFAULT_HOME_TIME_ZONE).timeZone),
    randomId: () => crypto.randomUUID(),
    randomBytes: (n) => crypto.getRandomValues(new Uint8Array(n)),
  };
}

/** The migration environment of one moment (section 9.3), for runUpgrade and import. */
export function migrationEnv(env: StorageEnv): MigrationEnv {
  return { now: env.now(), timeZone: env.timeZone(), randomId: () => env.randomId() };
}
