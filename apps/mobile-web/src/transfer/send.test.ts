// @vitest-environment node
// Send to laptop and Paste code (checklist item 31 design 1.4; N2, N3, N6; HS-14, HS-NN, TR-02,
// TR-05a, TR-05b, TR-07, C80, C114, R32, L4, L9, L12, L16, L33, L34, L43, L44). Real Dexie over
// fake-indexeddb, a real pairing key and item 30's real sealing, with a fake fetch and timers.
import { type GroceryListRecord, relayBodyFits, type TransferPairingRecord } from '@diet/core';
import {
  bodyFromPasteCode,
  decodeListPayload,
  encodeTransferPayload,
  importPairingKey,
  listPayload,
  openFromRelay,
  type PairingKey,
  type SealedRelayBody,
  sealForRelay,
} from '@diet/grocery/transfer';
import {
  groceryList300,
  groceryListOverCap,
  groceryListSentinel,
  VECTOR_KEY_BYTES,
} from '@diet/test-fixtures';
import type { DBCore, Middleware } from 'dexie';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { openSnapshotDb, openTestDb, type TestDb, testEnv } from '../db/testKit';
import { healthSentinelSnapshot } from '../db/testSentinels';
import { createStore } from '../store';
import { browserTransferDevices, type TransferDevices } from './devices';
import { makePasteCode, type SendArgs, type SendDeps, sendList } from './send';
import { EMPTY_SESSION } from './session';

const ORIGIN = 'https://relay.example.test';
const ROOM = 'ExampleRoomId00000000A';
const NOW = '2000-03-01T00:00:00.000Z';

const opened: TestDb[] = [];
afterEach(() => {
  for (const test of opened.splice(0)) test.db.shutDown();
});

type Answer = (n: number, init: RequestInit) => Promise<Response>;
const status = (code: number, headers: Record<string, string> = {}): Promise<Response> =>
  Promise.resolve(new Response(code === 204 ? null : '{}', { status: code, headers }));
/** A fetch that never answers, failing when its request is aborted. */
const hang = (init: RequestInit) =>
  new Promise<Response>((_resolve, reject) => {
    init.signal?.addEventListener('abort', () => {
      reject(new DOMException('aborted', 'AbortError'));
    });
  });

interface Harness {
  readonly test: TestDb;
  readonly deps: SendDeps;
  readonly args: SendArgs;
  readonly key: PairingKey;
  readonly posts: { url: string; init: RequestInit }[];
  readonly timers: { fn: () => void; ms: number }[];
}

async function harness(
  options: {
    readonly list?: GroceryListRecord;
    readonly stored?: GroceryListRecord;
    readonly relayUrl?: string;
    readonly origin?: string | null;
    readonly online?: boolean;
    readonly answer?: Answer;
    readonly test?: TestDb;
    readonly devices?: Partial<TransferDevices>;
  } = {},
): Promise<Harness> {
  const test = options.test ?? (await openTestDb({ env: testEnv(NOW) }));
  opened.push(test);
  const list = options.list ?? groceryListSentinel();
  if (options.test === undefined) await test.db.grocery_lists.put(options.stored ?? list);
  const key = await importPairingKey(VECTOR_KEY_BYTES);
  const pairing: TransferPairingRecord = await test.repos.pairing.save({
    roomId: ROOM,
    relayUrl: options.relayUrl ?? ORIGIN,
    key,
  });
  const posts: Harness['posts'] = [];
  const timers: Harness['timers'] = [];
  const answer = options.answer ?? (() => status(204));
  const devices: TransferDevices = {
    ...browserTransferDevices,
    relay: {
      fetch: (url, init) => {
        posts.push({ url, init });
        return answer(posts.length, init);
      },
      setTimeout: (fn, ms) => timers.push({ fn, ms }),
      clearTimeout: () => undefined,
    },
    monotonic: () => 0,
    ...options.devices,
  };
  const session = createStore(EMPTY_SESSION);
  return {
    test,
    key,
    posts,
    timers,
    deps: { storage: test.storage, session, devices },
    args: {
      list,
      pairing,
      origin: options.origin === undefined ? ORIGIN : options.origin,
      online: options.online ?? true,
    },
  };
}

const opened$ = async (h: Harness, body: string | undefined) =>
  decodeListPayload((await openFromRelay(h.key, 'list', body)) ?? new Uint8Array(0));
const posted = (h: Harness, n = 0) => h.posts[n]?.init.body as string | undefined;
const stored = (h: Harness) => h.test.repos.groceryLists.get(h.args.list.id);
/** Waits until the session reaches a phase (the send runs on its own). */
async function untilPhase(h: Harness, phase: string): Promise<void> {
  for (let i = 0; i < 200 && h.deps.session.get().phase !== phase; i++) {
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
  expect(h.deps.session.get().phase).toBe(phase);
}

describe('N2: a Send tap', () => {
  it('stored: one POST of the sealed list, recorded with its own send id and time, then listening', async () => {
    const h = await harness();
    await sendList(h.args, h.deps);
    expect(h.posts).toHaveLength(1);
    const payload = await opened$(h, posted(h));
    expect(payload).not.toBeNull();
    if (payload === null) return;
    expect(payload).toEqual(listPayload(h.args.list, payload));
    expect(await stored(h)).toMatchObject({
      sentVersion: 3,
      sentAt: payload.sentAt,
      transferId: payload.transferId,
      version: 3,
    });
    expect(h.deps.session.get()).toMatchObject({
      phase: 'idle',
      outcome: null,
      panel: null,
      listening: { transferId: payload.transferId, sentVersion: 3, sentAt: NOW },
    });
  });

  it('NN-07 L60: the send time is later than every recorded send of any list, even with the clock behind', async () => {
    const ahead = '2000-03-01T00:01:00.000Z';
    const other = {
      ...groceryList300().list,
      sentVersion: 1,
      sentAt: ahead,
      transferId: '00000000-0000-4000-8000-0000000000c1',
    };
    const h = await harness();
    await h.test.db.grocery_lists.put(other);
    await sendList(h.args, h.deps);
    expect((await opened$(h, posted(h)))?.sentAt).toBe('2000-03-01T00:01:00.001Z');
    await sendList(h.args, h.deps);
    expect((await opened$(h, posted(h, 1)))?.sentAt).toBe('2000-03-01T00:01:00.002Z');
  });

  it('C114 L33 L34: too large or a sealing fault: no request and no paste code', async () => {
    // @ts-expect-error a plain string stands in for a sealed body (only sealForRelay makes one)
    const huge: SealedRelayBody = `rl1.${'A'.repeat(65_536)}`;
    const cases: [Partial<TransferDevices>, string][] = [
      [{ seal: () => Promise.resolve(huge) }, 'too-large'],
      [
        {
          payload: () => {
            throw new RangeError('transfer payload');
          },
        },
        'refused',
      ],
      [{ seal: () => Promise.reject(new Error('no WebCrypto')) }, 'refused'],
    ];
    for (const [devices, outcome] of cases) {
      const h = await harness({ devices });
      await sendList(h.args, h.deps);
      expect([h.posts.length, h.deps.session.get().outcome, h.deps.session.get().panel]).toEqual([
        0,
        outcome,
        null,
      ]);
    }
  });

  it('C80 R32: 413 is too large and 400 or 415 refused, with no paste code; 503 offers the code of the very body posted', async () => {
    for (const [code, outcome] of [
      [413, 'too-large'],
      [400, 'refused'],
      [415, 'refused'],
    ] as const) {
      const h = await harness({ answer: () => status(code) });
      await sendList(h.args, h.deps);
      expect([h.deps.session.get().outcome, h.deps.session.get().panel]).toEqual([outcome, null]);
    }
    const h = await harness({ answer: () => status(503, { 'Retry-After': '30' }) });
    await sendList(h.args, h.deps);
    expect(h.posts).toHaveLength(1);
    const { outcome, panel } = h.deps.session.get();
    expect(outcome).toBe('unavailable');
    expect(bodyFromPasteCode(panel?.code ?? '')).toEqual({ ok: true, body: posted(h) });
    expect((await stored(h))?.sentVersion).toBeNull();
  });

  it('L12: one retry after a short Retry-After, with the same body; never a second', async () => {
    const answers = [status(429, { 'Retry-After': '2' }), status(204)];
    const h = await harness({ answer: (n) => answers[n - 1] ?? status(500) });
    const running = sendList(h.args, h.deps);
    await untilPhase(h, 'retrying');
    h.timers.find((t) => t.ms === 2_000)?.fn();
    await running;
    expect(h.posts.map((p) => p.init.body)).toEqual([posted(h), posted(h)]);
    expect((await stored(h))?.sentVersion).toBe(3);

    const twice = await harness({ answer: () => status(429, { 'Retry-After': '1' }) });
    const again = sendList(twice.args, twice.deps);
    await untilPhase(twice, 'retrying');
    twice.timers.find((t) => t.ms === 1_000)?.fn();
    await again;
    expect(twice.posts).toHaveLength(2);
    expect(twice.deps.session.get().outcome).toBe('unavailable');
    expect(twice.deps.session.get().panel).not.toBeNull();
  });

  it('TR-07 L9: offline, relay not set up, or a pairing for another relay: a paste code and no request', async () => {
    const rows = [
      { online: false, outcome: 'offline' },
      { origin: null, outcome: null },
      { relayUrl: 'https://other.example.test', outcome: null },
    ] as const;
    for (const { outcome, ...row } of rows) {
      const h = await harness(row);
      await sendList(h.args, h.deps);
      expect(h.posts).toHaveLength(0);
      expect(h.deps.session.get().outcome).toBe(outcome);
      const code = bodyFromPasteCode(h.deps.session.get().panel?.code ?? '');
      expect(code.ok && (await opened$(h, code.body))?.listId).toBe(h.args.list.id);
      expect((await stored(h))?.sentVersion).toBeNull();
    }
  });

  it('L16: a send the relay stored but this phone could not record still listens; one another tab outran is not listened for', async () => {
    const h = await harness();
    vi.spyOn(h.test.storage.repos.groceryTransfer, 'recordSend').mockRejectedValueOnce(
      new Error('full'),
    );
    await sendList(h.args, h.deps);
    expect(h.deps.session.get()).toMatchObject({ recordFailed: true, outcome: null });
    expect(h.deps.session.get().listening).not.toBeNull();

    const later = {
      ...groceryListSentinel(),
      version: 4,
      sentVersion: 4,
      sentAt: NOW,
      transferId: '00000000-0000-4000-8000-0000000000c1',
    };
    const outrun = await harness({ stored: later });
    await sendList(outrun.args, outrun.deps);
    expect(outrun.deps.session.get()).toMatchObject({ recordFailed: false, listening: null });
  });
});

describe('N2 L4 L44: Paste code', () => {
  it('reuses the body of the last tap for the same version, and seals afresh after an edit', async () => {
    const h = await harness({ answer: () => status(503) });
    await sendList(h.args, h.deps);
    const first = h.deps.session.get().panel?.code;
    await makePasteCode(h.args, h.deps);
    expect(h.deps.session.get().panel?.code).toBe(first);
    const edited = { ...h.args, list: { ...h.args.list, version: 4 } };
    await makePasteCode(edited, h.deps);
    const code = bodyFromPasteCode(h.deps.session.get().panel?.code ?? '');
    const payload = code.ok ? await opened$(h, code.body) : null;
    expect(payload?.version).toBe(4);
    expect(payload?.transferId).not.toBe((await opened$(h, posted(h)))?.transferId);
    expect(h.posts).toHaveLength(1);
  });

  it('with the relay ready, a Paste code tap makes a code and contacts nothing', async () => {
    const h = await harness();
    await makePasteCode(h.args, h.deps);
    expect(h.posts).toHaveLength(0);
    expect(h.deps.session.get().panel).not.toBeNull();
    expect((await stored(h))?.sentVersion).toBeNull();
  });

  it('a hanging connection: the code of the body in flight, then unavailable at the time-out with the same code', async () => {
    const h = await harness({ answer: (_n, init) => hang(init) });
    const running = sendList(h.args, h.deps);
    await untilPhase(h, 'sending');
    await makePasteCode(h.args, h.deps);
    const code = h.deps.session.get().panel?.code;
    expect(bodyFromPasteCode(code ?? '')).toEqual({ ok: true, body: posted(h) });
    h.timers.find((t) => t.ms === 20_000)?.fn();
    await running;
    expect(h.deps.session.get()).toMatchObject({ outcome: 'unavailable', panel: { code } });
  });
});

describe('N2 HS-14 L43: a send stops when its pairing changes or the records close', () => {
  it('unpaired during the retry wait: no second POST, nothing recorded, the session reset', async () => {
    const h = await harness({ answer: () => status(429, { 'Retry-After': '5' }) });
    const running = sendList(h.args, h.deps);
    await untilPhase(h, 'retrying');
    await h.test.repos.pairing.remove();
    await running;
    expect(h.posts).toHaveLength(1);
    expect(h.deps.session.get()).toEqual(EMPTY_SESSION);
    expect((await stored(h))?.sentVersion).toBeNull();
  });

  it('the records close, or a new pairing is saved, while the POST is in flight: aborted, nothing recorded', async () => {
    for (const change of [
      (h: Harness) => {
        h.test.db.gate.close();
        return Promise.resolve();
      },
      (h: Harness) => h.test.repos.pairing.save({ roomId: ROOM, relayUrl: ORIGIN, key: h.key }),
    ]) {
      const h = await harness({ answer: (_n, init) => hang(init) });
      h.test.env.set('2000-03-01T00:00:01.000Z');
      const running = sendList(h.args, h.deps);
      await untilPhase(h, 'sending');
      await change(h);
      await running;
      expect(h.posts[0]?.init.signal?.aborted).toBe(true);
      expect(h.deps.session.get()).toEqual(EMPTY_SESSION);
      expect((await h.test.db.grocery_lists.get(h.args.list.id))?.sentVersion).toBeNull();
    }
  });

  it('unpaired between the 204 and the record: nothing recorded, nothing listened for', async () => {
    let h: Harness | null = null;
    h = await harness({
      answer: async () => {
        await h?.test.repos.pairing.remove();
        return status(204);
      },
    });
    await sendList(h.args, h.deps);
    expect((await stored(h))?.sentVersion).toBeNull();
    expect(h.deps.session.get().listening).toBeNull();
  });

  it('edited during the send: the version sent is recorded, with no outcome or panel', async () => {
    let h: Harness | null = null;
    h = await harness({
      answer: async () => {
        if (h !== null) {
          await h.test.repos.groceryLists.update(h.args.list.id, { storeName: 'Example store 2' });
          h.deps.session.set({ ...h.deps.session.get(), version: 4 });
        }
        return status(204);
      },
    });
    await sendList(h.args, h.deps);
    expect(await stored(h)).toMatchObject({ version: 4, sentVersion: 3 });
    expect(h.deps.session.get()).toMatchObject({ outcome: null, panel: null });
    expect(h.deps.session.get().listening?.sentVersion).toBe(3);
  });
});

describe('N3 HS-NN HEALTH_SAFETY 7: only the list leaves, from a phone full of sentinels', () => {
  it('the opened POST is exactly the list payload, with no health mark, and only the list and pairing are read', async () => {
    const seeded = await openSnapshotDb(healthSentinelSnapshot({ groceryList: 'sentinel' }), NOW);
    opened.push(seeded);
    const touched = new Set<string>();
    const spy: Middleware<DBCore> = {
      stack: 'dbcore',
      name: 'test-read-spy',
      create: (down) => ({
        ...down,
        table: (name) => {
          const table = down.table(name);
          const note = <R>(run: () => R): R => {
            touched.add(name);
            return run();
          };
          return {
            ...table,
            get: (req) => note(() => table.get(req)),
            getMany: (req) => note(() => table.getMany(req)),
            query: (req) => note(() => table.query(req)),
            openCursor: (req) => note(() => table.openCursor(req)),
            count: (req) => note(() => table.count(req)),
            mutate: (req) => note(() => table.mutate(req)),
          };
        },
      }),
    };
    const test = await openTestDb({ deps: seeded.deps, env: seeded.env, extraMiddleware: [spy] });
    const h = await harness({ test });
    touched.clear();
    await sendList(h.args, h.deps);
    const plaintext = new TextDecoder().decode(
      (await openFromRelay(h.key, 'list', posted(h))) ?? new Uint8Array(0),
    );
    const payload = decodeListPayload(new TextEncoder().encode(plaintext));
    expect(payload?.list.items.map((i) => i.text)).toEqual([
      'zzsentinel',
      'Example item 2',
      'Example item 3',
      'Example item 6',
    ]);
    for (const mark of ['zzh', 'amountNzCents', 'zzalready-have', '300 g from garden']) {
      expect(plaintext).not.toContain(mark);
    }
    expect([...touched].sort()).toEqual(['grocery_lists', 'transfer_pairings']);
  });
});

describe('N6 TR-05a TR-05b: list sizes, with the real sealing', () => {
  it('300 lines seal under half the cap; the over-cap list is too large and sends nothing', async () => {
    const key = await importPairingKey(VECTOR_KEY_BYTES);
    const send = { transferId: '00000000-0000-4000-8000-0000000000a1', sentAt: NOW };
    const body = await sealForRelay(
      key,
      'list',
      encodeTransferPayload(listPayload(groceryList300().list, send)),
    );
    expect(body.length).toBeLessThanOrEqual(32_768);
    expect(relayBodyFits(body, 'list')).toBe(true);
    const h = await harness({ list: groceryListOverCap() });
    await sendList(h.args, h.deps);
    expect([h.posts.length, h.deps.session.get().outcome]).toEqual([0, 'too-large']);
  });
});
