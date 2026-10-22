import type { ReactElement } from 'react';

export interface CheckboxProps {
  /** The text beside the box, which also names it for screen readers. */
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean | undefined;
}

/**
 * One tick box in a row at least 48 px high, the whole row a tap target (CheckList's row). For a
 * statement the person ticks, where a Switch would read as a setting.
 */
export function Checkbox({
  label,
  checked,
  onChange,
  disabled = false,
}: CheckboxProps): ReactElement {
  return (
    <label className="ui-check">
      <input
        type="checkbox"
        className="ui-check__input"
        checked={checked}
        disabled={disabled}
        onChange={(event) => {
          onChange(event.currentTarget.checked);
        }}
      />
      <span className="ui-check__mark" aria-hidden="true" />
      <span className="ui-check__label">{label}</span>
    </label>
  );
}
