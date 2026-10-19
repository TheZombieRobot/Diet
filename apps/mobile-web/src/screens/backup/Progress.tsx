import type { ReactElement } from 'react';

/**
 * Something under way, said in full-contrast text and announced politely (ux review): "Locking the
 * file… this takes a few seconds." It is not left to the label of a disabled button.
 */
export function Progress({ text }: { readonly text: string }): ReactElement {
  return (
    <p className="ui-progress" role="status">
      <span className="ui-spinner" aria-hidden="true" />
      {text}
    </p>
  );
}
