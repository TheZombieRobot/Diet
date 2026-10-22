/**
 * The relay client (checklist item 31 design 1.9; HS-14, TR-11; item 29's protocol): the only
 * file in the app that makes a network request (tools/scans/rules.ts NETWORK_ALLOWED_FILES). Every
 * request goes through `request`, whose one call is deps.fetch(relayEndpoint(origin, slot), init)
 * (scan Q1), to the build's relay origin only. A POST takes only a SealedRelayBody, which only
 * sealForRelay makes, so an unsealed string cannot be sent. Nothing here throws: no answer, a
 * time-out, a refused connection or an abort is `unavailable`. An answer is read only for a GET
 * 200, and never past 4,096 characters (the relay never stores a longer acknowledgement).
 */
import {
  MAX_RELAY_ACK_BODY_BYTES,
  RELAY_ROOM_HEADER,
  relayEndpoint,
  type RelayOutcome,
  relayOutcome,
  type RelaySlot,
} from '@diet/core';
import type { SealedRelayBody } from '@diet/grocery/transfer';

export const POST_TIMEOUT_MS = 20_000;
export const GET_TIMEOUT_MS = 10_000;

export interface RelayAnswer {
  readonly status: number | null;
  /** relayOutcome(method, status), except an over-long acknowledgement is unavailable. */
  readonly outcome: RelayOutcome;
  readonly retryAfter: string | null;
  /** A GET 200 within 4,096 characters only. */
  readonly body: string | null;
}

export interface RelayClientDeps {
  readonly fetch: (url: string, init: RequestInit) => Promise<Response>;
  readonly setTimeout: (fn: () => void, ms: number) => unknown;
  readonly clearTimeout: (handle: unknown) => void;
}

export const browserRelayDeps: RelayClientDeps = {
  fetch: globalThis.fetch.bind(globalThis),
  setTimeout: (fn, ms) => window.setTimeout(fn, ms),
  clearTimeout: (handle) => {
    window.clearTimeout(handle as number);
  },
};

const NO_ANSWER: RelayAnswer = {
  status: null,
  outcome: 'unavailable',
  retryAfter: null,
  body: null,
};

/** Cancels an answer's body unread (an error here changes nothing). */
function discard(response: Response): void {
  response.body?.cancel().catch(() => undefined);
}

/** The answer's text, or null once it passes the cap (the reader is cancelled at once). */
async function readCapped(response: Response): Promise<string | null> {
  const declared = response.headers.get('Content-Length');
  if (declared !== null && Number(declared) > MAX_RELAY_ACK_BODY_BYTES) {
    discard(response);
    return null;
  }
  if (response.body === null) return '';
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let text = '';
  for (;;) {
    const { done, value } = await reader.read();
    if (done) return text + decoder.decode();
    text += decoder.decode(value, { stream: true });
    if (text.length > MAX_RELAY_ACK_BODY_BYTES) {
      await reader.cancel().catch(() => undefined);
      return null;
    }
  }
}

async function request(
  method: 'POST' | 'GET',
  origin: string,
  slot: RelaySlot,
  roomId: string,
  body: SealedRelayBody | null,
  signal: AbortSignal,
  timeoutMs: number,
  deps: RelayClientDeps,
): Promise<RelayAnswer> {
  const controller = new AbortController();
  const abort = (): void => {
    controller.abort();
  };
  if (signal.aborted) return NO_ANSWER;
  signal.addEventListener('abort', abort);
  const timer = deps.setTimeout(abort, timeoutMs);
  const headers: Record<string, string> =
    method === 'POST'
      ? { 'Content-Type': 'text/plain;charset=utf-8', [RELAY_ROOM_HEADER]: roomId }
      : { [RELAY_ROOM_HEADER]: roomId };
  const init: RequestInit = {
    method,
    headers,
    ...(body === null ? {} : { body }),
    mode: 'cors',
    credentials: 'omit',
    cache: 'no-store',
    redirect: 'error',
    referrerPolicy: 'no-referrer',
    signal: controller.signal,
  };
  try {
    const response = await deps.fetch(relayEndpoint(origin, slot), init);
    const outcome = relayOutcome(method, response.status);
    const retryAfter = response.headers.get('Retry-After');
    if (outcome !== 'delivered') {
      discard(response);
      return { status: response.status, outcome, retryAfter, body: null };
    }
    const text = await readCapped(response);
    return text === null
      ? { status: response.status, outcome: 'unavailable', retryAfter, body: null }
      : { status: response.status, outcome, retryAfter, body: text };
  } catch {
    return NO_ANSWER;
  } finally {
    deps.clearTimeout(timer);
    signal.removeEventListener('abort', abort);
  }
}

/** Posts a sealed list to the room's list slot. */
export function postList(
  origin: string,
  roomId: string,
  body: SealedRelayBody,
  signal: AbortSignal,
  deps: RelayClientDeps = browserRelayDeps,
): Promise<RelayAnswer> {
  return request('POST', origin, 'list', roomId, body, signal, POST_TIMEOUT_MS, deps);
}

/** Reads the room's acknowledgement slot. */
export function getAck(
  origin: string,
  roomId: string,
  signal: AbortSignal,
  deps: RelayClientDeps = browserRelayDeps,
): Promise<RelayAnswer> {
  return request('GET', origin, 'ack', roomId, null, signal, GET_TIMEOUT_MS, deps);
}
