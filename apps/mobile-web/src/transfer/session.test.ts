// @vitest-environment node
// Session hygiene (checklist item 31 design 1.5; N7; L31) and the build's relay origin (design
// 1.9; N5; L10).
import { RELAY_ORIGIN } from '@diet/core';
import { describe, expect, it } from 'vitest';
import { buildRelayOrigin, withRelayConnectSrc } from './buildOrigin';
import {
  EMPTY_SESSION,
  type ListeningSend,
  type SessionEvent,
  sessionReducer,
  type TransferSession,
} from './session';

const LIST = '00000000-0000-4000-8000-000000000001';
const PAIRING = 'ExampleRoomId00000000A|2000-01-05T00:00:00.000Z';
const listening: ListeningSend = {
  transferId: '00000000-0000-4000-8000-0000000000a1',
  sentVersion: 3,
  sentAt: '2000-01-05T10:00:00.000Z',
  tappedAt: '2000-01-05T10:00:00.000Z',
  storedAtMono: 0,
};
const panel = { code: 'dl1.x', sentAt: listening.sentAt };
const sealed = { body: 'rl1.x', transferId: listening.transferId, sentAt: listening.sentAt };
const run = (events: SessionEvent[], from: TransferSession = EMPTY_SESSION) =>
  events.reduce(sessionReducer, from);
const bound = run([{ type: 'bind', listId: LIST, pairingId: PAIRING, version: 3 }]);
/** A session that has sent version 3, listens for it, and holds an offline outcome and a code. */
const busy: TransferSession = {
  ...bound,
  outcome: 'offline',
  // @ts-expect-error a plain string stands in for a sealed body (only sealForRelay makes one)
  sealed,
  panel,
  listening,
};

describe('N7 L31: sessionReducer', () => {
  it('a tap clears the outcome and the panel, and leaves the listening alone until a new send is stored', () => {
    const tapped = run([{ type: 'tap-start' }], busy);
    expect(tapped).toMatchObject({ outcome: null, panel: null, phase: 'sealing', listening });
    const reopened = run([{ type: 'result', version: 3, outcome: 'unavailable', panel }], tapped);
    expect(reopened).toMatchObject({ phase: 'idle', outcome: 'unavailable', panel, listening });
    const next = { ...listening, transferId: '00000000-0000-4000-8000-0000000000b1' };
    expect(
      run([{ type: 'ack-verified' }, { type: 'stored', listening: next }], busy),
    ).toMatchObject({
      listening: next,
      received: false,
    });
  });

  it('coming online drops only "offline"; a new version drops the tap’s state but not the listening', () => {
    expect(run([{ type: 'online' }], busy)).toEqual({ ...busy, outcome: null });
    expect(run([{ type: 'online' }], { ...busy, outcome: 'unavailable' }).outcome).toBe(
      'unavailable',
    );
    const edited = run([{ type: 'bind', listId: LIST, pairingId: PAIRING, version: 4 }], busy);
    expect(edited).toMatchObject({
      version: 4,
      outcome: null,
      sealed: null,
      panel: null,
      listening,
    });
    const late = run([{ type: 'result', version: 3, outcome: 'unavailable', panel }], edited);
    expect(late).toMatchObject({ outcome: null, panel: null, phase: 'idle' });
  });

  it('a record failure clears only after a later write; a verified acknowledgement keeps the listening', () => {
    const failed = run([{ type: 'record-failed' }, { type: 'listening-ended' }], busy);
    expect(failed).toMatchObject({ recordFailed: true, listening: null });
    expect(run([{ type: 'record-ok' }], failed).recordFailed).toBe(false);
    const received = run([{ type: 'ack-verified' }, { type: 'listening-ended' }], busy);
    expect(received).toMatchObject({ received: true, listening });
  });

  it('another pairing, another list, the records closing and the list going reset everything', () => {
    const fresh = { ...EMPTY_SESSION, listId: LIST, version: 3 };
    expect(run([{ type: 'bind', listId: LIST, pairingId: 'other|x', version: 3 }], busy)).toEqual({
      ...fresh,
      pairingId: 'other|x',
    });
    expect(run([{ type: 'bind', listId: LIST, pairingId: null, version: 3 }], busy)).toEqual({
      ...fresh,
      pairingId: null,
    });
    const other = '00000000-0000-4000-8000-000000000002';
    expect(
      run([{ type: 'bind', listId: other, pairingId: PAIRING, version: 3 }], busy).listening,
    ).toBeNull();
    expect(run([{ type: 'reset' }], busy)).toEqual(EMPTY_SESSION);
  });
});

describe('N5 L10: the relay origin a build uses', () => {
  const html = `<meta content="default-src 'self'; connect-src 'self'; worker-src 'self'" />`;

  it('is RELAY_ORIGIN unless a test build asks for exactly the reserved test origin', () => {
    expect(buildRelayOrigin(undefined)).toBe(RELAY_ORIGIN);
    expect(buildRelayOrigin('')).toBe(RELAY_ORIGIN);
    expect(buildRelayOrigin('https://relay.example.test')).toBe('https://relay.example.test');
    for (const other of [
      'https://relay.example.com',
      'http://127.0.0.1:8787',
      'https://diet-relay.example.workers.dev',
    ]) {
      expect(() => buildRelayOrigin(other)).toThrow('DIET_TEST_RELAY_ORIGIN may only be');
    }
  });

  it('widens connect-src by exactly one origin, or leaves the policy as it is', () => {
    expect(withRelayConnectSrc(html, 'https://relay.example.test')).toBe(
      html.replace("connect-src 'self';", "connect-src 'self' https://relay.example.test;"),
    );
    expect(withRelayConnectSrc(html, null)).toBe(html);
    expect(() => withRelayConnectSrc('<meta />', null)).toThrow();
    expect(() => withRelayConnectSrc(html + html, null)).toThrow();
    expect(() => withRelayConnectSrc(html, 'https://relay.example.test/path')).toThrow();
  });
});
