import { type RefObject, useEffect, useRef } from 'react';
import type { QrDecoder } from './qrDecoders';

/** About five frames a second, to spare the battery (item 30 design 1.5). */
export const SCAN_INTERVAL_MS = 200;

/**
 * The decode loop: while `active`, reads the video's current frame at most once every
 * SCAN_INTERVAL_MS, never more than one read at a time, and hands every text found to `onTexts`.
 * It stops when `active` turns false or on unmount, and never calls `onTexts` after that.
 */
export function useQrScan(
  videoRef: RefObject<HTMLVideoElement | null>,
  decoder: QrDecoder | null,
  active: boolean,
  onTexts: (texts: readonly string[]) => void,
): void {
  const latest = useRef(onTexts);
  useEffect(() => {
    latest.current = onTexts;
  });

  useEffect(() => {
    if (!active || decoder === null) return;
    let stopped = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const read = async (): Promise<void> => {
      const video = videoRef.current;
      const texts = video === null ? [] : await decoder.detect(video);
      if (stopped) return;
      if (texts.length > 0) latest.current(texts);
      timer = setTimeout(() => void read(), SCAN_INTERVAL_MS);
    };
    timer = setTimeout(() => void read(), SCAN_INTERVAL_MS);
    return () => {
      stopped = true;
      clearTimeout(timer);
    };
  }, [videoRef, decoder, active]);
}
