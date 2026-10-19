/**
 * The relay's configuration (wrangler.jsonc `vars` and bindings), checked on every request. Any
 * fault means "misconfigured": the relay answers 500 and never touches KV (design R7, R10, R25).
 */
import { isRelayOrigin, RELAY_TTL_SECONDS_BOUNDS } from '@diet/core/relay';
import type { KvSubset, RateLimiterSubset } from './kv';

/** Every member is optional so the misconfigured paths can be tested. */
export interface RelayEnv {
  readonly RELAY_KV?: KvSubset;
  readonly RELAY_TTL_SECONDS?: string;
  readonly ALLOWED_ORIGINS?: string;
  readonly RELAY_WRITE_LIMIT?: RateLimiterSubset;
  readonly RELAY_READ_LIMIT?: RateLimiterSubset;
}

export type RelayConfig =
  | { ok: true; ttlSeconds: number; allowedOrigins: ReadonlySet<string>; kv: KvSubset }
  /** `problem` is for tests only: the answer is always `misconfigured`. */
  | { ok: false; problem: 'ttl' | 'origins' | 'kv' };

/** The extension's origin, added to ALLOWED_ORIGINS at item 32 (its pinned 32-letter id). */
const EXTENSION_ORIGIN = /^chrome-extension:\/\/[a-p]{32}$/;
/** Item 31's local test server only; the deployed Worker never allows these. */
const LOOPBACK_ORIGIN = /^http:\/\/(?:localhost|127\.0\.0\.1):\d{1,5}$/;

/** An origin that may go on the allowlist: the app's kind, the extension's, or loopback in tests. */
export function isAllowedClientOrigin(value: string, opts: { allowLoopback: boolean }): boolean {
  return (
    isRelayOrigin(value) ||
    EXTENSION_ORIGIN.test(value) ||
    (opts.allowLoopback && LOOPBACK_ORIGIN.test(value))
  );
}

function parseTtl(value: unknown): number | null {
  if (typeof value !== 'string' || !/^\d+$/.test(value)) return null;
  const seconds = Number(value);
  return seconds >= RELAY_TTL_SECONDS_BOUNDS.min && seconds <= RELAY_TTL_SECONDS_BOUNDS.max
    ? seconds
    : null;
}

/** Comma-separated, each entry trimmed, allowed and listed once; at least one. */
function parseOrigins(value: unknown, allowLoopback: boolean): ReadonlySet<string> | null {
  if (typeof value !== 'string') return null;
  const entries = value.split(',').map((entry) => entry.trim());
  const valid = entries.every((entry) => isAllowedClientOrigin(entry, { allowLoopback }));
  const unique = new Set(entries);
  return valid && unique.size === entries.length ? unique : null;
}

function isKv(value: unknown): value is KvSubset {
  if (typeof value !== 'object' || value === null) return false;
  const kv = value as Record<string, unknown>;
  return ['getWithMetadata', 'put', 'delete'].every((name) => typeof kv[name] === 'function');
}

export function parseRelayConfig(
  env: RelayEnv,
  deps: { allowLoopbackOrigins: boolean },
): RelayConfig {
  const ttlSeconds = parseTtl(env.RELAY_TTL_SECONDS);
  if (ttlSeconds === null) return { ok: false, problem: 'ttl' };
  const allowedOrigins = parseOrigins(env.ALLOWED_ORIGINS, deps.allowLoopbackOrigins);
  if (allowedOrigins === null) return { ok: false, problem: 'origins' };
  const kv: unknown = env.RELAY_KV;
  if (!isKv(kv)) return { ok: false, problem: 'kv' };
  return { ok: true, ttlSeconds, allowedOrigins, kv };
}
