import type { ReactElement } from 'react';
import { CloseIcon } from '../icons';
import { IconButton } from './IconButton';

export interface TagListProps {
  items: readonly { readonly key: string; readonly label: string; readonly removeLabel: string }[];
  onRemove: (key: string) => void;
}

/** Short entries as chips, each with a 48 px remove button named for it ("Remove liver"). */
export function TagList({ items, onRemove }: TagListProps): ReactElement {
  return (
    <ul className="ui-tags">
      {items.map((item) => (
        <li key={item.key} className="ui-tag">
          <span className="ui-tag__label">{item.label}</span>
          <IconButton
            label={item.removeLabel}
            icon={<CloseIcon size={18} />}
            onClick={() => {
              onRemove(item.key);
            }}
          />
        </li>
      ))}
    </ul>
  );
}
