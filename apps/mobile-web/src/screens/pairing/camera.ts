/**
 * Starting and stopping the camera for the Laptop pairing screen (checklist item 30 design 1.5;
 * HS-38). The rear camera, about 1280×720, never audio. The stream is attached to the video
 * with srcObject, so no address is fetched and the Content Security Policy does not change.
 */

export const CAMERA_CONSTRAINTS = Object.freeze({
  audio: false,
  video: Object.freeze({
    facingMode: Object.freeze({ ideal: 'environment' }),
    width: Object.freeze({ ideal: 1280 }),
    height: Object.freeze({ ideal: 720 }),
  }),
}) satisfies MediaStreamConstraints;

export type CameraFailure = 'camera-denied' | 'camera-unavailable';

export type CameraStart =
  | { readonly ok: true; readonly stream: MediaStream }
  | { readonly ok: false; readonly reason: CameraFailure };

/**
 * Not allowed (by the site setting, or Chrome itself lacking Android's camera permission) is
 * 'camera-denied'; anything else (no camera, in use elsewhere, a constraint it cannot meet) is
 * 'camera-unavailable'.
 */
export function cameraErrorKind(error: unknown): CameraFailure {
  const name =
    typeof error === 'object' && error !== null ? (error as { name?: unknown }).name : undefined;
  return name === 'NotAllowedError' || name === 'SecurityError'
    ? 'camera-denied'
    : 'camera-unavailable';
}

/** Ends every track. Safe to call twice and with null. */
export function stopStream(stream: MediaStream | null): void {
  if (stream === null) return;
  for (const track of stream.getTracks()) track.stop();
}

/** Asks for the camera and shows it in `video`; a stream that cannot play is stopped at once. */
export async function startCamera(
  video: HTMLVideoElement,
  media: Pick<MediaDevices, 'getUserMedia'> | undefined,
): Promise<CameraStart> {
  if (media === undefined) return { ok: false, reason: 'camera-unavailable' };
  let stream: MediaStream;
  try {
    stream = await media.getUserMedia(CAMERA_CONSTRAINTS);
  } catch (error) {
    return { ok: false, reason: cameraErrorKind(error) };
  }
  video.muted = true;
  video.playsInline = true;
  video.srcObject = stream;
  try {
    await video.play();
  } catch {
    stopStream(stream);
    video.srcObject = null;
    return { ok: false, reason: 'camera-unavailable' };
  }
  return { ok: true, stream };
}
