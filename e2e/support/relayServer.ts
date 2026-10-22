import type { BrowserContext, Route } from '@playwright/test';
import { createServer, type IncomingMessage, type Server } from 'node:http';
import { Readable } from 'node:stream';
import {
  RELAY_E2E_ORIGIN,
  RELAY_ROOM_HEADER,
  relayEndpoint,
} from '../../packages/core/src/relay/protocol';
import {
  ackFor,
  applyDecision,
  bodyFromPasteCode,
  decideTransfer,
  decodeListPayload,
  encodeTransferPayload,
  type HeldList,
  importPairingKey,
  type ListPayload,
  openFromRelay,
  type PasteCodeProblem,
  type RecentTransfer,
  recordAccepted,
  sealForRelay,
  type TransferDecision,
  transferRefOf,
  type TransferSource,
} from '../../packages/grocery/src/transfer/index';
import { createRelayHandler } from '../../services/relay/src/handler';
import { KvModel, relayEnv } from '../../services/relay/src/testKit';

// The local relay test server (checklist item 31 design 5.2; item 29 section 6): item 29's real
// handler with its in-memory KV and the production 15-minute expiry, listening on 127.0.0.1 and
// reached by Playwright routing from the reserved name RELAY_E2E_ORIGIN, which never resolves.
// The laptop stand-in runs item 30's real duplicate rule and acknowledgement, as item 33 will.

export type RelayMode =
  | 'up'
  | 'refuse-connection'
  /** The relay stores the list, then the phone sees no answer (NN-07's "stop midway"). */
  | 'store-then-drop'
  | { readonly status: number; readonly retryAfter?: string };

export interface LaptopStandIn {
  readonly held: () => HeldList | null;
  /** Reads the list slot, opens it, decides, and acknowledges; null when nothing is waiting. */
  collect: () => Promise<{
    readonly payload: ListPayload;
    readonly decision: TransferDecision;
  } | null>;
  /** collect() every second until a list arrives, or throws after `timeoutMs`. */
  collectWithin: (timeoutMs: number) => Promise<ListPayload>;
  /** A pasted code: read, open, decide (source 'paste'), and acknowledge. */
  paste: (code: string) => Promise<TransferDecision | PasteCodeProblem | 'cannot-open'>;
}

export interface TestRelay {
  /** RELAY_E2E_ORIGIN: the address the app calls. */
  readonly origin: string;
  /** http://127.0.0.1:<port>: where it really listens. */
  readonly serverOrigin: string;
  readonly kv: KvModel;
  route: (context: BrowserContext) => Promise<void>;
  setMode: (mode: RelayMode) => void;
  laptop: (rawKey: Uint8Array, roomId: string) => Promise<LaptopStandIn>;
  /** Every list body stored so far, in order. */
  listBodies: () => string[];
  close: () => Promise<void>;
}

function headersOf(request: IncomingMessage): Headers {
  const headers = new Headers();
  for (const [name, value] of Object.entries(request.headers)) {
    if (typeof value === 'string') headers.set(name, value);
    else if (Array.isArray(value)) for (const v of value) headers.append(name, v);
  }
  return headers;
}

export async function startTestRelay(appOrigin: string): Promise<TestRelay> {
  const kv = new KvModel({ now: () => Date.now(), advance: () => undefined });
  const env = relayEnv({ kv, ttl: '900', origins: appOrigin });
  const handle = createRelayHandler({ now: () => Date.now(), allowLoopbackOrigins: true });
  const server: Server = createServer((request, response) => {
    void (async () => {
      const method = request.method ?? 'GET';
      const answer = await handle(
        {
          method,
          url: `${RELAY_E2E_ORIGIN}${request.url ?? '/'}`,
          headers: headersOf(request),
          body:
            method === 'POST'
              ? (Readable.toWeb(request) as ReadableStream<Uint8Array<ArrayBuffer>>)
              : null,
        },
        env,
      );
      response.writeHead(answer.status, Object.fromEntries(answer.headers.entries()));
      response.end(Buffer.from(await answer.arrayBuffer()));
    })();
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (address === null || typeof address === 'string') throw new Error('no port');
  const serverOrigin = `http://127.0.0.1:${String(address.port)}`;
  let mode: RelayMode = 'up';

  const forward = (route: Route) =>
    route.fetch({ url: serverOrigin + new URL(route.request().url()).pathname });

  /** A request from Node, as the laptop's side panel makes it (no Origin, item 29 R10). */
  const fromNode = (slot: 'list' | 'ack', roomId: string, body?: string) =>
    fetch(relayEndpoint(RELAY_E2E_ORIGIN, slot).replace(RELAY_E2E_ORIGIN, serverOrigin), {
      method: body === undefined ? 'GET' : 'POST',
      headers: {
        [RELAY_ROOM_HEADER]: roomId,
        ...(body === undefined ? {} : { 'Content-Type': 'text/plain;charset=utf-8' }),
      },
      ...(body === undefined ? {} : { body }),
    });

  return {
    origin: RELAY_E2E_ORIGIN,
    serverOrigin,
    kv,
    route: (context) =>
      context.route(`${RELAY_E2E_ORIGIN}/**`, async (route) => {
        const request = route.request();
        if (mode === 'refuse-connection') {
          await route.abort('connectionrefused');
        } else if (mode === 'up' || request.method() === 'OPTIONS') {
          await route.fulfill({ response: await forward(route) });
        } else if (mode === 'store-then-drop') {
          await forward(route);
          await route.abort('connectionreset');
        } else {
          await route.fulfill({
            status: mode.status,
            contentType: 'application/json; charset=utf-8',
            body: '{"error":"forced"}',
            headers: {
              'Access-Control-Allow-Origin': appOrigin,
              'Access-Control-Expose-Headers': 'Retry-After',
              Vary: 'Origin',
              ...(mode.retryAfter === undefined ? {} : { 'Retry-After': mode.retryAfter }),
            },
          });
        }
      }),
    setMode: (next) => {
      mode = next;
    },
    laptop: async (rawKey, roomId) => {
      const key = await importPairingKey(rawKey);
      let held: HeldList | null = null;
      let recent: RecentTransfer[] = [];
      const decide = async (payload: ListPayload, source: TransferSource) => {
        const now = new Date().toISOString();
        const incoming = transferRefOf(payload, roomId);
        const decision = decideTransfer({
          incoming,
          held: held?.ref ?? null,
          recent,
          source,
          now,
        });
        held = applyDecision(held, payload, roomId, decision, now);
        if (decision.accept) recent = recordAccepted(recent, incoming, now);
        const ack = ackFor(held, roomId);
        if (ack !== null) {
          const body = await sealForRelay(key, 'ack', encodeTransferPayload(ack));
          await fromNode('ack', roomId, body);
        }
        return decision;
      };
      const open = async (body: string) =>
        decodeListPayload((await openFromRelay(key, 'list', body)) ?? new Uint8Array(0));
      const collect: LaptopStandIn['collect'] = async () => {
        const answer = await fromNode('list', roomId);
        if (answer.status !== 200) return null;
        const payload = await open(await answer.text());
        if (payload === null) return null;
        return { payload, decision: await decide(payload, 'relay') };
      };
      return {
        held: () => held,
        collect,
        collectWithin: async (timeoutMs) => {
          const until = Date.now() + timeoutMs;
          while (Date.now() < until) {
            const got = await collect();
            if (got !== null) return got.payload;
            await new Promise((resolve) => setTimeout(resolve, 1_000));
          }
          throw new Error('the laptop stand-in collected nothing in time');
        },
        paste: async (code) => {
          const read = bodyFromPasteCode(code);
          if (!read.ok) return read.problem;
          const payload = await open(read.body);
          return payload === null ? 'cannot-open' : decide(payload, 'paste');
        },
      };
    },
    listBodies: () => kv.puts.filter((put) => put.key.startsWith('list:')).map((put) => put.value),
    close: () =>
      new Promise<void>((resolve, reject) => {
        server.closeAllConnections();
        server.close((error) => {
          if (error) reject(error);
          else resolve();
        });
      }),
  };
}
