// @vitest-environment node
// The relay client (checklist item 31 design 1.9; N1; HS-14, TR-11, L13, L32), with a fake fetch
// and fake timers. Every request is to the given origin's slot, with exactly the specified options.
import { relayEndpoint } from '@diet/core';
import { importPairingKey, sealForRelay } from '@diet/grocery/transfer';
import { VECTOR_KEY_BYTES } from '@diet/test-fixtures';
import { describe, expect, it, vi } from 'vitest';
import { getAck, postList, type RelayClientDeps } from './relayClient';

const ORIGIN = 'https://relay.example.test';
const ROOM = 'ExampleRoomId00000000A';

const sealed = async () =>
  sealForRelay(await importPairingKey(VECTOR_KEY_BYTES), 'list', new Uint8Array([1, 2, 3]));

function fakeDeps(answer: (url: string, init: RequestInit) => Promise<Response>) {
  const calls: { url: string; init: RequestInit }[] = [];
  const timers: (() => void)[] = [];
  const deps: RelayClientDeps = {
    fetch: (url, init) => {
      calls.push({ url, init });
      return answer(url, init);
    },
    setTimeout: (fn) => timers.push(fn),
    clearTimeout: () => undefined,
  };
  return { deps, calls, timers };
}

/** A response whose body records whether it was cancelled. */
function tracked(status: number, text: string, headers: Record<string, string> = {}) {
  const state = { pulled: 0, cancelled: false };
  const chunks = text.match(/[\s\S]{1,1000}/g) ?? [];
  const body = new ReadableStream<Uint8Array>({
    pull: (controller) => {
      const next = chunks[state.pulled++];
      if (next === undefined) controller.close();
      else controller.enqueue(new TextEncoder().encode(next));
    },
    cancel: () => {
      state.cancelled = true;
    },
  });
  return { response: new Response(status === 204 ? null : body, { status, headers }), state, body };
}

describe('N1 HS-14 TR-11: postList and getAck', () => {
  it('a POST goes to the list slot with exactly the specified options; a GET has no type and no body', async () => {
    const { deps, calls } = fakeDeps(() => Promise.resolve(new Response(null, { status: 204 })));
    const body = await sealed();
    const answer = await postList(ORIGIN, ROOM, body, new AbortController().signal, deps);
    expect(answer).toEqual({ status: 204, outcome: 'stored', retryAfter: null, body: null });
    await getAck(ORIGIN, ROOM, new AbortController().signal, deps);
    const [post, get] = calls;
    expect(post?.url).toBe(relayEndpoint(ORIGIN, 'list'));
    const { signal, ...init } = post?.init ?? {};
    expect(signal).toBeInstanceOf(AbortSignal);
    expect(init).toEqual({
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8', 'X-Relay-Room': ROOM },
      body,
      mode: 'cors',
      credentials: 'omit',
      cache: 'no-store',
      redirect: 'error',
      referrerPolicy: 'no-referrer',
    });
    expect(get?.url).toBe(relayEndpoint(ORIGIN, 'ack'));
    expect(get?.init.headers).toEqual({ 'X-Relay-Room': ROOM });
    expect('body' in (get?.init ?? {})).toBe(false);
  });

  it('never throws: a refused fetch, a time-out and the caller’s abort are unavailable', async () => {
    const refused = fakeDeps(() => Promise.reject(new TypeError('Failed to fetch')));
    const body = await sealed();
    expect(await postList(ORIGIN, ROOM, body, new AbortController().signal, refused.deps)).toEqual({
      status: null,
      outcome: 'unavailable',
      retryAfter: null,
      body: null,
    });
    const hanging = fakeDeps(
      (_url, init) =>
        new Promise((_resolve, reject) => {
          init.signal?.addEventListener('abort', () => {
            reject(new DOMException('aborted', 'AbortError'));
          });
        }),
    );
    const timedOut = postList(ORIGIN, ROOM, body, new AbortController().signal, hanging.deps);
    hanging.timers[0]?.();
    expect((await timedOut).outcome).toBe('unavailable');
    const caller = new AbortController();
    const aborted = getAck(ORIGIN, ROOM, caller.signal, hanging.deps);
    caller.abort();
    expect((await aborted).status).toBeNull();
    expect(hanging.calls[1]?.init.signal?.aborted).toBe(true);
  });

  it('makes no request for a caller that has already stopped', async () => {
    const { deps, calls } = fakeDeps(() => Promise.resolve(new Response(null, { status: 204 })));
    const stopped = new AbortController();
    stopped.abort();
    expect((await postList(ORIGIN, ROOM, await sealed(), stopped.signal, deps)).outcome).toBe(
      'unavailable',
    );
    expect((await getAck(ORIGIN, ROOM, stopped.signal, deps)).outcome).toBe('unavailable');
    expect(calls).toHaveLength(0);
  });

  it('maps statuses like relayOutcome, returns Retry-After, and reads a body only for a GET 200 within 4,096', async () => {
    const answers = [
      tracked(503, '{"error":"busy"}', { 'Retry-After': '30' }),
      tracked(200, 'rl1.AAAA'),
      tracked(200, 'x'.repeat(8_000)),
      tracked(200, 'x', { 'Content-Length': '4097' }),
      tracked(204, ''),
    ];
    let next = 0;
    const { deps } = fakeDeps(() => Promise.resolve(answers[next++]?.response ?? new Response()));
    const signal = new AbortController().signal;
    expect(await postList(ORIGIN, ROOM, await sealed(), signal, deps)).toEqual({
      status: 503,
      outcome: 'unavailable',
      retryAfter: '30',
      body: null,
    });
    expect(answers[0]?.state.cancelled).toBe(true);
    expect(await getAck(ORIGIN, ROOM, signal, deps)).toMatchObject({
      outcome: 'delivered',
      body: 'rl1.AAAA',
    });
    expect(await getAck(ORIGIN, ROOM, signal, deps)).toMatchObject({
      outcome: 'unavailable',
      body: null,
    });
    expect(answers[2]?.state.cancelled).toBe(true);
    expect(await getAck(ORIGIN, ROOM, signal, deps)).toMatchObject({
      outcome: 'unavailable',
      body: null,
    });
    expect(answers[3]?.state.cancelled).toBe(true);
    expect(await getAck(ORIGIN, ROOM, signal, deps)).toMatchObject({
      outcome: 'nothing-waiting',
      body: null,
    });
  });

  it('only a sealed body can be posted (TR-02)', () => {
    const deps = fakeDeps(() => Promise.resolve(new Response(null, { status: 204 }))).deps;
    const post = vi.fn(postList);
    // @ts-expect-error a plain string is not a SealedRelayBody
    void post(ORIGIN, ROOM, 'rl1.AAAA', new AbortController().signal, deps);
    expect(post).toHaveBeenCalledOnce();
  });
});
