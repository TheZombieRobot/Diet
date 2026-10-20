// The Laptop pairing screen's steps (item 30 design 1.4.2; A6): every row of the table, and every
// other (step, event) pair leaves the view as the same object.
import { transfer } from '@diet/core/copy/health';
import { describe, expect, it } from 'vitest';
import {
  INITIAL_PAIRING_VIEW,
  PAIRING_ERRORS,
  type PairingEvent,
  type PairingView,
  pairingReducer,
} from './pairingFlow';

const VIEWS: Readonly<Record<string, PairingView>> = {
  idle: INITIAL_PAIRING_VIEW,
  'idle with a notice': { step: 'idle', notice: 'damaged', returnTo: null },
  'confirm-pair-again': { step: 'confirm-pair-again' },
  'confirm-unpair': { step: 'confirm-unpair' },
  unpairing: { step: 'unpairing' },
  starting: { step: 'starting' },
  scanning: { step: 'scanning', sawOtherCode: false },
  'scanning, other code seen': { step: 'scanning', sawOtherCode: true },
  saving: { step: 'saving' },
};

const EVENTS: Readonly<Record<string, PairingEvent>> = {
  scan: { type: 'scan' },
  'ask-pair-again': { type: 'ask-pair-again' },
  'ask-unpair': { type: 'ask-unpair' },
  cancel: { type: 'cancel' },
  'confirm-unpair': { type: 'confirm-unpair' },
  'camera-ready': { type: 'camera-ready' },
  'camera-denied': { type: 'camera-failed', error: 'camera-denied' },
  'decoded ok': { type: 'decoded', outcome: 'ok' },
  'decoded other': { type: 'decoded', outcome: 'not-pairing-code' },
  'decoded newer': { type: 'decoded', outcome: 'newer-version' },
  'decoded damaged': { type: 'decoded', outcome: 'damaged' },
  timeout: { type: 'timeout' },
  hidden: { type: 'hidden' },
  saved: { type: 'saved' },
  'save-failed': { type: 'save-failed', reason: 'save-failed' },
  'save-failed full': { type: 'save-failed', reason: 'storage-full' },
  'save-failed closed': { type: 'save-failed', reason: 'records-closed' },
  unpaired: { type: 'unpaired' },
  'unpair-failed': { type: 'unpair-failed', recordsClosed: false },
  'unpair-failed closed': { type: 'unpair-failed', recordsClosed: true },
  'records-closed': { type: 'records-closed' },
};

const idle = (notice: string | null, returnTo: string | null = null) => ({
  step: 'idle',
  notice,
  returnTo,
});
const camera = ['starting', 'scanning', 'scanning, other code seen'];

/** [view, event, the next view] for every row of the design's table. */
const TABLE: [string, string, object][] = [
  ['idle', 'scan', { step: 'starting' }],
  ['idle with a notice', 'scan', { step: 'starting' }],
  ['confirm-pair-again', 'scan', { step: 'starting' }],
  ['idle', 'ask-pair-again', { step: 'confirm-pair-again' }],
  ['idle with a notice', 'ask-pair-again', { step: 'confirm-pair-again' }],
  ['idle', 'ask-unpair', { step: 'confirm-unpair' }],
  ['idle with a notice', 'ask-unpair', { step: 'confirm-unpair' }],
  ...camera.map((v): [string, string, object] => [v, 'cancel', idle(null, 'scan')]),
  ['confirm-pair-again', 'cancel', idle(null, 'pair-again')],
  ['confirm-unpair', 'cancel', idle(null, 'unpair')],
  ['starting', 'camera-ready', { step: 'scanning', sawOtherCode: false }],
  ...camera.map((v): [string, string, object] => [v, 'camera-denied', idle('camera-denied')]),
  ['scanning', 'decoded ok', { step: 'saving' }],
  ['scanning, other code seen', 'decoded ok', { step: 'saving' }],
  ['scanning', 'decoded other', { step: 'scanning', sawOtherCode: true }],
  ['scanning', 'decoded newer', idle('newer-version')],
  ['scanning, other code seen', 'decoded newer', idle('newer-version')],
  ['scanning', 'decoded damaged', idle('damaged')],
  ['scanning, other code seen', 'decoded damaged', idle('damaged')],
  ...camera.map((v): [string, string, object] => [v, 'timeout', idle('stopped-timeout')]),
  ...camera.map((v): [string, string, object] => [v, 'hidden', idle('stopped-hidden')]),
  ['saving', 'saved', idle('paired-now')],
  ['saving', 'save-failed', idle('save-failed')],
  ['saving', 'save-failed full', idle('storage-full')],
  ['saving', 'save-failed closed', idle(null)],
  ['confirm-unpair', 'confirm-unpair', { step: 'unpairing' }],
  ['unpairing', 'unpaired', idle('unpaired-now')],
  ['unpairing', 'unpair-failed', idle('unpair-failed')],
  ['unpairing', 'unpair-failed closed', idle(null)],
  ...Object.keys(VIEWS)
    .filter((v) => v !== 'idle')
    .map((v): [string, string, object] => [v, 'records-closed', idle(null)]),
];

const viewOf = (name: string): PairingView => {
  const view = VIEWS[name];
  if (view === undefined) throw new Error(name);
  return view;
};
const eventOf = (name: string): PairingEvent => {
  const event = EVENTS[name];
  if (event === undefined) throw new Error(name);
  return event;
};

describe('pairingReducer (A6)', () => {
  it.each(TABLE)('%s, %s', (view, event, next) => {
    expect(pairingReducer(viewOf(view), eventOf(event))).toEqual(next);
  });

  it('every other pair returns the same object (an other code seen twice does not re-render)', () => {
    const listed = new Set(TABLE.map(([view, event]) => `${view}|${event}`));
    let checked = 0;
    for (const view of Object.keys(VIEWS)) {
      for (const event of Object.keys(EVENTS)) {
        if (listed.has(`${view}|${event}`)) continue;
        expect(pairingReducer(viewOf(view), eventOf(event)), `${view}|${event}`).toBe(viewOf(view));
        checked += 1;
      }
    }
    expect(checked).toBeGreaterThan(100);
  });

  it('every error has exactly one message', () => {
    expect(Object.keys(transfer.pairing.errors)).toEqual([...PAIRING_ERRORS]);
  });
});
