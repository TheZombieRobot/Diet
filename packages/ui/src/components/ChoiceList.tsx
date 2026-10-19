import { type KeyboardEvent, type ReactElement, type Ref, useId } from 'react';
import { classNames } from '../classNames';

export interface ChoiceOption {
  readonly value: string;
  readonly label: string;
  /** A second line under the label, such as "Eat 5:00 pm – 7:00 pm". */
  readonly detail?: string | undefined;
  /** A small tinted pill at the end of the row, such as "Kickstart". */
  readonly chip?: string | undefined;
}

export interface ChoiceListProps {
  /** The group's name, shown in the card-label style and read out with each option. */
  legend: string;
  /** The radio group's name attribute (unique on the page). */
  name: string;
  options: readonly ChoiceOption[];
  /** The chosen value; null means nothing is chosen yet. */
  value: string | null;
  onChange: (value: string) => void;
  hint?: string | undefined;
  /** Why the choice is not accepted; shown under the group and announced. */
  error?: string | undefined;
  /** The chosen radio, or the first one when none is chosen, for moving focus to the group. */
  firstInputRef?: Ref<HTMLInputElement> | undefined;
}

const NEXT_KEYS = new Set(['ArrowDown', 'ArrowRight']);
const PREVIOUS_KEYS = new Set(['ArrowUp', 'ArrowLeft']);

/**
 * One choice from a list (a radio group): each row is at least 58 px high, and the native radio
 * covers the whole row (the Switch pattern) so the row is the tap target while keyboards and
 * screen readers get a real radio. The chosen row has a teal border and a filled mark, so it is
 * not marked by colour alone. The arrow keys move the choice, as in any radio group.
 */
export function ChoiceList({
  legend,
  name,
  options,
  value,
  onChange,
  hint,
  error,
  firstInputRef,
}: ChoiceListProps): ReactElement {
  const id = useId();
  const hintId = `${id}-hint`;
  const errorId = `${id}-error`;
  const describedBy = [hint === undefined ? null : hintId, error === undefined ? null : errorId]
    .filter((x): x is string => x !== null)
    .join(' ');
  const chosenAt = options.findIndex((o) => o.value === value);
  const focusAt = chosenAt < 0 ? 0 : chosenAt;

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>, at: number) => {
    const step = NEXT_KEYS.has(event.key) ? 1 : PREVIOUS_KEYS.has(event.key) ? -1 : 0;
    if (step === 0 || options.length === 0) return;
    event.preventDefault();
    const target = (at + step + options.length) % options.length;
    const option = options[target];
    if (option === undefined) return;
    onChange(option.value);
    const group = event.currentTarget.closest('fieldset');
    group?.querySelectorAll<HTMLInputElement>('.ui-choice__input')[target]?.focus();
  };

  return (
    <fieldset
      className="ui-choices"
      role="radiogroup"
      aria-describedby={describedBy === '' ? undefined : describedBy}
      aria-invalid={error === undefined ? undefined : true}
    >
      <legend className="ui-choices__legend">{legend}</legend>
      {hint === undefined ? null : (
        <p id={hintId} className="ui-field__hint">
          {hint}
        </p>
      )}
      {options.map((option, at) => {
        const checked = option.value === value;
        return (
          <label
            key={option.value}
            className={classNames('ui-choice', checked && 'ui-choice--checked')}
          >
            <input
              ref={at === focusAt ? firstInputRef : undefined}
              type="radio"
              className="ui-choice__input"
              name={name}
              value={option.value}
              checked={checked}
              onChange={() => {
                onChange(option.value);
              }}
              onKeyDown={(event) => {
                onKeyDown(event, at);
              }}
            />
            <span className="ui-choice__mark" aria-hidden="true" />
            <span className="ui-choice__text">
              <span className="ui-choice__label">{option.label}</span>
              {option.detail === undefined ? null : (
                <>
                  {' '}
                  <span className="ui-choice__detail">{option.detail}</span>
                </>
              )}
            </span>
            {option.chip === undefined ? null : (
              <>
                {' '}
                <span className="ui-chip">{option.chip}</span>
              </>
            )}
          </label>
        );
      })}
      {error === undefined ? null : (
        <p id={errorId} className="ui-field__error" role="alert">
          {error}
        </p>
      )}
    </fieldset>
  );
}
