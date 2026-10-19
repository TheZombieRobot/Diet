/** Profile form messages and focus (item 13 design sections 3.8 and 5.5). */
import { fillTemplate, type ProfileFieldId, type ProfileProblem } from '@diet/core';
import { profile } from '@diet/core/copy/health';

function rangeText(field: ProfileFieldId, thisYear: number): string {
  const { errors } = profile;
  switch (field) {
    case 'heightCm':
      return errors.heightRange;
    case 'weightKg':
      return errors.weightRange;
    case 'birthYear':
      return fillTemplate(errors.birthYearRange, { year: thisYear });
    case 'goalKg':
      return errors.goalRange;
    default:
      return errors.householdRange;
  }
}

/** The message for a field's problem. */
export function profileProblemText(
  field: ProfileFieldId,
  problem: ProfileProblem,
  thisYear: number,
): string {
  const { errors } = profile;
  switch (problem) {
    case 'required':
      return field === 'sex' ? errors.sexRequired : errors.required;
    case 'not-a-number':
      return errors.notANumber;
    case 'one-decimal':
      return errors.oneDecimal;
    case 'future-year':
      return fillTemplate(errors.birthYearRange, { year: thisYear });
    case 'range':
      return rangeText(field, thisYear);
    case 'goal-needs-height':
      return errors.goalNeedsHeight;
    case 'goal-needs-weight':
      return errors.goalNeedsWeight;
    case 'goal-not-below-weight':
      return errors.goalNotBelow;
    case 'goal-below-bmi-floor':
      return errors.goalBelowFloor;
  }
}

/**
 * Moves focus to the first field with a problem, in form order (section 3.8, On Continue): a text
 * field, or the chosen (or first) radio of a group.
 */
export function focusFirstInvalid(form: HTMLFormElement | null): void {
  const target = form?.querySelector<HTMLElement>(
    'input[aria-invalid="true"], fieldset[aria-invalid="true"]',
  );
  if (target instanceof HTMLFieldSetElement) {
    (
      target.querySelector<HTMLInputElement>('input:checked') ?? target.querySelector('input')
    )?.focus();
  } else {
    target?.focus();
  }
}
