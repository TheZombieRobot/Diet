import { describe, expect, it } from 'vitest';
import { parseOptionalNumber } from './parse';

describe('parseOptionalNumber (form fields)', () => {
  it.each([
    ['5', 5],
    ['4.5', 4.5],
    [' 94 ', 94],
    ['0', 0],
    ['007', 7],
    ['1.30', 1.3],
  ])('reads %j as %d', (input, expected) => {
    expect(parseOptionalNumber(input)).toBe(expected);
  });

  it('an empty or blank field is not entered (undefined), never 0', () => {
    expect(parseOptionalNumber('')).toBeUndefined();
    expect(parseOptionalNumber('   ')).toBeUndefined();
    expect(parseOptionalNumber('\t\n')).toBeUndefined();
  });

  it.each([
    '5%',
    '5,5',
    '-5',
    '+5',
    '1e3',
    '.5',
    '5.',
    '5 kcal',
    'abc',
    'Infinity',
    'NaN',
    '0x10',
    '٥', // Arabic-Indic digit five
    '1'.repeat(400),
  ])('refuses %j', (input) => {
    expect(() => parseOptionalNumber(input)).toThrow(RangeError);
  });
});
