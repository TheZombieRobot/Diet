import { type ReactElement, useId } from 'react';

export interface CodeBoxProps {
  /** The visible label, which also names the box for screen readers. */
  label: string;
  value: string;
}

/**
 * A long code to copy (item 31's paste code): a labelled read-only text box that breaks anywhere,
 * scrolls inside itself and selects everything on focus. The wording scans skip it
 * (data-scan-exclude): a random code can hold any run of letters.
 */
export function CodeBox({ label, value }: CodeBoxProps): ReactElement {
  const id = useId();
  return (
    <div className="ui-field">
      <label className="ui-field__label" htmlFor={id}>
        {label}
      </label>
      <textarea
        id={id}
        className="ui-code"
        readOnly
        rows={8}
        value={value}
        spellCheck={false}
        autoCapitalize="off"
        autoCorrect="off"
        data-scan-exclude=""
        onFocus={(event) => {
          event.currentTarget.select();
        }}
      />
    </div>
  );
}
