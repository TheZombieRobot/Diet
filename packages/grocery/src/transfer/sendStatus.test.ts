// What the Send and export section shows (item 31 design 1.3, 1.7 and 2.4; UX 6b; C12, C52,
// C114, R32; L6, L9, L46, L47, L50; K9 to K12, K15).
import { isRelayOrigin, RELAY_E2E_ORIGIN, RELAY_ORIGIN } from '@diet/core';
import { transfer } from '@diet/core/copy/health';
import { describe, expect, it } from 'vitest';
import { NO_RELAY_URL } from './pairingCode';
import {
  sendPlan,
  TRANSFER_EXTRA_IDS,
  TRANSFER_LINE_IDS,
  transferActions,
  type TransferLineInput,
  transferLine,
  transferLineText,
  transferPairingState,
  transferStatusNextChange,
  transferStatusOf,
} from './sendStatus';

const ORIGIN = 'https://relay.example.test';
const PAIRED = '2000-01-05T09:30:00.000Z';
const NOW = '2000-01-05T10:01:00.000Z';
const SENT = '2000-01-05T10:00:00.000Z';
const T = '00000000-0000-4000-8000-0000000000a1';
const OTHER = '00000000-0000-4000-8000-0000000000b1';

const unsent = {
  version: 3,
  sentVersion: null,
  sentAt: null,
  transferId: null,
  receivedVersion: null,
  receivedAt: null,
} as const;
const waiting = { ...unsent, sentVersion: 3, sentAt: SENT, transferId: T };
const listeningFor = (transferId = T) => ({ transferId, sentVersion: 3, tappedAt: NOW });
const input = (patch: Partial<TransferLineInput> = {}): TransferLineInput => ({
  recordsOpen: true,
  pairing: 'ready',
  pairedAt: PAIRED,
  list: waiting,
  now: NOW,
  outcome: null,
  recordFailed: false,
  listening: null,
  received: false,
  ...patch,
});
const at = (minutes: number) => new Date(Date.parse(SENT) + minutes * 60_000).toISOString();

describe('K9 C12 L9: transferPairingState and sendPlan', () => {
  it('compares the stored relay address exactly with the build’s, and plans the tap from it', () => {
    expect(transferPairingState(null, ORIGIN)).toBe('none');
    expect(transferPairingState({ relayUrl: ORIGIN }, null)).toBe('not-configured');
    expect(transferPairingState({ relayUrl: ORIGIN }, ORIGIN)).toBe('ready');
    expect(transferPairingState({ relayUrl: 'https://other.example.test' }, ORIGIN)).toBe(
      'pair-again',
    );
    expect(transferPairingState({ relayUrl: NO_RELAY_URL }, ORIGIN)).toBe('pair-again');
    expect(transferPairingState({ relayUrl: 'https://Relay.example.test' }, ORIGIN)).toBe(
      'pair-again',
    );
    for (const online of [true, false]) {
      expect(sendPlan('none', online)).toBe('pair-first');
      expect(sendPlan('not-configured', online)).toBe('paste-code');
      expect(sendPlan('pair-again', online)).toBe('paste-code');
    }
    expect(sendPlan('ready', true)).toBe('relay');
    expect(sendPlan('ready', false)).toBe('offline');
  });
});

describe('K10 C52 L46 L47: transferStatusOf', () => {
  it('reads the stored send against the current pairing and a clock that moved back', () => {
    const received = { ...waiting, receivedVersion: 3, receivedAt: at(1) };
    const rows: [string, Partial<TransferLineInput>, string][] = [
      ['never sent', { list: unsent }, 'draft'],
      ['received before the pairing', { list: received, pairedAt: at(2) }, 'before-pairing'],
      ['waiting, sent before the pairing', { pairedAt: at(0.5) }, 'before-pairing'],
      ['waiting', {}, 'waiting'],
      ['expired at exactly 15 minutes', { now: at(15) }, 'expired'],
      ['received', { list: received }, 'received'],
      ['edited since sent', { list: { ...waiting, version: 4 } }, 'edited-since-sent'],
      ['sent 4 minutes ahead', { now: at(-4) }, 'waiting'],
      ['sent exactly the tolerance ahead', { now: at(-5) }, 'waiting'],
      ['sent 10 minutes ahead', { now: at(-10) }, 'expired'],
      [
        'sent 10 minutes ahead, this page listening for it',
        { now: at(-10), listening: listeningFor() },
        'waiting',
      ],
      [
        'sent 10 minutes ahead, listening for another send',
        { now: at(-10), listening: listeningFor(OTHER) },
        'expired',
      ],
      ['no pairing', { pairedAt: null, now: at(1) }, 'waiting'],
    ];
    for (const [name, patch, expected] of rows)
      expect(transferStatusOf(input(patch)), name).toBe(expected);
  });
});

describe('K11 UX 6b C12 C52 C114 R32 L6: transferLine, transferActions and transferStatusNextChange', () => {
  it('picks the line by the design’s precedence, with its extras', () => {
    const olderReceived = { ...waiting, receivedVersion: 2, receivedAt: at(0.5) };
    const rows: [string, Partial<TransferLineInput>, string, string[]][] = [
      [
        'records closed hides everything',
        { recordsOpen: false, pairing: 'none', outcome: 'offline' },
        'recordsClosed',
        [],
      ],
      [
        'not paired hides an outcome',
        { pairing: 'none', pairedAt: null, outcome: 'unavailable' },
        'notPaired',
        [],
      ],
      ['offline', { outcome: 'offline' }, 'offline', []],
      ['too large', { outcome: 'too-large', pairing: 'not-configured' }, 'tooLarge', []],
      ['refused', { outcome: 'refused' }, 'refused', []],
      ['unavailable', { outcome: 'unavailable' }, 'unavailable', []],
      [
        'received in this page',
        { listening: listeningFor(), received: true },
        'statusReceived',
        [],
      ],
      [
        'received in this page, write failed',
        { listening: listeningFor(), received: true, recordFailed: true },
        'statusReceived',
        ['notRecorded'],
      ],
      [
        'received for an older version than the current',
        { list: { ...waiting, version: 4 }, listening: listeningFor(), received: true },
        'statusEditedSinceSent',
        [],
      ],
      ['record failed', { recordFailed: true }, 'recordFailed', []],
      ['not set up', { pairing: 'not-configured' }, 'notConfigured', []],
      ['pair again', { pairing: 'pair-again' }, 'relayNeedsPairing', []],
      ['not sent', { list: unsent }, 'statusNotSent', []],
      ['sent before the pairing', { pairedAt: at(0.5) }, 'statusBeforePairing', []],
      ['waiting after a reload', {}, 'statusWaiting', ['openPanel']],
      [
        'waiting while listening',
        { listening: listeningFor() },
        'statusWaiting',
        ['openPanel', 'keepOpen'],
      ],
      [
        'waiting, an older copy received',
        { list: olderReceived },
        'statusWaiting',
        ['openPanel', 'olderCopy'],
      ],
      [
        'waiting, an older copy received at exactly the pairing',
        { list: { ...olderReceived, receivedAt: PAIRED } },
        'statusWaiting',
        ['openPanel', 'olderCopy'],
      ],
      [
        'waiting, an older copy received before the pairing',
        { list: olderReceived, pairedAt: at(0.75) },
        'statusBeforePairing',
        [],
      ],
      [
        'received',
        { list: { ...waiting, receivedVersion: 3, receivedAt: at(1) } },
        'statusReceived',
        [],
      ],
      ['expired', { now: at(16) }, 'statusExpired', []],
      [
        'expired, an older copy',
        { now: at(16), list: olderReceived },
        'statusExpired',
        ['olderCopy'],
      ],
      [
        'changed, the sent version received',
        { list: { ...waiting, version: 4, receivedVersion: 3, receivedAt: at(1) } },
        'statusEditedSinceSent',
        ['olderCopy'],
      ],
      [
        'changed, nothing received',
        { list: { ...waiting, version: 4 } },
        'statusEditedSinceSent',
        [],
      ],
    ];
    for (const [name, patch, id, extras] of rows) {
      const line = transferLine(input(patch));
      expect([line.id, line.extras], name).toEqual([id, extras]);
    }
    expect(transferLine(input()).time).toBe(SENT);
    expect(transferLine(input({ now: at(-10), listening: listeningFor() })).time).toBe(NOW);
  });

  it('shows Paste code whenever paired, except after too large or refused; Send only when idle', () => {
    const act = (patch: Partial<Parameters<typeof transferActions>[0]>) =>
      transferActions({
        pairing: 'ready',
        outcome: null,
        phase: 'idle',
        recordsOpen: true,
        ...patch,
      });
    expect(act({ pairing: 'none' })).toEqual({
      primary: 'pair',
      sendEnabled: true,
      pasteCode: 'hidden',
    });
    expect(act({ outcome: 'too-large' }).pasteCode).toBe('hidden');
    expect(act({ outcome: 'refused' }).pasteCode).toBe('hidden');
    expect(act({ outcome: 'unavailable', pairing: 'not-configured' }).pasteCode).toBe('enabled');
    expect(act({ phase: 'sealing' })).toEqual({
      primary: 'send',
      sendEnabled: false,
      pasteCode: 'disabled',
    });
    expect(act({ recordsOpen: false })).toEqual({
      primary: 'send',
      sendEnabled: false,
      pasteCode: 'disabled',
    });
    for (const phase of ['sending', 'retrying'] as const) {
      expect(act({ phase })).toEqual({ primary: 'send', sendEnabled: false, pasteCode: 'enabled' });
    }
  });

  it('redraws a waiting line at 15 minutes, and never for a send time ahead or another status', () => {
    expect(transferStatusNextChange(input())).toBe(Date.parse(SENT) + 900_000);
    expect(transferStatusNextChange(input({ now: at(-10), listening: listeningFor() }))).toBeNull();
    expect(transferStatusNextChange(input({ now: at(16) }))).toBeNull();
    expect(transferStatusNextChange(input({ pairedAt: at(0.5) }))).toBeNull();
  });
});

describe('K12 L50: transferLineText', () => {
  it('joins a line and its extras, and leaves a line with none as written', () => {
    const waitingAll = {
      id: 'statusWaiting',
      time: SENT,
      extras: ['openPanel', 'keepOpen', 'olderCopy'],
    } as const;
    expect(transferLineText(waitingAll, '10:42')).toBe(
      "Sent 10:42, waiting for laptop. Open the side panel on the laptop. Keep this screen open to see the laptop's reply. The laptop has an older copy.",
    );
    expect(transferLineText({ id: 'statusReceived', time: null, extras: [] }, null)).toBe(
      'Received on laptop',
    );
    expect(
      transferLineText({ id: 'statusReceived', time: null, extras: ['notRecorded'] }, null),
    ).toBe(
      'Received on laptop. This phone could not record it, so after a reload the status here may be out of date.',
    );
    expect(transferLineText({ id: 'statusExpired', time: null, extras: ['olderCopy'] }, null)).toBe(
      'Not confirmed by the laptop. If the list is not on the laptop, send it again. The laptop has an older copy.',
    );
    expect(() => transferLineText({ id: 'statusWaiting', time: SENT, extras: [] }, null)).toThrow(
      RangeError,
    );
    for (const id of TRANSFER_LINE_IDS) {
      expect(transferLineText({ id, time: null, extras: [] }, '10:42')).not.toBe('');
    }
  });

  it('has a copy string for exactly every line and extra id', () => {
    expect(new Set(Object.keys(transfer.send.lines))).toEqual(new Set(TRANSFER_LINE_IDS));
    expect(new Set(Object.keys(transfer.send.extras))).toEqual(new Set(TRANSFER_EXTRA_IDS));
  });
});

describe('K15 L10: the browser-test relay origin', () => {
  // G20 (duplicates.test.ts) checks that no transfer name is a validator constant.
  it('is a reserved name, distinct from the real relay and from no relay', () => {
    expect(isRelayOrigin(RELAY_E2E_ORIGIN)).toBe(true);
    expect(RELAY_E2E_ORIGIN.endsWith('.example.test')).toBe(true);
    expect([RELAY_ORIGIN, NO_RELAY_URL]).not.toContain(RELAY_E2E_ORIGIN);
  });
});
