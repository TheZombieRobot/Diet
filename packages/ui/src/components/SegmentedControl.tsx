import { type ReactElement, useId } from 'react';
import { classNames } from '../classNames';

export interface SegmentedControlProps<T extends string> {
  /** The group's name, shown above the segments and read out with each one. */
  legend: string;
  options: readonly { readonly value: T; readonly label: string }[];
  /** The chosen value; null means nothing is chosen yet. */
  value: T | null;
  onChange: (value: T) => void;
  disabled?: boolean | undefined;
}

/**
 * Two or three short choices side by side (Now / Earlier, kcal / kJ): native radios in a fieldset,
 * drawn as joined segments, each at least 48 px high. The chosen segment is filled and bold, so it
 * is not marked by colour alone; the arrow keys move the choice, as in any radio group. Longer
 * choices use ChoiceList.
 */
export function SegmentedControl<T extends string>({
  legend,
  options,
  value,
  onChange,
  disabled = false,
}: SegmentedControlProps<T>): ReactElement {
  const name = useId();
  return (
    <fieldset className="ui-segmented" disabled={disabled}>
      <legend className="ui-segmented__legend">{legend}</legend>
      <div className="ui-segmented__row">
        {options.map((option) => {
          const checked = option.value === value;
          return (
            <label
              key={option.value}
              className={classNames(
                'ui-segmented__option',
                checked && 'ui-segmented__option--checked',
              )}
            >
              <input
                type="radio"
                className="ui-segmented__input"
                name={name}
                value={option.value}
                checked={checked}
                onChange={() => {
                  onChange(option.value);
                }}
              />
              <span className="ui-segmented__label">{option.label}</span>
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}
