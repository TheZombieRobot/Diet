import type { ReactElement, Ref } from 'react';

/**
 * Something under way, said in full-contrast text and announced politely (ux review): "Locking the
 * file… this takes a few seconds." It is not left to the label of a disabled button. Given a ref,
 * the line can take focus (the Laptop pairing screen's saving and removing lines, item 30).
 */
export function Progress({
  text,
  ref,
}: {
  readonly text: string;
  readonly ref?: Ref<HTMLParagraphElement> | undefined;
}): ReactElement {
  return ref === undefined ? (
    <p className="ui-progress" role="status">
      <span className="ui-spinner" aria-hidden="true" />
      {text}
    </p>
  ) : (
    <p ref={ref} className="ui-progress ui-step-start" role="status" tabIndex={-1}>
      <span className="ui-spinner" aria-hidden="true" />
      {text}
    </p>
  );
}
