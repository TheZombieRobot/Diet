// The camera (item 30 design 1.5; A5; TR-03a, HS-38).
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CAMERA_CONSTRAINTS, cameraErrorKind, startCamera, stopStream } from './camera';
import { fakeStream } from './pairingTestKit';

afterEach(() => {
  vi.restoreAllMocks();
});

const named = (name: string) => Object.assign(new Error('example'), { name });

describe('the camera', () => {
  it('asks for exactly the rear camera, without audio, and shows it in the video', async () => {
    vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue(undefined);
    const { stream } = fakeStream();
    const getUserMedia = vi.fn(() => Promise.resolve(stream));
    const video = document.createElement('video');
    expect(await startCamera(video, { getUserMedia })).toEqual({ ok: true, stream });
    expect(getUserMedia).toHaveBeenCalledWith(CAMERA_CONSTRAINTS);
    expect(CAMERA_CONSTRAINTS.audio).toBe(false);
    expect(video.srcObject).toBe(stream);
    expect(video.muted).toBe(true);
  });

  it.each([
    ['NotAllowedError', 'camera-denied'],
    ['SecurityError', 'camera-denied'],
    ['NotFoundError', 'camera-unavailable'],
    ['NotReadableError', 'camera-unavailable'],
    ['OverconstrainedError', 'camera-unavailable'],
    ['AbortError', 'camera-unavailable'],
    ['TypeError', 'camera-unavailable'],
  ])('%s is %s', (name, kind) => {
    expect(cameraErrorKind(named(name))).toBe(kind);
  });

  it('a string thrown, or no camera API at all, is unavailable', async () => {
    expect(cameraErrorKind('example')).toBe('camera-unavailable');
    const video = document.createElement('video');
    expect(await startCamera(video, undefined)).toEqual({
      ok: false,
      reason: 'camera-unavailable',
    });
  });

  it('a stream that cannot play is stopped and detached at once', async () => {
    vi.spyOn(HTMLMediaElement.prototype, 'play').mockRejectedValue(named('NotAllowedError'));
    const { stream, track } = fakeStream();
    const video = document.createElement('video');
    const result = await startCamera(video, { getUserMedia: () => Promise.resolve(stream) });
    expect(result).toEqual({ ok: false, reason: 'camera-unavailable' });
    expect(track.stop).toHaveBeenCalled();
    expect(video.srcObject).toBeNull();
  });

  it('stopStream ends every track, and takes null and a second call', () => {
    const { stream, track } = fakeStream();
    stopStream(stream);
    stopStream(stream);
    stopStream(null);
    expect(track.readyState).toBe('ended');
  });
});
