import type { ReactElement, Ref } from 'react';

export interface CameraViewProps {
  /** The video element the camera stream is attached to (srcObject). */
  videoRef: Ref<HTMLVideoElement>;
  /** True once the stream is showing; the guide square is drawn only then. */
  active: boolean;
}

/**
 * A square camera view with a guide square, for scanning the laptop's pairing code (checklist item
 * 30). The video is hidden from screen readers: everything a person needs is in the status line
 * the screen shows under it.
 */
export function CameraView({ videoRef, active }: CameraViewProps): ReactElement {
  return (
    <div className="ui-camera" data-active={active ? 'true' : 'false'}>
      <video
        ref={videoRef}
        className="ui-camera__video"
        muted
        playsInline
        autoPlay
        aria-hidden="true"
      />
      <div className="ui-camera__guide" aria-hidden="true" />
    </div>
  );
}
