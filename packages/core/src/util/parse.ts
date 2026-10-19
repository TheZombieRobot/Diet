const PLAIN_NUMBER_RE = /^\d+(?:\.\d+)?$/;

/**
 * Reads an optional number typed into a form field. Forms must use this, never Number(): an empty
 * field is Number('') === 0, which would become a 0 kcal or 0 standard-drinks label figure.
 *
 * - Surrounding whitespace is ignored; an empty or blank field is undefined (not entered).
 * - Otherwise only plain digits with an optional decimal point are accepted ("5", "4.5"). Units,
 *   signs, exponents, a decimal comma ("5,5") and a percent sign ("5%") are refused with a
 *   RangeError, so the form can ask again rather than guess.
 */
export function parseOptionalNumber(input: string): number | undefined {
  const trimmed = input.trim();
  if (trimmed === '') return undefined;
  if (!PLAIN_NUMBER_RE.test(trimmed)) {
    throw new RangeError(`Expected a plain number such as 5 or 4.5, got "${trimmed}"`);
  }
  const value = Number(trimmed);
  if (!Number.isFinite(value)) throw new RangeError(`Number is too large: "${trimmed}"`);
  return value;
}
