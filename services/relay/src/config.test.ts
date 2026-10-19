import { APP_ORIGIN } from '@diet/core/relay';
import { afterAll, describe, expect, it } from 'vitest';
import { parseRelayConfig, type RelayEnv } from './config';
import { createRelayHandler } from './handler';
import {
  createClock,
  exchangeProblems,
  exchanges,
  KvModel,
  relayEnv,
  type RelayRequestInit,
  send,
  syntheticBody,
} from './testKit';

const EXTENSION_ORIGIN = 'chrome-extension://abcdefghijklmnopabcdefghijklmnop';

/** The test deployment's env with some members replaced; `undefined` leaves a member out. */
function envWith(changes: Record<string, unknown>, kv = new KvModel(createClock())): RelayEnv {
  const env: Record<string, unknown> = { ...relayEnv({ kv }), ...changes };
  return Object.fromEntries(Object.entries(env).filter(([, value]) => value !== undefined));
}

const problemOf = (env: RelayEnv, allowLoopbackOrigins = false) => {
  const config = parseRelayConfig(env, { allowLoopbackOrigins });
  return config.ok ? null : config.problem;
};

// The misconfigured answers carry the common headers too, and repeat nothing (R26, R27).
afterAll(() => {
  expect(exchanges.length).toBeGreaterThan(0);
  expect(exchangeProblems(exchanges)).toEqual([]);
});

describe('W14. Configuration (R7, R10, R25)', () => {
  it.each([
    [undefined, 'ttl'],
    ['', 'ttl'],
    ['59', 'ttl'],
    ['901', 'ttl'],
    ['abc', 'ttl'],
    ['120.5', 'ttl'],
    [' 120', 'ttl'],
    ['60', null],
    ['120', null],
    ['900', null],
  ])('RELAY_TTL_SECONDS %j: %s', (ttl, problem) => {
    expect(problemOf(envWith({ RELAY_TTL_SECONDS: ttl }))).toBe(problem);
  });

  it.each<[string | undefined, string | null, boolean?]>([
    [undefined, 'origins'],
    ['', 'origins'],
    ['*', 'origins'],
    ['http://thezombierobot.github.io', 'origins'],
    ['https://thezombierobot.github.io/Diet', 'origins'],
    [`${APP_ORIGIN},${APP_ORIGIN}`, 'origins'],
    ['https://a.example,', 'origins'],
    ['http://localhost:4529', 'origins'],
    ['http://localhost:4529', null, true],
    [APP_ORIGIN, null],
    [`${APP_ORIGIN}, ${EXTENSION_ORIGIN}`, null],
  ])('ALLOWED_ORIGINS %j: %s (loopback allowed: %s)', (origins, problem, loopback = false) => {
    expect(problemOf(envWith({ ALLOWED_ORIGINS: origins }), loopback)).toBe(problem);
  });

  it('accepts exactly the listed origins', () => {
    const env = envWith({ ALLOWED_ORIGINS: `${APP_ORIGIN}, ${EXTENSION_ORIGIN}` });
    const config = parseRelayConfig(env, { allowLoopbackOrigins: false });
    expect(config.ok && [...config.allowedOrigins]).toEqual([APP_ORIGIN, EXTENSION_ORIGIN]);
  });

  it.each<[string, unknown, string | null]>([
    ['missing', undefined, 'kv'],
    ['without put', { getWithMetadata: () => null, delete: () => null }, 'kv'],
    ['complete', new KvModel(createClock()), null],
  ])('RELAY_KV %s: %s', (_name, kv, problem) => {
    expect(problemOf(envWith({ RELAY_KV: kv }))).toBe(problem);
  });

  it.each([
    ['ttl', { RELAY_TTL_SECONDS: '901' }],
    ['origins', { ALLOWED_ORIGINS: '*' }],
    ['kv', 'no put'],
  ] as const)(
    'a %s problem answers every request with 500 misconfigured, with no CORS headers and no KV call',
    async (problem, change) => {
      const clock = createClock();
      const kv = new KvModel(clock);
      const changes =
        change === 'no put'
          ? {
              RELAY_KV: {
                getWithMetadata: kv.getWithMetadata.bind(kv),
                delete: kv.delete.bind(kv),
              },
            }
          : change;
      const env = envWith(changes, kv);
      expect(problemOf(env)).toBe(problem);
      const handler = createRelayHandler({ now: clock.now, allowLoopbackOrigins: false });
      const requests: RelayRequestInit[] = [
        { method: 'GET', path: '/v1/list' },
        { method: 'POST', path: '/nope', body: syntheticBody(100) },
      ];
      for (const init of requests) {
        const { response, text } = await send(handler, env, init);
        expect(response.status).toBe(500);
        expect(JSON.parse(text)).toEqual({ error: 'misconfigured' });
        expect(response.headers.get('Access-Control-Allow-Origin')).toBeNull();
      }
      expect([kv.puts, kv.reads, kv.deletes]).toEqual([[], [], []]);
    },
  );
});
