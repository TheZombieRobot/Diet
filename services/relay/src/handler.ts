/**
 * The relay (checklist item 29): a blind mailbox for the grocery list. Each room has two slots:
 * `list` carries the phone's sealed list to the laptop, and `ack` carries the laptop's sealed
 * "received" note back (C52). A POST stores one body; a GET hands it out and deletes it in the
 * same request (C79).
 *
 * What it holds and sees: the body, under a hash of the room id (C113), with its expiry time. It
 * never logs, never reads a body beyond its format, never calls out, and never repeats any part of
 * a request in a response (design R13, R26). Every check that needs no KV runs first, so a refused
 * request costs no KV operation. The full contract is in services/relay/README.md.
 */
import {
  isRelayBody,
  isRelayRoomId,
  maxRelayBodyBytes,
  RELAY_PROTOCOL_VERSION,
  RELAY_ROOM_HEADER,
  RELAY_SLOTS,
  type RelaySlot,
} from '@diet/core/relay';
import { parseRelayConfig, type RelayConfig, type RelayEnv } from './config';
import { KV_READ_CACHE_TTL_SECONDS, roomHash, slotKey, type RateLimiterSubset } from './kv';

/** What the relay reads of a request; the Workers runtime passes a real Request. */
export type RelayRequest = Pick<Request, 'method' | 'url' | 'headers' | 'body'>;
export type RelayHandler = (request: RelayRequest, env: RelayEnv) => Promise<Response>;

export interface RelayHandlerDeps {
  now: () => number;
  /** Only item 31's local test server sets this; worker.ts never does (R10). */
  allowLoopbackOrigins: boolean;
}

/** The only error codes the relay answers with. None carries anything from the request (R26). */
export const RELAY_ERROR_CODES = Object.freeze([
  'not-found',
  'origin-not-allowed',
  'method-not-allowed',
  'bad-request',
  'bad-room',
  'bad-body',
  'unsupported-type',
  'too-large',
  'rate-limited',
  'busy',
  'unavailable',
  'misconfigured',
  'internal',
] as const);
export type RelayErrorCode = (typeof RELAY_ERROR_CODES)[number];

const ALLOW = 'GET, POST, OPTIONS';
const COMMON_HEADERS: Readonly<Record<string, string>> = Object.freeze({
  'Cache-Control': 'no-store',
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer',
  'Content-Security-Policy': "default-src 'none'; frame-ancestors 'none'",
  Vary: 'Origin',
});
const PREFLIGHT_HEADERS: Readonly<Record<string, string>> = Object.freeze({
  'Access-Control-Allow-Methods': 'GET, POST',
  'Access-Control-Allow-Headers': `Content-Type, ${RELAY_ROOM_HEADER}`,
  'Access-Control-Max-Age': '600',
});
/** Seconds a client waits before retrying, per refusal (R12). */
const RETRY_AFTER = Object.freeze({ rateLimited: '60', busy: '2', unavailable: '30' });

/**
 * One response. `cors` is the request's Origin once it is known to be allowed: the phone can then
 * read a 413 or a 429 and its Retry-After, instead of seeing a network failure (TR-05b).
 */
function respond(
  status: number,
  cors: string | null,
  extra: Readonly<Record<string, string>> = {},
  body: string | null = null,
): Response {
  const headers = new Headers({ ...COMMON_HEADERS, ...extra });
  if (cors !== null) {
    headers.set('Access-Control-Allow-Origin', cors);
    headers.set('Access-Control-Expose-Headers', 'Retry-After');
  }
  return new Response(body, { status, headers });
}

function refuse(
  status: number,
  code: RelayErrorCode,
  cors: string | null,
  extra: Readonly<Record<string, string>> = {},
): Response {
  return respond(
    status,
    cors,
    { 'Content-Type': 'application/json; charset=utf-8', ...extra },
    JSON.stringify({ error: code }),
  );
}

function slotForPath(pathname: string): RelaySlot | null {
  return RELAY_SLOTS.find((slot) => pathname === `/v${RELAY_PROTOCOL_VERSION}/${slot}`) ?? null;
}

/** `text/plain`, with no parameter other than charset=utf-8 (any case). */
function isPlainTextUtf8(contentType: string | null): boolean {
  if (contentType === null) return false;
  const [mediaType = '', ...parameters] = contentType.split(';');
  if (mediaType.trim().toLowerCase() !== 'text/plain') return false;
  return parameters.every((parameter) => {
    const [name = '', value = '', ...rest] = parameter.split('=');
    return (
      rest.length === 0 &&
      name.trim().toLowerCase() === 'charset' &&
      value.trim().toLowerCase() === 'utf-8'
    );
  });
}

/** Absent or `identity`: a compressed body could expand past the cap after it is counted. */
function isIdentityEncoding(contentEncoding: string | null): boolean {
  return contentEncoding === null || contentEncoding.trim().toLowerCase() === 'identity';
}

type ReadResult =
  { ok: true; text: string } | { ok: false; reason: 'too-large' | 'bad-encoding' | 'read-failed' };

/**
 * Reads the body while counting bytes, and cancels the stream at the first byte over the cap, so
 * an oversized body is never held whole. Strict UTF-8, with a byte-order mark kept (and so
 * refused by the format check), so the stored text is exactly the bytes sent.
 */
async function readCappedText(
  body: ReadableStream<Uint8Array> | null,
  cap: number,
): Promise<ReadResult> {
  if (body === null) return { ok: true, text: '' };
  const reader = body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > cap) {
        await reader.cancel().catch(() => undefined);
        return { ok: false, reason: 'too-large' };
      }
      chunks.push(value);
    }
  } catch {
    return { ok: false, reason: 'read-failed' };
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  try {
    return {
      ok: true,
      text: new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes),
    };
  } catch {
    return { ok: false, reason: 'bad-encoding' };
  }
}

/**
 * True when the limiter lets the request through. No binding means no limit (R11). A limiter that
 * fails counts as allowing: it protects only the free KV quota, never anyone's data, and the paste
 * code is the fallback when the quota runs out.
 */
async function allowed(limiter: RateLimiterSubset | undefined, key: string): Promise<boolean> {
  if (limiter === undefined) return true;
  try {
    return (await limiter.limit({ key })).success;
  } catch {
    return true;
  }
}

/** The expiry stored with a body: exactly `{ expiresAt: <safe integer> }`, or null. */
function storedExpiry(metadata: unknown): number | null {
  if (typeof metadata !== 'object' || metadata === null) return null;
  const { expiresAt, ...others } = metadata as { expiresAt?: unknown };
  const exact = Object.keys(others).length === 0 && typeof expiresAt === 'number';
  return exact && Number.isSafeInteger(expiresAt) ? expiresAt : null;
}

/** KV allows one write a second per key; it reports a faster one as a 429 (C79). */
function isKvRateRefusal(error: unknown): boolean {
  const message = error instanceof Error ? error.message : typeof error === 'string' ? error : '';
  return /\b429\b|too many/i.test(message);
}

/** A request that passed every check that needs no KV. */
interface SlotRequest {
  request: RelayRequest;
  env: RelayEnv;
  config: Extract<RelayConfig, { ok: true }>;
  slot: RelaySlot;
  hash: string;
  cors: string | null;
}

async function store({ request, env, config, slot, hash, cors }: SlotRequest, now: () => number) {
  // Both limits are checked before the body is read, so junk bodies count too (C80).
  const ip = request.headers.get('CF-Connecting-IP') ?? 'unknown';
  if (
    !(await allowed(env.RELAY_WRITE_LIMIT, `ip:${ip}`)) ||
    !(await allowed(env.RELAY_WRITE_LIMIT, `room:${hash}`))
  ) {
    return refuse(429, 'rate-limited', cors, { 'Retry-After': RETRY_AFTER.rateLimited });
  }
  if (
    !isPlainTextUtf8(request.headers.get('Content-Type')) ||
    !isIdentityEncoding(request.headers.get('Content-Encoding'))
  ) {
    return refuse(415, 'unsupported-type', cors);
  }
  const cap = maxRelayBodyBytes(slot);
  const declared = request.headers.get('Content-Length');
  if (declared !== null) {
    if (!/^\d{1,15}$/.test(declared)) return refuse(400, 'bad-request', cors);
    if (Number(declared) > cap) return refuse(413, 'too-large', cors);
  }
  const read = await readCappedText(request.body, cap);
  if (!read.ok) {
    return read.reason === 'too-large'
      ? refuse(413, 'too-large', cors)
      : refuse(400, 'bad-body', cors);
  }
  if (!isRelayBody(read.text, slot)) return refuse(400, 'bad-body', cors);

  const expiresAt = now() + config.ttlSeconds * 1000;
  try {
    await config.kv.put(slotKey(slot, hash), read.text, {
      expirationTtl: config.ttlSeconds,
      metadata: { expiresAt },
    });
  } catch (error) {
    return isKvRateRefusal(error)
      ? refuse(429, 'busy', cors, { 'Retry-After': RETRY_AFTER.busy })
      : refuse(503, 'unavailable', cors, { 'Retry-After': RETRY_AFTER.unavailable });
  }
  return respond(204, cors);
}

async function collect({ request, env, config, slot, hash, cors }: SlotRequest, now: () => number) {
  const ip = request.headers.get('CF-Connecting-IP') ?? 'unknown';
  if (!(await allowed(env.RELAY_READ_LIMIT, `ip:${ip}`))) {
    return refuse(429, 'rate-limited', cors, { 'Retry-After': RETRY_AFTER.rateLimited });
  }
  const key = slotKey(slot, hash);
  let stored: { value: string | null; metadata: unknown };
  try {
    stored = await config.kv.getWithMetadata(key, {
      type: 'text',
      cacheTtl: KV_READ_CACHE_TTL_SECONDS,
    });
  } catch {
    return refuse(503, 'unavailable', cors, { 'Retry-After': RETRY_AFTER.unavailable });
  }
  if (stored.value === null) return respond(204, cors);
  // Past its expiry by the Worker's own clock, whatever KV still holds, or not a body the relay
  // would have stored: nothing waiting. It is not deleted: KV's expiry purges it, and a delete
  // here could land after a fresh POST that reached another location and erase it (R8).
  const expiresAt = storedExpiry(stored.metadata);
  if (expiresAt === null || now() >= expiresAt || !isRelayBody(stored.value, slot)) {
    return respond(204, cors);
  }
  try {
    await config.kv.delete(key);
  } catch {
    // Still delivered: the expiry bounds how long another copy could be handed out (R8).
  }
  return respond(200, cors, { 'Content-Type': 'text/plain; charset=utf-8' }, stored.value);
}

export function createRelayHandler(deps: RelayHandlerDeps): RelayHandler {
  return async (request, env) => {
    let cors: string | null = null;
    try {
      const config = parseRelayConfig(env, { allowLoopbackOrigins: deps.allowLoopbackOrigins });
      if (!config.ok) return refuse(500, 'misconfigured', null);

      const url = new URL(request.url);
      const slot = slotForPath(url.pathname);
      if (slot === null) return refuse(404, 'not-found', null);

      const origin = request.headers.get('Origin');
      if (origin !== null && !config.allowedOrigins.has(origin)) {
        return refuse(403, 'origin-not-allowed', null);
      }
      cors = origin;

      if (request.method === 'OPTIONS') {
        if (cors === null) return respond(204, null, { Allow: ALLOW });
        return new Response(null, {
          status: 204,
          headers: { ...COMMON_HEADERS, ...PREFLIGHT_HEADERS, 'Access-Control-Allow-Origin': cors },
        });
      }
      if (request.method !== 'GET' && request.method !== 'POST') {
        return refuse(405, 'method-not-allowed', cors, { Allow: ALLOW });
      }
      // The room id must never travel in a URL, where logs keep it (C113).
      if (url.search !== '') return refuse(400, 'bad-request', cors);
      const room = request.headers.get(RELAY_ROOM_HEADER);
      if (!isRelayRoomId(room)) return refuse(400, 'bad-room', cors);

      const checked = { request, env, config, slot, hash: await roomHash(room), cors };
      return request.method === 'POST'
        ? await store(checked, deps.now)
        : await collect(checked, deps.now);
    } catch {
      // Nothing is logged and nothing is rethrown, so the runtime records no error text (R13).
      return refuse(500, 'internal', cors);
    }
  };
}
