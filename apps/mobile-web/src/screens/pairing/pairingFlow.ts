/**
 * The Laptop pairing screen's steps (checklist item 30 design 1.4.2): a pure reducer with no clock,
 * camera or storage. The camera, the decoder and the saves are the components' effects. The
 * decoded code itself never enters this state: a 'decoded' event carries only its outcome, and the
 * code waits in a ref until it is saved.
 */

export const PAIRING_ERRORS = Object.freeze([
  'camera-denied',
  'camera-unavailable',
  'no-reader',
  'newer-version',
  'damaged',
  'save-failed',
  'storage-full',
  'unpair-failed',
] as const);
export type PairingError = (typeof PAIRING_ERRORS)[number];

export type PairingNotice =
  'paired-now' | 'unpaired-now' | 'stopped-timeout' | 'stopped-hidden' | PairingError;

/** Where focus goes back to when an action is cancelled (design 1.4.5). */
export type ReturnFocus = 'scan' | 'pair-again' | 'unpair' | null;

export type PairingView =
  | { readonly step: 'idle'; readonly notice: PairingNotice | null; readonly returnTo: ReturnFocus }
  | { readonly step: 'confirm-pair-again' }
  | { readonly step: 'confirm-unpair' }
  | { readonly step: 'unpairing' }
  | { readonly step: 'starting' }
  | { readonly step: 'scanning'; readonly sawOtherCode: boolean }
  | { readonly step: 'saving' };

export type PairingEvent =
  | { readonly type: 'scan' }
  | { readonly type: 'ask-pair-again' }
  | { readonly type: 'ask-unpair' }
  | { readonly type: 'cancel' }
  | { readonly type: 'confirm-unpair' }
  | { readonly type: 'camera-ready' }
  | {
      readonly type: 'camera-failed';
      readonly error: 'camera-denied' | 'camera-unavailable' | 'no-reader';
    }
  | {
      readonly type: 'decoded';
      readonly outcome: 'ok' | 'not-pairing-code' | 'newer-version' | 'damaged';
    }
  | { readonly type: 'timeout' }
  | { readonly type: 'hidden' }
  | { readonly type: 'saved' }
  | {
      readonly type: 'save-failed';
      readonly reason: 'save-failed' | 'storage-full' | 'records-closed';
    }
  | { readonly type: 'unpaired' }
  | { readonly type: 'unpair-failed'; readonly recordsClosed: boolean }
  | { readonly type: 'records-closed' };

export const INITIAL_PAIRING_VIEW: PairingView = Object.freeze({
  step: 'idle',
  notice: null,
  returnTo: null,
});

const idle = (notice: PairingNotice | null, returnTo: ReturnFocus = null): PairingView => ({
  step: 'idle',
  notice,
  returnTo,
});

const cameraOn = (view: PairingView): boolean =>
  view.step === 'starting' || view.step === 'scanning';

/** The next view; any (step, event) pair not in the design's table returns the same object. */
export function pairingReducer(view: PairingView, event: PairingEvent): PairingView {
  switch (event.type) {
    case 'scan':
      return view.step === 'idle' || view.step === 'confirm-pair-again'
        ? { step: 'starting' }
        : view;
    case 'ask-pair-again':
      return view.step === 'idle' ? { step: 'confirm-pair-again' } : view;
    case 'ask-unpair':
      return view.step === 'idle' ? { step: 'confirm-unpair' } : view;
    case 'cancel':
      if (cameraOn(view)) return idle(null, 'scan');
      if (view.step === 'confirm-pair-again') return idle(null, 'pair-again');
      if (view.step === 'confirm-unpair') return idle(null, 'unpair');
      return view;
    case 'camera-ready':
      return view.step === 'starting' ? { step: 'scanning', sawOtherCode: false } : view;
    case 'camera-failed':
      return cameraOn(view) ? idle(event.error) : view;
    case 'decoded':
      if (view.step !== 'scanning') return view;
      if (event.outcome === 'ok') return { step: 'saving' };
      if (event.outcome === 'not-pairing-code') {
        return view.sawOtherCode ? view : { step: 'scanning', sawOtherCode: true };
      }
      return idle(event.outcome);
    case 'timeout':
      return cameraOn(view) ? idle('stopped-timeout') : view;
    case 'hidden':
      return cameraOn(view) ? idle('stopped-hidden') : view;
    case 'saved':
      return view.step === 'saving' ? idle('paired-now') : view;
    case 'save-failed':
      if (view.step !== 'saving') return view;
      return idle(event.reason === 'records-closed' ? null : event.reason);
    case 'confirm-unpair':
      return view.step === 'confirm-unpair' ? { step: 'unpairing' } : view;
    case 'unpaired':
      return view.step === 'unpairing' ? idle('unpaired-now') : view;
    case 'unpair-failed':
      if (view.step !== 'unpairing') return view;
      return idle(event.recordsClosed ? null : 'unpair-failed');
    case 'records-closed':
      return view.step === 'idle' && view.notice === null ? view : idle(null);
  }
}
