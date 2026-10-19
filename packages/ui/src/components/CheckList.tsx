import { type ReactElement, useId } from 'react';

export interface CheckListProps {
  /** The group's name, shown in the card-label style. */
  legend: string;
  options: readonly { readonly value: string; readonly label: string }[];
  /** The ticked values. */
  values: readonly string[];
  /** The new ticked values, in option order. */
  onChange: (values: string[]) => void;
  hint?: string | undefined;
}

/** Several choices from a list: checkbox rows at least 48 px high, the whole row a tap target. */
export function CheckList({
  legend,
  options,
  values,
  onChange,
  hint,
}: CheckListProps): ReactElement {
  const id = useId();
  const hintId = `${id}-hint`;
  const ticked = new Set(values);
  return (
    <fieldset className="ui-choices" aria-describedby={hint === undefined ? undefined : hintId}>
      <legend className="ui-choices__legend">{legend}</legend>
      {hint === undefined ? null : (
        <p id={hintId} className="ui-field__hint">
          {hint}
        </p>
      )}
      {options.map((option) => (
        <label key={option.value} className="ui-check">
          <input
            type="checkbox"
            className="ui-check__input"
            value={option.value}
            checked={ticked.has(option.value)}
            onChange={(event) => {
              const on = event.currentTarget.checked;
              onChange(
                options
                  .map((o) => o.value)
                  .filter((v) => (v === option.value ? on : ticked.has(v))),
              );
            }}
          />
          <span className="ui-check__mark" aria-hidden="true" />
          <span className="ui-check__label">{option.label}</span>
        </label>
      ))}
    </fieldset>
  );
}
