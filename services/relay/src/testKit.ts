/**
 * Offline stand-ins for the relay's tests (design section 5.2): a shared clock, a single-location
 * KV that enforces KV's real option limits, a fixed-window rate limiter, and request builders.
 * Not a test file, so the relay scan rules cover it too.
 *
 * The KV stand-in does not model propagation between Cloudflare locations or cached "not found"
 * answers: a test of those would test the stand-in, not the relay (design 1.6, R28). The owner's
 * smoke check observes them on the real platform.
 */
import { APP_ORIGIN, RELAY_ROOM_HEADER } from '@diet/core/relay';
import type { RelayEnv } from './config';
import type { RelayHandler, RelayRequest } from './handler';
import type { KvSubset, RateLimiterSubset } from './kv';

export interface Clock {
  readonly now: () => number;
  readonly advance: (ms: number) => void;
}

/** t0 is 2000-01-01T00:00:00.000Z, a whole minute, so limiter windows start on it. */
export const T0 = Date.UTC(2000, 0, 1);

export function createClock(startMs = T0): Clock {
  let now = startMs;
  return {
    now: () => now,
    advance: (ms) => {
      now += ms;
    },
  };
}

/** KV's own limits, as miniflare enforces them. */
const KV_MIN_CACHE_TTL_SECONDS = 30;
const KV_MIN_EXPIRATION_TTL_SECONDS = 60;
const KV_MAX_KEY_BYTES = 512;
const KV_MAX_METADATA_BYTES = 1024;
const KV_MIN_MS_BETWEEN_WRITES = 1000;

type KvOp = 'getWithMetadata' | 'put' | 'delete';
interface KvEntry {
  value: string;
  metadata: unknown;
  expiresAtMs: number;
}
const byteLength = (text: string) => new TextEncoder().encode(text).byteLength;

/** One KV location, in memory. A value stays readable `purgeLagMs` past its expiry (N4). */
export class KvModel implements KvSubset {
  /** Writes made through the KV interface (not `seed`). */
  readonly puts: { key: string; value: string; options: unknown }[] = [];
  readonly deletes: string[] = [];
  readonly reads: { key: string; options: unknown }[] = [];
  private readonly entries = new Map<string, KvEntry>();
  private readonly lastPutAt = new Map<string, number>();
  private readonly failures = new Map<KvOp, Error>();
  private readonly clock: Clock;
  private readonly purgeLagMs: number;

  constructor(clock: Clock, options: { purgeLagMs?: number } = {}) {
    this.clock = clock;
    this.purgeLagMs = options.purgeLagMs ?? 0;
  }

  /** The next call of `op` throws `error`. */
  failNext(op: KvOp, error: Error): void {
    this.failures.set(op, error);
  }

  /** Writes storage directly, skipping the option limits (a value edited in the dashboard). */
  seed(key: string, value: string, metadata?: unknown, expiresAtMs = this.clock.now() + 900_000) {
    this.entries.set(key, { value, metadata, expiresAtMs });
  }

  /** What a read would find now. */
  stored(): { key: string; value: string; metadata: unknown }[] {
    return [...this.entries]
      .filter(([, entry]) => this.visible(entry))
      .map(([key, { value, metadata }]) => ({ key, value, metadata }));
  }

  getWithMetadata(
    key: string,
    options: { type: 'text'; cacheTtl: number },
  ): Promise<{ value: string | null; metadata: unknown }> {
    return this.run('getWithMetadata', key, () => {
      this.reads.push({ key, options });
      if (!(options.cacheTtl >= KV_MIN_CACHE_TTL_SECONDS)) {
        throw new Error(`KV GET failed: cacheTtl must be at least ${KV_MIN_CACHE_TTL_SECONDS}`);
      }
      const entry = this.entries.get(key);
      return entry !== undefined && this.visible(entry)
        ? { value: entry.value, metadata: entry.metadata ?? null }
        : { value: null, metadata: null };
    });
  }

  put(
    key: string,
    value: string,
    options: { expirationTtl: number; metadata: { expiresAt: number } },
  ): Promise<void> {
    return this.run('put', key, () => {
      const ttl = options.expirationTtl;
      if (!Number.isInteger(ttl) || ttl < KV_MIN_EXPIRATION_TTL_SECONDS) {
        throw new Error('KV PUT failed: expirationTtl must be an integer of at least 60');
      }
      if (byteLength(JSON.stringify(options.metadata)) > KV_MAX_METADATA_BYTES) {
        throw new Error('KV PUT failed: metadata is too large');
      }
      const now = this.clock.now();
      const last = this.lastPutAt.get(key);
      if (last !== undefined && now - last < KV_MIN_MS_BETWEEN_WRITES) {
        throw new Error('KV PUT failed: 429 Too Many Requests');
      }
      this.lastPutAt.set(key, now);
      this.puts.push({ key, value, options });
      this.entries.set(key, { value, metadata: options.metadata, expiresAtMs: now + ttl * 1000 });
    });
  }

  delete(key: string): Promise<void> {
    return this.run('delete', key, () => {
      this.deletes.push(key);
      this.entries.delete(key);
    });
  }

  private visible(entry: KvEntry): boolean {
    return this.clock.now() < entry.expiresAtMs + this.purgeLagMs;
  }

  private run<T>(op: KvOp, key: string, body: () => T): Promise<T> {
    try {
      const failure = this.failures.get(op);
      if (failure !== undefined) {
        this.failures.delete(op);
        throw failure;
      }
      if (byteLength(key) > KV_MAX_KEY_BYTES) throw new Error('KV failed: key is too long');
      return Promise.resolve(body());
    } catch (error) {
      return Promise.reject(error instanceof Error ? error : new Error('KV failed'));
    }
  }
}

/** A Workers Rate Limiting binding with fixed windows per key. */
export class LimiterModel implements RateLimiterSubset {
  /** Every key asked about, and the keys refused. */
  readonly keys: string[] = [];
  readonly refusedKeys: string[] = [];
  private readonly counts = new Map<string, number>();
  private failure: Error | null = null;
  private readonly clock: Clock;
  private readonly limitPerPeriod: number;
  private readonly periodMs: number;

  constructor(clock: Clock, limit: number, periodMs: number) {
    this.clock = clock;
    this.limitPerPeriod = limit;
    this.periodMs = periodMs;
  }

  failNext(error: Error): void {
    this.failure = error;
  }

  limit({ key }: { key: string }): Promise<{ success: boolean }> {
    this.keys.push(key);
    const failure = this.failure;
    if (failure !== null) {
      this.failure = null;
      return Promise.reject(failure);
    }
    const window = `${Math.floor(this.clock.now() / this.periodMs)}|${key}`;
    const count = (this.counts.get(window) ?? 0) + 1;
    this.counts.set(window, count);
    const success = count <= this.limitPerPeriod;
    if (!success) this.refusedKeys.push(key);
    return Promise.resolve({ success });
  }
}

export const ROOM_A = 'ExampleRoomId00000000A';
export const ROOM_B = 'ExampleRoomId00000000Q';
/** A documentation-only address (RFC 5737). */
export const TEST_IP = '192.0.2.1';
export const RELAY_BASE = 'https://relay.example.com';

export interface RelayRequestInit {
  method: string;
  path?: string;
  /** null leaves the header out. */
  origin?: string | null;
  room?: string | null;
  /** Text, raw bytes, or a stream that fails after some bytes (a client that went away). */
  body?: string | Uint8Array | { failAfterBytes: number };
  contentType?: string | null;
  /** 'honest' sends the real byte count; null leaves the header out. */
  contentLength?: string | null;
  contentEncoding?: string;
  ip?: string | null;
}

/** A request the relay can read, with a count of how often its body stream was pulled. */
export type TestRequest = RelayRequest & { readonly pulls: number };

const CHUNK_BYTES = 4096;

export function relayRequest(init: RelayRequestInit): TestRequest {
  const {
    method,
    path = '/v1/list',
    origin = APP_ORIGIN,
    room = ROOM_A,
    body,
    contentType = 'text/plain;charset=utf-8',
    contentLength = 'honest',
    contentEncoding,
    ip = TEST_IP,
  } = init;
  const headers = new Headers();
  if (origin !== null) headers.set('Origin', origin);
  if (room !== null) headers.set(RELAY_ROOM_HEADER, room);
  if (contentType !== null) headers.set('Content-Type', contentType);
  if (contentEncoding !== undefined) headers.set('Content-Encoding', contentEncoding);
  if (ip !== null) headers.set('CF-Connecting-IP', ip);

  let pulls = 0;
  let stream: ReadableStream<Uint8Array<ArrayBuffer>> | null = null;
  if (body !== undefined) {
    const bytes =
      typeof body === 'string'
        ? new TextEncoder().encode(body)
        : body instanceof Uint8Array
          ? Uint8Array.from(body)
          : new Uint8Array(body.failAfterBytes).fill(0x41);
    const failAt = body instanceof Uint8Array || typeof body === 'string' ? null : bytes.length;
    if (contentLength === 'honest' && failAt === null) {
      headers.set('Content-Length', String(bytes.length));
    }
    let offset = 0;
    // highWaterMark 0: nothing is pulled until the relay reads.
    stream = new ReadableStream<Uint8Array<ArrayBuffer>>(
      {
        pull(controller) {
          pulls += 1;
          if (offset >= bytes.length) {
            if (failAt === null) controller.close();
            else controller.error(new Error('client went away'));
            return;
          }
          controller.enqueue(bytes.slice(offset, offset + CHUNK_BYTES));
          offset += CHUNK_BYTES;
        },
      },
      { highWaterMark: 0 },
    );
  }
  if (contentLength !== null && contentLength !== 'honest') {
    headers.set('Content-Length', contentLength);
  }
  return {
    method,
    url: `${RELAY_BASE}${path}`,
    headers,
    body: stream,
    get pulls() {
      return pulls;
    },
  };
}

export function relayEnv(options: {
  kv: KvSubset;
  ttl?: string | undefined;
  origins?: string | undefined;
  write?: RateLimiterSubset | undefined;
  read?: RateLimiterSubset | undefined;
}): RelayEnv {
  const { kv, ttl = '120', origins = APP_ORIGIN, write, read } = options;
  return {
    RELAY_KV: kv,
    RELAY_TTL_SECONDS: ttl,
    ALLOWED_ORIGINS: origins,
    ...(write === undefined ? {} : { RELAY_WRITE_LIMIT: write }),
    ...(read === undefined ? {} : { RELAY_READ_LIMIT: read }),
  };
}

/** `rl1.` and base64url `A`s, `length` characters in all; only possible base64url lengths. */
export function syntheticBody(length: number): string {
  if ((length - 4) % 4 === 1) throw new RangeError('impossible base64url length');
  return `rl1.${'A'.repeat(length - 4)}`;
}

export interface RecordedExchange {
  init: RelayRequestInit;
  env: RelayEnv;
  request: TestRequest;
  response: Response;
  text: string;
}

/** Every exchange sent through `send` in this test file (each file has its own module copy). */
export const exchanges: RecordedExchange[] = [];

/** Runs one request and records it for the file-wide checks. */
export async function send(
  handler: RelayHandler,
  env: RelayEnv,
  init: RelayRequestInit,
): Promise<RecordedExchange> {
  const request = relayRequest(init);
  const response = await handler(request, env);
  const exchange = { init, env, request, response, text: await response.text() };
  exchanges.push(exchange);
  return exchange;
}
