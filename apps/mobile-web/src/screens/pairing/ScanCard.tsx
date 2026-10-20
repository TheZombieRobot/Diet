import { transfer } from '@diet/core/copy/health';
import { type PairingCode, type PairingCodeResult, parsePairingCode } from '@diet/grocery/transfer';
import { Button, CameraView, Card } from '@diet/ui';
import { type Dispatch, type ReactElement, useEffect, useRef, useState } from 'react';
import { useStore } from '../../store';
import { Progress } from '../backup/Progress';
import { startCamera, stopStream } from './camera';
import { pairingDevicesStore } from './devices';
import type { PairingEvent, PairingView } from './pairingFlow';
import type { QrDecoder } from './qrDecoders';
import { useQrScan } from './useQrScan';

/** Scanning stops after 2 minutes without a code, to save the battery (P14). */
export const SCAN_TIMEOUT_MS = 120_000;

type FailedCode = Extract<PairingCodeResult, { ok: false }>;
/** When a frame holds several codes and none is a pairing code, the one that says the most wins. */
const WORST: readonly FailedCode['reason'][] = ['newer-version', 'damaged', 'not-pairing-code'];

/** The first pairing code among the texts, or the worst refusal. */
function bestOf(texts: readonly string[]): PairingCodeResult | null {
  let worst: FailedCode | null = null;
  for (const text of texts) {
    const result = parsePairingCode(text);
    if (result.ok) return result;
    if (worst === null || WORST.indexOf(result.reason) < WORST.indexOf(worst.reason))
      worst = result;
  }
  return worst;
}

export interface ScanCardProps {
  readonly view: Extract<PairingView, { step: 'starting' | 'scanning' | 'saving' }>;
  readonly dispatch: Dispatch<PairingEvent>;
  /** Saves a read code (the camera has stopped by then). The code never enters React state. */
  readonly onCode: (code: PairingCode) => void;
  /** The focus target of the screen's current step (design 1.4.5). */
  readonly focusTarget: (element: HTMLElement | null) => void;
}

/**
 * The camera card of the Laptop pairing screen (item 30 design 1.4.4; HS-(next)). The camera runs
 * only while the step is starting or scanning, and one effect, keyed on that alone, starts and
 * stops it: on a code, Cancel, an error, the track ending, 2 minutes, the app going to the
 * background, the records closing, leaving the screen and unmounting. Every stop ends every track,
 * detaches the video and releases the reader, so no frame is kept.
 */
export function ScanCard({ view, dispatch, onCode, focusTarget }: ScanCardProps): ReactElement {
  const copy = transfer.pairing;
  const devices = useStore(pairingDevicesStore);
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [decoder, setDecoder] = useState<QrDecoder | null>(null);
  const cameraWanted = view.step === 'starting' || view.step === 'scanning';

  useEffect(() => {
    if (!cameraWanted) return;
    const video = videoRef.current;
    let cancelled = false;
    let stream: MediaStream | null = null;
    let reader: QrDecoder | null = null;
    let track: MediaStreamTrack | undefined;
    const onEnded = (): void => {
      if (!cancelled) dispatch({ type: 'camera-failed', error: 'camera-unavailable' });
    };
    const onVisibility = (): void => {
      if (document.visibilityState === 'hidden') dispatch({ type: 'hidden' });
    };
    const timer = setTimeout(() => {
      dispatch({ type: 'timeout' });
    }, SCAN_TIMEOUT_MS);
    document.addEventListener('visibilitychange', onVisibility);

    // Read through a function: the cleanup can set it during either await.
    const isCancelled = (): boolean => cancelled;
    const start = async (): Promise<void> => {
      reader = await devices.createDecoder();
      if (isCancelled()) {
        reader?.release();
        return;
      }
      if (reader === null || video === null) {
        dispatch({ type: 'camera-failed', error: 'no-reader' });
        return;
      }
      const started = await startCamera(video, devices.media());
      if (isCancelled()) {
        if (started.ok) stopStream(started.stream);
        video.srcObject = null;
        return;
      }
      if (!started.ok) {
        dispatch({ type: 'camera-failed', error: started.reason });
        return;
      }
      stream = started.stream;
      streamRef.current = stream;
      track = stream.getVideoTracks()[0];
      track?.addEventListener('ended', onEnded);
      setDecoder(reader);
      dispatch({ type: 'camera-ready' });
    };
    void start();

    return () => {
      cancelled = true;
      clearTimeout(timer);
      document.removeEventListener('visibilitychange', onVisibility);
      track?.removeEventListener('ended', onEnded);
      stopStream(stream);
      streamRef.current = null;
      if (video !== null) video.srcObject = null;
      reader?.release();
    };
  }, [cameraWanted, devices, dispatch]);

  useQrScan(videoRef, decoder, view.step === 'scanning', (texts) => {
    const result = bestOf(texts);
    if (result === null) return;
    if (!result.ok) {
      dispatch({ type: 'decoded', outcome: result.reason });
      return;
    }
    // The camera stops before anything else happens with the code.
    stopStream(streamRef.current);
    onCode(result.code);
    dispatch({ type: 'decoded', outcome: 'ok' });
  });

  return (
    <Card label={copy.cameraCardLabel}>
      <CameraView videoRef={videoRef} active={view.step === 'scanning'} />
      {view.step === 'starting' ? (
        <Progress text={copy.starting} />
      ) : view.step === 'scanning' ? (
        <p role="status">{view.sawOtherCode ? copy.notAPairingCode : copy.looking}</p>
      ) : (
        <Progress text={copy.saving} ref={focusTarget} />
      )}
      {view.step === 'saving' ? null : (
        <Button
          variant="secondary"
          block
          ref={focusTarget}
          onClick={() => {
            dispatch({ type: 'cancel' });
          }}
        >
          {copy.cancel}
        </Button>
      )}
    </Card>
  );
}
