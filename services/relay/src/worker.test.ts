import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  type Clock,
  exchangeProblems,
  exchanges,
  KvModel,
  relayEnv,
  type RelayRequestInit,
  ROOM_A,
  ROOM_B,
  send,
  syntheticBody,
  T0,
} from './testKit';
import worker from './worker';

// The deployed entry point (wrangler.jsonc `main`), with the runtime's own clock and no loopback
// origins (design R10). Only Date is faked, so streams and promises run as usual, and the KV
// stand-in reads the same clock as the Worker.
const systemClock: Clock = {
  now: () => Date.now(),
  advance: (ms) => vi.setSystemTime(Date.now() + ms),
};

beforeEach(() => {
  vi.useFakeTimers({ now: T0, toFake: ['Date'] });
});

afterEach(() => {
  vi.useRealTimers();
});

afterAll(() => {
  expect(exchangeProblems(exchanges)).toEqual([]);
});

describe('W15. worker.ts: the handler that is deployed (TR-06, R10)', () => {
  it('stamps the expiry from the runtime clock, and refuses a body from its expiry on', async () => {
    const kv = new KvModel(systemClock, { purgeLagMs: 60_000 });
    const call = (init: RelayRequestInit) => send(worker.fetch, relayEnv({ kv }), init);
    for (const room of [ROOM_A, ROOM_B]) {
      const { response } = await call({ method: 'POST', room, body: syntheticBody(100) });
      expect(response.status).toBe(204);
    }
    expect(kv.puts.map((p) => p.options)).toEqual([
      { expirationTtl: 120, metadata: { expiresAt: T0 + 120_000 } },
      { expirationTtl: 120, metadata: { expiresAt: T0 + 120_000 } },
    ]);

    systemClock.advance(119_999);
    expect((await call({ method: 'GET', room: ROOM_A })).response.status).toBe(200);
    systemClock.advance(1);
    expect((await call({ method: 'GET', room: ROOM_B })).response.status).toBe(204);
  });

  it('never allows a loopback origin: one in ALLOWED_ORIGINS means misconfigured', async () => {
    const kv = new KvModel(systemClock);
    const loopback = 'http://localhost:4529';
    const env = relayEnv({ kv, origins: loopback });
    const { response, text } = await send(worker.fetch, env, { method: 'GET', origin: loopback });
    expect([response.status, JSON.parse(text)]).toEqual([500, { error: 'misconfigured' }]);
    expect(kv.reads).toEqual([]);
  });
});
