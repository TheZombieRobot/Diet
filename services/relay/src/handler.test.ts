import {
  APP_ORIGIN,
  isRelayBody,
  MAX_RELAY_ACK_BODY_BYTES,
  MAX_RELAY_BODY_BYTES,
  RELAY_MIN_POLL_INTERVAL_MS,
} from '@diet/core/relay';
import { groceryList300 } from '@diet/test-fixtures';
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createRelayHandler, readCappedText } from './handler';
import { clientLimitKey, roomHash, slotKey } from './kv';
import {
  createClock,
  exchangeProblems,
  exchanges,
  KvModel,
  LimiterModel,
  type RecordedExchange,
  relayEnv,
  type RelayRequestInit,
  ROOM_A,
  ROOM_B,
  send,
  SENTINEL,
  syntheticBody,
  T0,
  TEST_IP,
} from './testKit';

// The relay (checklist item 29). Clock at 2000-01-01T00:00:00.000Z (T0) and the test deployment's
// 2-minute expiry unless a test says otherwise. Checks that hold for every exchange run once, after
// each test and after the file, instead of in every test (design 5.3).

const EXTENSION_ORIGIN = 'chrome-extension://abcdefghijklmnopabcdefghijklmnop';
const CONSOLE_METHODS = ['log', 'info', 'warn', 'error', 'debug', 'trace'] as const;

const models: KvModel[] = [];
let consoleSpies: { mock: { calls: unknown[] } }[] = [];

function setup(options: { ttl?: string; origins?: string; purgeLagMs?: number } = {}) {
  const clock = createClock();
  const kv = new KvModel(clock, { purgeLagMs: options.purgeLagMs ?? 0 });
  models.push(kv);
  const write = new LimiterModel(clock, 10, 60_000);
  const read = new LimiterModel(clock, 60, 60_000);
  const handler = createRelayHandler({ now: clock.now, allowLoopbackOrigins: false });
  const env = relayEnv({ kv, ttl: options.ttl, origins: options.origins });
  const limitedEnv = relayEnv({ kv, ttl: options.ttl, origins: options.origins, write, read });
  return {
    clock,
    kv,
    write,
    read,
    /** Without rate-limit bindings. */
    relay: (init: RelayRequestInit) => send(handler, env, init),
    /** With the two rate-limit bindings of wrangler.jsonc. */
    limited: (init: RelayRequestInit) => send(handler, limitedEnv, init),
  };
}

const errorCode = ({ text }: RecordedExchange): unknown =>
  (JSON.parse(text) as { error?: unknown }).error;
const keyOf = async (slot: 'list' | 'ack', room = ROOM_A) => slotKey(slot, await roomHash(room));

beforeEach(() => {
  consoleSpies = CONSOLE_METHODS.map((method) =>
    vi.spyOn(console, method).mockImplementation(() => undefined),
  );
});

afterEach(() => {
  // The relay never logs (R13) ...
  const logged = consoleSpies.flatMap((spy) => spy.mock.calls);
  vi.restoreAllMocks();
  expect(logged).toEqual([]);
  // ... and never stores raw text. A format check, the relay half of TR-02; the sealing itself is
  // proven by W5 here and by items 30 and 31.
  for (const kv of models.splice(0)) {
    for (const put of kv.puts) {
      expect(isRelayBody(put.value, put.key.startsWith('ack:') ? 'ack' : 'list')).toBe(true);
    }
  }
});

afterAll(() => {
  // Common and CORS headers, and no echo of the request (R26, R27), over every exchange.
  expect(exchanges.length).toBeGreaterThan(100);
  expect(exchangeProblems(exchanges)).toEqual([]);
});

describe('W1. TR-02: the relay stores only the body, under a hashed key', () => {
  it('stores the body and its expiry under list:<hash>, and nothing else from the request', async () => {
    const { kv, write, read, limited } = setup();
    const body = syntheticBody(4_000);
    expect((await limited({ method: 'POST', body })).response.status).toBe(204);

    const stored = kv.stored();
    expect(stored).toHaveLength(1);
    expect(stored[0]?.value).toBe(body);
    expect(stored[0]?.metadata).toEqual({ expiresAt: T0 + 120_000 });
    expect(stored[0]?.key).toMatch(/^list:[A-Za-z0-9_-]{43}$/);
    const kept = JSON.stringify(stored);
    for (const part of [ROOM_A, APP_ORIGIN, TEST_IP]) expect(kept).not.toContain(part);
    expect([...write.keys, ...read.keys].join(' ')).not.toContain(ROOM_A);
  });
});

describe('W2. TR-02: raw text is refused before KV', () => {
  const ascii = new TextEncoder().encode(syntheticBody(44));
  it.each<[string, NonNullable<RelayRequestInit['body']>]>([
    ['the list as plain JSON', JSON.stringify({ items: [{ text: SENTINEL, quantity: 2 }] })],
    ['words with spaces', 'Example list with words and spaces'],
    ['rl1. and 36 characters (27 bytes)', syntheticBody(40)],
    ['= padding', `${syntheticBody(47)}=`],
    ['a plus sign', `rl1.AA+${'A'.repeat(41)}`],
    ['a line break', `rl1.${'A'.repeat(20)}\n${'A'.repeat(23)}`],
    ['a non-ASCII letter', `rl1.${'A'.repeat(43)}é`],
    ['the prefix rl2.', `rl2.${'A'.repeat(44)}`],
    ['bytes that are not UTF-8', Uint8Array.of(...ascii, 0xff, 0xfe)],
    ['a byte-order mark before the body', `\uFEFF${syntheticBody(44)}`],
    ['a body stream that fails after 10 bytes', { failAfterBytes: 10 }],
  ])('%s: 400 bad-body, nothing written', async (_name, body) => {
    const { kv, relay } = setup();
    const exchange = await relay({ method: 'POST', body });
    expect(exchange.response.status).toBe(400);
    expect(errorCode(exchange)).toBe('bad-body');
    expect(kv.puts).toEqual([]);
  });

  it('reads strictly: bytes that are not UTF-8 are an encoding fault, never replaced', async () => {
    const body = new Response(Uint8Array.of(...new TextEncoder().encode('rl1.'), 0xff, 0xfe)).body;
    expect(await readCappedText(body, MAX_RELAY_BODY_BYTES)).toEqual({
      ok: false,
      reason: 'bad-encoding',
    });
  });
});

describe('W3. TR-05: the cap, at its exact boundary', () => {
  /** Refused for its size before its format is looked at, so any length will do. */
  const oversize = (length: number) => `rl1.${'A'.repeat(length - 4)}`;

  it.each([
    ['list', MAX_RELAY_BODY_BYTES],
    ['ack', MAX_RELAY_ACK_BODY_BYTES],
  ] as const)('%s: exactly %i bytes is stored and handed back identical', async (slot, cap) => {
    const { relay } = setup();
    const body = syntheticBody(cap);
    const path = `/v1/${slot}`;
    expect((await relay({ method: 'POST', path, body })).response.status).toBe(204);
    const got = await relay({ method: 'GET', path });
    expect(got.response.status).toBe(200);
    expect(got.text).toBe(body);
  });

  it.each<[string, number, string | null]>([
    ['/v1/list', 65_537, 'honest'],
    ['/v1/list', 65_538, 'honest'],
    ['/v1/list', 65_537, null],
    ['/v1/list', 65_538, null],
    ['/v1/list', 65_537, '100'],
    ['/v1/list', 65_538, '100'],
    ['/v1/ack', 4_097, 'honest'],
    ['/v1/ack', 4_098, 'honest'],
  ])(
    '%s: %i bytes with Content-Length %s is 413, readable by the phone',
    async (path, length, contentLength) => {
      const { kv, relay } = setup();
      const exchange = await relay({ method: 'POST', path, body: oversize(length), contentLength });
      expect(exchange.response.status).toBe(413);
      expect(errorCode(exchange)).toBe('too-large');
      expect(exchange.response.headers.get('Access-Control-Allow-Origin')).toBe(APP_ORIGIN);
      expect(kv.puts).toEqual([]);
      // Reading stops at the first chunk past the cap (4 KB chunks), and an honest length is not read.
      expect(exchange.request.pulls).toBeLessThanOrEqual(contentLength === 'honest' ? 0 : 17);
    },
  );
});

describe('W4. TR-05: a Content-Length that cannot be right is refused unread', () => {
  it.each([
    ['1000000000', 413, 'too-large'],
    ['12a', 400, 'bad-request'],
  ])('Content-Length %j: %i %s', async (contentLength, status, code) => {
    const { relay } = setup();
    const exchange = await relay({ method: 'POST', body: syntheticBody(100), contentLength });
    expect(exchange.response.status).toBe(status);
    expect(errorCode(exchange)).toBe(code);
    expect(exchange.request.pulls).toBe(0);
  });
});

const base64url = (bytes: Uint8Array) =>
  btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');

describe('W5. TR-05a (relay half): a sealed 300-item list fits with room to spare', () => {
  it('compresses and seals the list, fits in half the cap, and comes back unchanged', async () => {
    // A stand-in for item 30's layout: a version byte, the 12-byte IV, then ciphertext and tag.
    const { list } = groceryList300();
    const payload = JSON.stringify({
      listId: list.id,
      version: list.version,
      transferId: '00000000-0000-4000-8000-000000000029',
      sentAt: '2000-01-01T00:00:00.000Z',
      list,
    });
    const deflated = await new Response(
      new Blob([payload]).stream().pipeThrough(new CompressionStream('deflate-raw')),
    ).arrayBuffer();
    const key = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, [
      'encrypt',
    ]);
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const sealed = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, deflated);
    const body = `rl1.${base64url(Uint8Array.of(1, ...iv, ...new Uint8Array(sealed)))}`;
    expect(body.length).toBeLessThanOrEqual(MAX_RELAY_BODY_BYTES / 2);

    const { relay } = setup();
    expect((await relay({ method: 'POST', body })).response.status).toBe(204);
    expect((await relay({ method: 'GET' })).text).toBe(body);
  });
});

// W6 to W8 run for both slots: the acknowledgement has the list's expiry and take-once rule (R30).
const SLOTS = ['list', 'ack'] as const;

describe.each(SLOTS)('W6. TR-06: expiry is exact and does not depend on KV (%s)', (slot) => {
  const path = `/v1/${slot}`;

  it('hands a body out until its expiry, and never after, even while KV still holds it', async () => {
    const { clock, kv, relay } = setup({ purgeLagMs: 60_000 });
    for (const room of [ROOM_A, ROOM_B])
      await relay({ method: 'POST', path, room, body: syntheticBody(100) });
    expect(kv.puts.map((p) => p.options)).toEqual([
      { expirationTtl: 120, metadata: { expiresAt: T0 + 120_000 } },
      { expirationTtl: 120, metadata: { expiresAt: T0 + 120_000 } },
    ]);

    clock.advance(119_999);
    expect((await relay({ method: 'GET', path, room: ROOM_A })).response.status).toBe(200);
    clock.advance(1);
    expect((await relay({ method: 'GET', path, room: ROOM_B })).response.status).toBe(204);
    const roomB = await keyOf(slot, ROOM_B);
    expect(kv.stored().map((e) => e.key)).toEqual([roomB]);
    expect(kv.deletes).toEqual([await keyOf(slot, ROOM_A)]);
  });

  it('uses the production expiry of 15 minutes when configured with 900', async () => {
    const { kv, relay } = setup({ ttl: '900' });
    await relay({ method: 'POST', path, body: syntheticBody(100) });
    expect(kv.puts[0]?.options).toEqual({
      expirationTtl: 900,
      metadata: { expiresAt: T0 + 900_000 },
    });
  });
});

describe.each(SLOTS)(
  'W7. TR-06: a stored value that fails the checks is never served (%s)',
  (slot) => {
    it.each<[string, string, unknown]>([
      ['a body with no expiry', syntheticBody(100), undefined],
      ['a body whose expiry is not a number', syntheticBody(100), { expiresAt: 'soon' }],
      ['an extra metadata key', syntheticBody(100), { expiresAt: T0 + 60_000, extra: 1 }],
      ['text the relay would never store', 'hello', { expiresAt: T0 + 60_000 }],
    ])('%s: nothing waiting, and left for KV to purge', async (_name, value, metadata) => {
      const { kv, relay } = setup();
      const key = await keyOf(slot);
      kv.seed(key, value, metadata);
      expect((await relay({ method: 'GET', path: `/v1/${slot}` })).response.status).toBe(204);
      expect(kv.deletes).toEqual([]);
      expect(kv.stored().map((e) => [e.key, e.value])).toEqual([[key, value]]);
    });
  },
);

describe.each(SLOTS)('W8. TR-09a: one-time delivery at one place (%s)', (slot) => {
  it('a second GET finds nothing; the delivery deleted the key once', async () => {
    const { kv, relay } = setup();
    const path = `/v1/${slot}`;
    await relay({ method: 'POST', path, body: syntheticBody(100) });
    expect((await relay({ method: 'GET', path })).response.status).toBe(200);
    expect((await relay({ method: 'GET', path })).response.status).toBe(204);
    expect(kv.deletes).toEqual([await keyOf(slot)]);
    // Both GETs read KV, with KV's shortest read cache (C79: "usually within 30 s").
    expect(kv.reads.map((r) => r.options)).toEqual([
      { type: 'text', cacheTtl: 30 },
      { type: 'text', cacheTtl: 30 },
    ]);
  });
});

describe('W9. Slots and rooms are independent, and the last write wins (C52, C80)', () => {
  const b1 = syntheticBody(100);
  const b2 = `rl1.${'B'.repeat(96)}`;

  it('a second POST a second later replaces the first', async () => {
    const { clock, relay } = setup();
    await relay({ method: 'POST', body: b1 });
    clock.advance(1_000);
    expect((await relay({ method: 'POST', body: b2 })).response.status).toBe(204);
    expect((await relay({ method: 'GET' })).text).toBe(b2);
  });

  it('the list and ack slots of one room each return their own body', async () => {
    const { relay } = setup();
    await relay({ method: 'POST', path: '/v1/list', body: b1 });
    await relay({ method: 'POST', path: '/v1/ack', body: b2 });
    expect((await relay({ method: 'GET', path: '/v1/ack' })).text).toBe(b2);
    expect((await relay({ method: 'GET', path: '/v1/list' })).text).toBe(b1);
  });

  it("room A's body is never returned to room B", async () => {
    const { relay } = setup();
    await relay({ method: 'POST', room: ROOM_A, body: b1 });
    expect((await relay({ method: 'GET', room: ROOM_B })).response.status).toBe(204);
    expect((await relay({ method: 'GET', room: ROOM_A })).text).toBe(b1);
  });
});

describe('W10. CORS is limited to the app and the extension (checklist item 29)', () => {
  it('answers a preflight from the app with exactly the allowed methods and headers', async () => {
    const { relay } = setup();
    const { response } = await relay({ method: 'OPTIONS' });
    expect(response.status).toBe(204);
    expect(response.headers.get('Access-Control-Allow-Origin')).toBe(APP_ORIGIN);
    expect(response.headers.get('Access-Control-Allow-Methods')).toBe('GET, POST');
    expect(response.headers.get('Access-Control-Allow-Headers')).toBe('Content-Type, X-Relay-Room');
    expect(response.headers.get('Access-Control-Max-Age')).toBe('600');
  });

  it.each<[string, string]>([
    ['POST', 'https://THEZOMBIEROBOT.github.io'],
    ['POST', 'http://thezombierobot.github.io'],
    ['POST', 'https://thezombierobot.github.io/'],
    ['POST', 'https://thezombierobot.github.io:443'],
    ['POST', 'null'],
    ['POST', 'https://example.com'],
    ['POST', `https://${SENTINEL}.example`],
    ['POST', EXTENSION_ORIGIN],
    ['GET', 'https://example.com'],
    ['OPTIONS', 'https://example.com'],
  ])('%s from %j: 403, no CORS headers, no KV call', async (method, origin) => {
    const { kv, relay } = setup();
    const body = method === 'POST' ? { body: syntheticBody(100) } : {};
    const exchange = await relay({ method, origin, ...body });
    expect(exchange.response.status).toBe(403);
    expect(errorCode(exchange)).toBe('origin-not-allowed');
    expect(exchange.response.headers.get('Access-Control-Allow-Origin')).toBeNull();
    expect([kv.puts, kv.reads]).toEqual([[], []]);
  });

  it('serves a request with no Origin, without CORS headers', async () => {
    const { relay } = setup();
    const posted = await relay({ method: 'POST', origin: null, body: syntheticBody(100) });
    const got = await relay({ method: 'GET', origin: null });
    expect([posted.response.status, got.response.status]).toEqual([204, 200]);
    for (const { response } of [posted, got]) {
      expect(response.headers.get('Access-Control-Allow-Origin')).toBeNull();
    }
  });

  it('allows the extension once its origin is configured (item 32)', async () => {
    const { relay } = setup({ origins: `${APP_ORIGIN},${EXTENSION_ORIGIN}` });
    const { response } = await relay({
      method: 'POST',
      origin: EXTENSION_ORIGIN,
      body: syntheticBody(100),
    });
    expect(response.status).toBe(204);
    expect(response.headers.get('Access-Control-Allow-Origin')).toBe(EXTENSION_ORIGIN);
  });
});

describe('W11. Routing, methods and headers (C113)', () => {
  const post = { method: 'POST', body: syntheticBody(100) };
  it.each<[string, number, string, RelayRequestInit]>([
    ['the root', 404, 'not-found', { method: 'GET', path: '/' }],
    ['a trailing slash', 404, 'not-found', { method: 'GET', path: '/v1/list/' }],
    ['upper case', 404, 'not-found', { method: 'GET', path: '/V1/LIST' }],
    ['another version', 404, 'not-found', { method: 'GET', path: '/v2/list' }],
    ['an unknown path', 404, 'not-found', { method: 'GET', path: `/${SENTINEL}` }],
    ['HEAD', 405, 'method-not-allowed', { method: 'HEAD' }],
    ['PUT', 405, 'method-not-allowed', { ...post, method: 'PUT' }],
    ['DELETE', 405, 'method-not-allowed', { method: 'DELETE' }],
    ['the room in the URL', 400, 'bad-request', { method: 'GET', path: `/v1/list?room=${ROOM_A}` }],
    ['any other query', 400, 'bad-request', { method: 'POST', path: '/v1/ack?r=x' }],
    ['no room header', 400, 'bad-room', { method: 'GET', room: null }],
    ['a 21-character room', 400, 'bad-room', { method: 'GET', room: ROOM_A.slice(1) }],
    ['JSON', 415, 'unsupported-type', { ...post, contentType: 'application/json' }],
    ['latin1', 415, 'unsupported-type', { ...post, contentType: 'text/plain;charset=latin1' }],
    ['another media type', 415, 'unsupported-type', { ...post, contentType: `text/${SENTINEL}` }],
    ['gzip', 415, 'unsupported-type', { ...post, contentEncoding: 'gzip' }],
    ['br', 415, 'unsupported-type', { ...post, contentEncoding: 'br' }],
    ['deflate', 415, 'unsupported-type', { ...post, contentEncoding: 'deflate' }],
    ['another encoding', 415, 'unsupported-type', { ...post, contentEncoding: SENTINEL }],
  ])('%s: %i %s', async (_name, status, code, init) => {
    const { kv, relay } = setup();
    const exchange = await relay(init);
    expect(exchange.response.status).toBe(status);
    expect(errorCode(exchange)).toBe(code);
    if (status === 405) expect(exchange.response.headers.get('Allow')).toBe('GET, POST, OPTIONS');
    expect([kv.puts, kv.reads]).toEqual([[], []]);
  });

  it('accepts Content-Encoding identity and the charset in capitals', async () => {
    const { relay } = setup();
    const exchange = await relay({
      ...post,
      contentType: 'text/plain; charset=UTF-8',
      contentEncoding: 'identity',
    });
    expect(exchange.response.status).toBe(204);
  });
});

describe('W12. Rate limits (C80)', () => {
  const room = (n: number) => `ExampleRoomId${String(n).padStart(9, '0')}`;

  it('the 11th POST from one IP within a minute is refused, whatever the room', async () => {
    const { kv, write, limited } = setup();
    const responses: Response[] = [];
    for (let n = 1; n <= 11; n++) {
      responses.push(
        (await limited({ method: 'POST', room: room(n), body: syntheticBody(100) })).response,
      );
    }
    expect(responses.map((r) => r.status)).toEqual([...Array<number>(10).fill(204), 429]);
    expect(responses[10]?.headers.get('Retry-After')).toBe('60');
    expect(kv.puts).toHaveLength(10);
    expect(write.refusedKeys).toEqual([`ip:${TEST_IP}`]);
  });

  it('the 11th POST to one room within a minute is refused, whatever the IP', async () => {
    const { clock, write, limited } = setup();
    const statuses: number[] = [];
    for (let n = 1; n <= 11; n++) {
      const exchange = await limited({
        method: 'POST',
        ip: `192.0.2.${n + 10}`,
        body: syntheticBody(100),
      });
      statuses.push(exchange.response.status);
      if (n === 11) expect(errorCode(exchange)).toBe('rate-limited');
      clock.advance(1_000);
    }
    expect(statuses).toEqual([...Array<number>(10).fill(204), 429]);
    expect(write.refusedKeys).toEqual([`room:${await roomHash(ROOM_A)}`]);
  });

  it('junk bodies count, and a POST over the limit is refused before its body or KV', async () => {
    const { kv, write, limited } = setup();
    for (let n = 1; n <= 10; n++) {
      const junk = await limited({ method: 'POST', room: room(n), body: 'hello' });
      expect([junk.response.status, errorCode(junk)]).toEqual([400, 'bad-body']);
    }
    const refused = await limited({
      method: 'POST',
      room: room(11),
      body: syntheticBody(MAX_RELAY_BODY_BYTES + 4),
      contentType: 'application/json',
      contentLength: null,
    });
    expect([refused.response.status, errorCode(refused)]).toEqual([429, 'rate-limited']);
    expect(refused.request.pulls).toBe(0);
    expect([kv.puts, kv.reads]).toEqual([[], []]);
    expect(write.refusedKeys).toEqual([`ip:${TEST_IP}`]);
  });

  it('counts IPv6 clients by their /64 network', async () => {
    const { write, limited } = setup();
    const statuses: number[] = [];
    for (let n = 1; n <= 11; n++) {
      const ip = `2001:db8::${n.toString(16)}`;
      const post = { method: 'POST', ip, room: room(n), body: syntheticBody(100) };
      statuses.push((await limited(post)).response.status);
    }
    expect(statuses).toEqual([...Array<number>(10).fill(204), 429]);
    expect(write.refusedKeys).toEqual(['ip:2001:db8:0:0::/64']);
    const otherNetwork = { ip: '2001:db8:0:1::1', room: room(12), body: syntheticBody(100) };
    expect((await limited({ method: 'POST', ...otherNetwork })).response.status).toBe(204);
  });

  it.each<[string | null, string]>([
    ['192.0.2.1', 'ip:192.0.2.1'],
    ['2001:db8:1:2:3:4:5:6', 'ip:2001:db8:1:2::/64'],
    ['2001:DB8:0001:0002::1', 'ip:2001:db8:1:2::/64'],
    ['::ffff:192.0.2.1', 'ip:192.0.2.1'],
    [null, 'ip:unknown'],
    ['2001:db8::1::2', 'ip:unknown'],
    ['192.0.2.256', 'ip:unknown'],
    ['example', 'ip:unknown'],
  ])('the limit key for the address %j is %j', (address, key) => {
    expect(clientLimitKey(address)).toBe(key);
  });

  it('the 61st GET from one IP in a minute is refused before KV, whatever the room; a new minute is not', async () => {
    const { clock, kv, read, limited } = setup();
    const statuses: number[] = [];
    for (let n = 1; n <= 61; n++) {
      statuses.push((await limited({ method: 'GET', room: room(n) })).response.status);
    }
    expect(statuses).toEqual([...Array<number>(60).fill(204), 429]);
    expect(read.refusedKeys).toEqual([`ip:${TEST_IP}`]);
    expect(kv.reads).toHaveLength(60);
    clock.advance(60_000);
    expect((await limited({ method: 'GET' })).response.status).toBe(204);
  });

  it('a phone and a laptop polling every 5 s from one home network are never limited', async () => {
    const { clock, read, limited } = setup();
    for (let t = 0; t < 5 * 60_000; t += RELAY_MIN_POLL_INTERVAL_MS) {
      expect((await limited({ method: 'GET', path: '/v1/list' })).response.status).toBe(204);
      expect((await limited({ method: 'GET', path: '/v1/ack' })).response.status).toBe(204);
      clock.advance(RELAY_MIN_POLL_INTERVAL_MS);
    }
    expect(read.refusedKeys).toEqual([]);
  });

  it('with no rate-limit bindings every request is served', async () => {
    const { relay } = setup();
    for (let n = 1; n <= 11; n++) {
      expect(
        (await relay({ method: 'POST', room: room(n), body: syntheticBody(100) })).response.status,
      ).toBe(204);
    }
    for (let n = 1; n <= 61; n++)
      expect((await relay({ method: 'GET', room: room(99) })).response.status).toBe(204);
  });

  it('a limiter that fails counts as allowing', async () => {
    const { write, read, limited } = setup();
    write.failNext(new Error(SENTINEL));
    read.failNext(new Error(SENTINEL));
    expect((await limited({ method: 'POST', body: syntheticBody(100) })).response.status).toBe(204);
    expect((await limited({ method: 'GET' })).response.status).toBe(200);
  });
});

describe('W13. KV failures and unexpected errors (C79, C80, R12, R13)', () => {
  it('a second write to one key within a second is 429 busy, readable by the phone', async () => {
    const { clock, relay } = setup();
    await relay({ method: 'POST', body: syntheticBody(100) });
    clock.advance(999);
    const exchange = await relay({ method: 'POST', body: syntheticBody(100) });
    expect([exchange.response.status, errorCode(exchange)]).toEqual([429, 'busy']);
    expect(exchange.response.headers.get('Retry-After')).toBe('2');
    expect(exchange.response.headers.get('Access-Control-Allow-Origin')).toBe(APP_ORIGIN);
  });

  it.each([
    ['put', 'POST'],
    ['getWithMetadata', 'GET'],
  ] as const)('KV %s failing is 503 unavailable', async (op, method) => {
    const { kv, relay } = setup();
    kv.failNext(op, new Error(`KV failed: ${SENTINEL}`));
    const body = method === 'POST' ? { body: syntheticBody(100) } : {};
    const exchange = await relay({ method, ...body });
    expect([exchange.response.status, errorCode(exchange)]).toEqual([503, 'unavailable']);
    expect(exchange.response.headers.get('Retry-After')).toBe('30');
  });

  it('a failed delete after a read still delivers the body', async () => {
    const { kv, relay } = setup();
    await relay({ method: 'POST', body: syntheticBody(100) });
    kv.failNext('delete', new Error(SENTINEL));
    const got = await relay({ method: 'GET' });
    expect([got.response.status, got.text]).toEqual([200, syntheticBody(100)]);
  });

  it('anything unexpected is 500 internal, with CORS headers, nothing written and nothing logged', async () => {
    const { kv, relay } = setup();
    vi.spyOn(crypto.subtle, 'digest').mockRejectedValueOnce(new Error(SENTINEL));
    const exchange = await relay({ method: 'POST', body: syntheticBody(100) });
    expect([exchange.response.status, errorCode(exchange)]).toEqual([500, 'internal']);
    expect(exchange.response.headers.get('Access-Control-Allow-Origin')).toBe(APP_ORIGIN);
    expect(kv.puts).toEqual([]);
  });
});
