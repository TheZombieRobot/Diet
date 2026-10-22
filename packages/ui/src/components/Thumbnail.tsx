import { type ReactElement, useState } from 'react';
import { classNames } from '../classNames';
import { LeafIcon } from '../icons';

export interface ThumbnailProps {
  /** An object URL of the stored photo, or null for none. */
  src: string | null;
  /** The image text: empty for a decorative thumbnail beside a row's own name. */
  alt: string;
  /** row: 56 px in a list; large: 160 px in an open panel. */
  size: 'row' | 'large';
}

/**
 * A rounded square photo (object-fit: cover, outlined), or the garden leaf on teal tint when there
 * is no photo or it fails to display (item 19). The leaf is decorative.
 */
export function Thumbnail({ src, alt, size }: ThumbnailProps): ReactElement {
  // The source that failed, so a new photo is tried again.
  const [failed, setFailed] = useState<string | null>(null);
  const showPhoto = src !== null && failed !== src;
  return (
    <span className={classNames('ui-thumb', size === 'large' && 'ui-thumb--large')}>
      {showPhoto ? (
        <img
          className="ui-thumb__image"
          src={src}
          alt={alt}
          decoding="async"
          loading="lazy"
          onError={() => {
            setFailed(src);
          }}
        />
      ) : (
        <span className="ui-thumb__placeholder" aria-hidden="true">
          <LeafIcon size={size === 'large' ? 48 : 24} />
        </span>
      )}
    </span>
  );
}
