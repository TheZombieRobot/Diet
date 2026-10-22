// @vitest-environment node
// Listening for the laptop's acknowledgement (checklist item 31 design 1.8; contract section 6.3;
// N4; HS-14, C52, C79, L11, L15, L16). Real Dexie over fake-indexeddb, a real key and real
// sealing; the relay, its timers and the monotonic clock are fakes driven step by step.
import { utf8Encode } from '@diet/core';
import {
  ackPayload,
  encodeTransferPayload,
  importPairingKey,
  openFromRelay,
  type PairingKey,
  sealForRelay,
  transferLine,
  transferLineText,
} from '@diet/grocery/transfer';
import { groceryListSentinel, VECTOR_KEY_BYTES } from '@diet/test-fixtures';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { openTestDb, type TestDb, testEnv } from '../db/testKit';
import { startAckPolling } from './ackPoller';
import { GET_TIMEOUT_MS } from './relayClient';
import { EMPTY_SESSION, type SessionEvent, sessionReducer } from './session';

const ORIGIN = 'https://relay.example.test';
const ROOM = 'ExampleRoomId00000000A';
const SENT = '2000-03-01T00:00:00.000Z';
const PAIRED = '2000-02-29T00:00:00.000Z';
const T = '00000000-0000-4000-8000-0000000000a1';
const OTHER = '00000000-0000-4000-8000-0000000000b1';
const list = groceryListSentinel();

const opened: TestDb[] = [];
afterEach(() => {
  for (const test of opened.splice(0)) test.db.shutDown();
});

type Reply = { status: number; body?: string; retryAfter?: string };

async function harness(options: { recorded?: boolean } = {}) {
  const test = await openTestDb({ env: testEnv(SENT) });
  opened.push(test);
  const recorded = options.recorded ?? true;
  await test.db.grocery_lists.put(
    recorded ? { ...list, sentVersion: 3, sentAt: SENT, transferId: T } : list,
  );
  const key = await importPairingKey(VECTOR_KEY_BYTES);
  let mono = 0;
  let timer: { fn: () => void; ms: number; handle: number } | null = null;
  let handles = 0;
  let visible = true;
  let wake: (() => void) | null = null;
  const gets: RequestInit[] = [];
  const replies: Reply[] = [];
  let session = { ...EMPTY_SESSION, recordFailed: !recorded };
  const events: SessionEvent['type'][] = [];
  const poller = startAckPolling(
    {
      listId: list.id,
      sentVersion: 3,
      transferId: T,
      sentAt: SENT,
      storedAtMono: 0,
      roomId: ROOM,
      key,
      origin: ORIGIN,
      pairedAt: PAIRED,
    },
    {
      storage: test.storage,
      open: openFromRelay,
      monotonic: () => mono,
      dispatch: (event) => {
        events.push(event.type);
        session = sessionReducer(session, event);
      },
      canRequest: () => visible,
      onWake: (listener) => {
        wake = listener;
        return () => {
          wake = null;
        };
      },
      relay: {
        fetch: (_url, init) => {
          gets.push(init);
          const reply = replies.shift() ?? { status: 204 };
          // Status 0: no answer until the request is aborted.
          if (reply.status === 0) {
            return new Promise<Response>((_resolve, reject) => {
              init.signal?.addEventListener('abort', () => {
                reject(new DOMException('aborted', 'AbortError'));
              });
            });
          }
          const headers: Record<string, string> =
            reply.retryAfter === undefined ? {} : { 'Retry-After': reply.retryAfter };
          return Promise.resolve(
            new Response(reply.body ?? null, { status: reply.status, headers }),
          );
        },
        // The relay client's own 10 s request time-out is not a poll.
        setTimeout: (fn, ms) => {
          handles += 1;
          if (ms !== GET_TIMEOUT_MS) timer = { fn, ms, handle: handles };
          return handles;
        },
        clearTimeout: (handle) => {
          if (timer?.handle === handle) timer = null;
        },
      },
    },
  );
  /** Lets the next poll fall due and waits for its answer to be handled. */
  const step = async (): Promise<number | null> => {
    const due = timer;
    if (due === null) return null;
    timer = null;
    mono += due.ms;
    due.fn();
    for (let i = 0; i < 50; i++) await new Promise((resolve) => setTimeout(resolve, 0));
    return due.ms;
  };
  const sealedAck = async (version: number, transferId: string, k: PairingKey = key) =>
    sealForRelay(
      k,
      'ack',
      encodeTransferPayload(ackPayload({ listId: list.id, version, transferId, receivedAt: SENT })),
    );
  return {
    test,
    gets,
    replies,
    events,
    step,
    poller,
    sealedAck,
    pending: () => timer !== null,
    hide: (hidden: boolean) => {
      visible = !hidden;
    },
    wake: () => wake?.(),
    session: () => session,
    stored: () => test.repos.groceryLists.get(list.id),
    mono: () => mono,
  };
}

describe('N4 HS-14 C79 L11: when it polls', () => {
  it('every 5 s for 2 minutes, then every 15 s, and none at or after 15 minutes: 75 polls', async () => {
    const h = await harness();
    let waits = 0;
    while ((await h.step()) !== null) waits++;
    expect(h.gets).toHaveLength(75);
    expect(waits).toBe(75);
    expect(h.mono()).toBeLessThan(900_000);
    expect(h.events.at(-1)).toBe('listening-ended');
  });

  it('none while hidden or offline, resuming on wake; a Retry-After of 30 s lengthens the next wait', async () => {
    const h = await harness();
    h.hide(true);
    await h.step();
    expect(h.gets).toHaveLength(0);
    expect(h.pending()).toBe(false);
    h.hide(false);
    h.wake();
    h.replies.push({ status: 503, retryAfter: '30' });
    await h.step();
    expect(h.gets).toHaveLength(1);
    expect(await h.step()).toBe(30_000);
  });
});

describe('N4 C52 L15 L16: what an answer does', () => {
  it('an acknowledgement 60 s late is read and recorded by 65 s, and nothing follows it', async () => {
    const h = await harness();
    while (h.mono() < 60_000) await h.step();
    h.replies.push({ status: 200, body: await h.sealedAck(3, T) });
    await h.step();
    expect(h.mono()).toBeLessThanOrEqual(65_000);
    expect(await h.stored()).toMatchObject({ receivedVersion: 3, laptopReceivedAt: SENT });
    expect(h.session()).toMatchObject({ received: true });
    expect(h.pending()).toBe(false);
  });

  it('another send’s acknowledgement of this version is ignored; the one naming this send is Received', async () => {
    const h = await harness();
    h.replies.push({ status: 200, body: await h.sealedAck(3, OTHER) });
    await h.step();
    expect((await h.stored())?.receivedVersion).toBeNull();
    expect(h.session().received).toBe(false);
    expect(h.pending()).toBe(true);
    h.replies.push({ status: 200, body: await h.sealedAck(3, T) });
    await h.step();
    expect(h.session().received).toBe(true);
  });

  it('recordSend had failed: a matching acknowledgement stops polling and says it could not be recorded', async () => {
    const h = await harness({ recorded: false });
    h.replies.push({ status: 200, body: await h.sealedAck(3, T) });
    await h.step();
    expect(h.pending()).toBe(false);
    const line = transferLine({
      recordsOpen: true,
      pairing: 'ready',
      pairedAt: PAIRED,
      list: { ...list },
      now: SENT,
      outcome: null,
      recordFailed: h.session().recordFailed,
      listening: { transferId: T, sentVersion: 3, tappedAt: SENT },
      received: h.session().received,
    });
    expect(transferLineText(line, null)).toBe(
      'Received on laptop. This phone could not record it, so after a reload the status here may be out of date.',
    );
  });

  it('recordAcknowledgement throwing stops polling, received and record-failed both set', async () => {
    const h = await harness();
    vi.spyOn(h.test.storage.repos.groceryTransfer, 'recordAcknowledgement').mockRejectedValueOnce(
      new Error('full'),
    );
    h.replies.push({ status: 200, body: await h.sealedAck(3, T) });
    await h.step();
    expect(h.session()).toMatchObject({ received: true, recordFailed: true });
    expect(h.pending()).toBe(false);
  });

  it('an older version is recorded and listening goes on; foreign, wrong-key, other-list and above-sent bodies never count', async () => {
    const h = await harness();
    h.replies.push({ status: 200, body: await h.sealedAck(2, OTHER) });
    await h.step();
    expect((await h.stored())?.receivedVersion).toBe(2);
    expect(h.pending()).toBe(true);
    const other = await importPairingKey(new Uint8Array(32).fill(7));
    const threeKeys = await sealForRelay(
      await importPairingKey(VECTOR_KEY_BYTES),
      'ack',
      utf8Encode(JSON.stringify({ listId: list.id, version: 3, receivedAt: SENT })),
    );
    const otherList = await sealForRelay(
      await importPairingKey(VECTOR_KEY_BYTES),
      'ack',
      encodeTransferPayload(ackPayload({ listId: T, version: 3, transferId: T, receivedAt: SENT })),
    );
    for (const body of [
      await h.sealedAck(3, T, other),
      threeKeys,
      otherList,
      await h.sealedAck(4, T),
      'rl1.not-sealed',
    ]) {
      h.replies.push({ status: 200, body });
      await h.step();
    }
    expect((await h.stored())?.receivedVersion).toBe(2);
    expect(h.session().received).toBe(false);
    expect(h.pending()).toBe(true);
  });

  it('a 400 stops; stop() and the records closing abort the request in flight and end the polling', async () => {
    const refused = await harness();
    refused.replies.push({ status: 400 });
    await refused.step();
    expect(refused.pending()).toBe(false);
    expect(refused.events).toContain('listening-ended');

    for (const end of ['stop', 'gate'] as const) {
      const h = await harness();
      h.replies.push({ status: 0 });
      await h.step();
      if (end === 'stop') h.poller.stop();
      else h.test.db.gate.close();
      expect(h.gets[0]?.signal?.aborted).toBe(true);
      expect(await h.step()).toBeNull();
      expect(h.gets).toHaveLength(1);
    }
  });
});
