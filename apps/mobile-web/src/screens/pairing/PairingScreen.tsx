import { fillTemplate } from '@diet/core';
import { privacy, transfer } from '@diet/core/copy/health';
import { type PairingCode, pairingRelayStatus } from '@diet/grocery/transfer';
import { Button, ButtonRow, Card, Notice } from '@diet/ui';
import {
  type Dispatch,
  type ReactElement,
  useCallback,
  useEffect,
  useReducer,
  useRef,
} from 'react';
import { StorageClosedError } from '../../db/errors';
import { appStorageStore } from '../../db/runtime';
import { formatLocalDate } from '../../format';
import { useStore } from '../../store';
import { recordsBusyStore, useGateOpen, useStepFocus } from '../backup/focus';
import { Progress } from '../backup/Progress';
import { pairingDevicesStore } from './devices';
import {
  INITIAL_PAIRING_VIEW,
  type PairingEvent,
  type PairingNotice,
  pairingReducer,
  type ReturnFocus,
} from './pairingFlow';
import { savePairingFromCode } from './savePairing';
import { ScanCard } from './ScanCard';
import { usePairing, usePairingCheck } from './usePairing';

const copy = transfer.pairing;

type FocusTarget = (element: HTMLElement | null) => void;

/** The notice above the cards after an action (design 1.4.3). */
function NoticeSlot({
  notice,
  dispatch,
  focusTarget,
}: {
  readonly notice: Exclude<PairingNotice, 'paired-now'>;
  readonly dispatch: Dispatch<PairingEvent>;
  readonly focusTarget: FocusTarget;
}): ReactElement {
  const devices = useStore(pairingDevicesStore);
  const start = useRef<HTMLParagraphElement | null>(null);
  const startRef = useCallback(
    (element: HTMLParagraphElement | null) => {
      start.current = element;
      focusTarget(element);
    },
    [focusTarget],
  );
  // A notice is read from its first line: at 200% text it can be taller than the screen, and focus
  // alone could leave that line under the top bar (ux review). Its focus does not scroll.
  useEffect(() => {
    const element = start.current;
    if (typeof element?.scrollIntoView === 'function') element.scrollIntoView({ block: 'start' });
  }, [notice]);
  const first = (text: string) => (
    <p className="ui-step-start" tabIndex={-1} ref={startRef}>
      {text}
    </p>
  );
  const scanAgain = (
    <Button
      variant="secondary"
      onClick={() => {
        dispatch({ type: 'scan' });
      }}
    >
      {copy.scanAgain}
    </Button>
  );
  switch (notice) {
    case 'unpaired-now':
      return (
        <Notice tone="info" role="status">
          {first(copy.unpairedNow)}
        </Notice>
      );
    case 'stopped-timeout':
    case 'stopped-hidden':
      return (
        <Notice role="status">
          {first(notice === 'stopped-timeout' ? copy.stoppedTimeout : copy.stoppedHidden)}
          {scanAgain}
        </Notice>
      );
    case 'no-reader':
    case 'newer-version':
      return (
        <Notice role="alert">
          {first(copy.errors[notice])}
          <Button variant="primary" onClick={devices.reload}>
            {privacy.backupCard.reload}
          </Button>
        </Notice>
      );
    case 'unpair-failed':
      return (
        <Notice role="alert">
          {first(copy.errors['unpair-failed'])}
          <Button
            variant="secondary"
            onClick={() => {
              dispatch({ type: 'ask-unpair' });
            }}
          >
            {copy.tryAgain}
          </Button>
        </Notice>
      );
    case 'camera-denied':
      return (
        <Notice role="alert">
          {first(fillTemplate(copy.errors['camera-denied'], { site: devices.siteName() }))}
          {scanAgain}
        </Notice>
      );
    default:
      return (
        <Notice role="alert">
          {first(copy.errors[notice])}
          {scanAgain}
        </Notice>
      );
  }
}

/**
 * Settings, Laptop pairing (checklist item 30; UX_SCREENS 6c; DECISIONS Q1; C83, C115;
 * HS-(next)). The camera starts only on a tap, the key never appears on screen and there is no way
 * to type it; the pairing is stored with a key the app cannot read back, on this phone only.
 * Unpair forgets it here and sends nothing. Nothing on this screen makes a network request.
 */
export function PairingScreen(): ReactElement {
  const storage = useStore(appStorageStore);
  const gateOpen = useGateOpen(storage?.gate ?? null);
  const busy = useStore(recordsBusyStore);
  const devices = useStore(pairingDevicesStore);
  const pairing = usePairing();
  const check = usePairingCheck(pairing?.roomId ?? null);
  const [view, dispatch] = useReducer(pairingReducer, INITIAL_PAIRING_VIEW);
  const closed = storage !== null && !gateOpen;
  const paired = pairing !== undefined && pairing !== null;

  // The records closed (a restore or delete-all, here or in another tab): any camera stops.
  useEffect(() => {
    if (closed) dispatch({ type: 'records-closed' });
  }, [closed]);

  const alive = useRef(false);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  useEffect(() => {
    if (view.step !== 'unpairing' || storage === null) return;
    let cancelled = false;
    storage.repos.pairing.remove().then(
      () => {
        if (!cancelled) dispatch({ type: 'unpaired' });
      },
      (error: unknown) => {
        if (!cancelled) {
          dispatch({ type: 'unpair-failed', recordsClosed: error instanceof StorageClosedError });
        }
      },
    );
    return () => {
      cancelled = true;
    };
  }, [view.step, storage]);

  const notice = view.step === 'idle' ? view.notice : null;
  const returnTo = view.step === 'idle' ? view.returnTo : null;
  // These steps scroll themselves, so focus does not: the camera card keeps its view in sight, and
  // a notice shows its first line.
  const focusRef = useStepFocus<HTMLElement>(
    `${view.step}:${notice ?? ''}:${returnTo ?? ''}:${String(paired)}:${String(closed)}`,
    view.step === 'starting' ||
      view.step === 'scanning' ||
      (notice !== null && notice !== 'paired-now' && !closed),
  );
  const focusTarget = useCallback<FocusTarget>(
    (element) => {
      focusRef.current = element;
    },
    [focusRef],
  );
  /** The focus target when focus returns to one of `names` (design 1.4.5). */
  const returnFocus = (...names: NonNullable<ReturnFocus>[]): FocusTarget | undefined =>
    notice === null && returnTo !== null && names.includes(returnTo) ? focusTarget : undefined;
  // Saving starts as soon as a code is read (the camera has already stopped), not from an effect,
  // so it runs once even where effects run twice. The raw key bytes are zeroed in every case.
  const onCode = useCallback(
    (code: PairingCode) => {
      if (storage === null) {
        code.keyBytes.fill(0);
        return;
      }
      void savePairingFromCode(storage.repos.pairing, code).then((result) => {
        if (!alive.current) return;
        dispatch(result === 'saved' ? { type: 'saved' } : { type: 'save-failed', reason: result });
      });
    },
    [storage],
  );

  if (storage === null || (!closed && pairing === undefined)) {
    return (
      <Card label={copy.pairedCardLabel}>
        <p>{privacy.backupCard.notReady}</p>
      </Card>
    );
  }

  if (closed) {
    return (
      <Card label={copy.pairedCardLabel}>
        <Notice role="status">
          <p className="ui-step-start" tabIndex={-1} ref={focusTarget}>
            {privacy.backupCard.closed}
          </p>
          {busy ? null : (
            <Button variant="primary" onClick={storage.platform.reload}>
              {privacy.backupCard.reload}
            </Button>
          )}
        </Notice>
      </Card>
    );
  }

  if (view.step === 'starting' || view.step === 'scanning' || view.step === 'saving') {
    return <ScanCard view={view} dispatch={dispatch} onCode={onCode} focusTarget={focusTarget} />;
  }

  if (view.step === 'confirm-pair-again') {
    return (
      <Card label={copy.pairedCardLabel}>
        <p className="ui-text-strong ui-step-start" tabIndex={-1} ref={focusTarget}>
          {copy.pairAgainTitle}
        </p>
        <p>{copy.pairAgainBody}</p>
        <ButtonRow>
          <Button
            variant="secondary"
            onClick={() => {
              dispatch({ type: 'cancel' });
            }}
          >
            {copy.cancel}
          </Button>
          <Button
            variant="primary"
            onClick={() => {
              dispatch({ type: 'scan' });
            }}
          >
            {copy.pairAgainConfirm}
          </Button>
        </ButtonRow>
      </Card>
    );
  }

  if (view.step === 'confirm-unpair' || view.step === 'unpairing') {
    const unpairing = view.step === 'unpairing';
    return (
      <Card label={copy.pairedCardLabel}>
        <p
          className="ui-text-strong ui-step-start"
          tabIndex={-1}
          ref={unpairing ? undefined : focusTarget}
        >
          {copy.unpairTitle}
        </p>
        <p>{copy.unpairBody}</p>
        <p>{transfer.unpairOther}</p>
        <ButtonRow>
          <Button
            variant="primary"
            disabled={unpairing}
            onClick={() => {
              dispatch({ type: 'cancel' });
            }}
          >
            {copy.cancel}
          </Button>
          <Button
            variant="caution"
            disabled={unpairing}
            onClick={() => {
              dispatch({ type: 'confirm-unpair' });
            }}
          >
            {copy.unpair}
          </Button>
        </ButtonRow>
        {unpairing ? <Progress text={copy.unpairing} ref={focusTarget} /> : null}
      </Card>
    );
  }

  return (
    <>
      {notice === null ? null : notice === 'paired-now' ? (
        <Notice tone="info" role="status">
          <p>{copy.pairedNow}</p>
        </Notice>
      ) : (
        <NoticeSlot notice={notice} dispatch={dispatch} focusTarget={focusTarget} />
      )}
      {pairing === null || pairing === undefined ? (
        <Card label={copy.unpairedCardLabel}>
          <p>{copy.intro}</p>
          <ol className="ui-plain-list ui-plain-list--numbered">
            {copy.steps.map((step) => (
              <li key={step}>{step}</li>
            ))}
          </ol>
          <p className="ui-text-muted">{copy.laptopLaterStep}</p>
          <Notice>
            <p>{copy.codeRisk}</p>
            <p>{copy.scanOnlyHere}</p>
          </Notice>
          <p className="ui-text-muted">{copy.cameraNote}</p>
          <Button
            variant="primary"
            block
            ref={returnFocus('scan')}
            onClick={() => {
              dispatch({ type: 'scan' });
            }}
          >
            {copy.scan}
          </Button>
          <p className="ui-text-muted">{copy.optional}</p>
        </Card>
      ) : (
        <Card label={copy.pairedCardLabel}>
          <p
            className="ui-text-lead"
            tabIndex={-1}
            ref={notice === 'paired-now' ? focusTarget : undefined}
          >
            {copy.paired}
          </p>
          <p>
            {fillTemplate(copy.pairedOn, {
              date: formatLocalDate(pairing.pairedAt, storage.env.timeZone()),
            })}
          </p>
          {check === null ? null : <p>{fillTemplate(copy.check, { check })}</p>}
          <p className="ui-text-muted">{copy.checkHint}</p>
          {pairingRelayStatus(pairing.relayUrl, devices.relayOrigin()) === 'pair-again' ? (
            <p>{copy.relayPairAgain}</p>
          ) : null}
          <p className="ui-text-muted">{copy.laterStep}</p>
          <p className="ui-text-muted">{copy.photographed}</p>
          <ButtonRow>
            <Button
              variant="secondary"
              ref={returnFocus('pair-again', 'scan')}
              onClick={() => {
                dispatch({ type: 'ask-pair-again' });
              }}
            >
              {copy.pairAgain}
            </Button>
            <Button
              variant="caution"
              ref={returnFocus('unpair')}
              onClick={() => {
                dispatch({ type: 'ask-unpair' });
              }}
            >
              {copy.unpair}
            </Button>
          </ButtonRow>
        </Card>
      )}
    </>
  );
}
