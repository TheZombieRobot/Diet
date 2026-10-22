import type { PriceRecord } from '@diet/core';
import { describe, expect, it } from 'vitest';
import {
  csvPrice,
  estimateText,
  formatPriceAmount,
  parsePriceInput,
  priceFromInput,
  priceText,
} from './price';

const AT = '2000-10-12T00:00:00.000Z';
const price = (over: Partial<PriceRecord> = {}): PriceRecord => ({
  amountNzCents: 650,
  basis: 'line',
  enteredAt: AT,
  ...over,
});

describe('prices (LU10; NN-05, HS-16, C111)', () => {
  it('NN-05: every function that prints a price refuses one without a valid entered-at time or amount', () => {
    const bad = [
      price({ enteredAt: '' }),
      price({ enteredAt: 'yesterday' }),
      { amountNzCents: 650, basis: 'line' } as PriceRecord,
      price({ amountNzCents: 0 }),
      price({ amountNzCents: 1.5 }),
    ];
    for (const p of bad) {
      expect(() => formatPriceAmount(p)).toThrow(RangeError);
      expect(() => priceText(p, '12 October')).toThrow(RangeError);
      expect(() => csvPrice(p)).toThrow(RangeError);
      expect(() =>
        estimateText(
          { price: { ...p, basis: 'per_kg' }, fromGardenG: 300, fromPantryG: null },
          '12 October',
        ),
      ).toThrow(RangeError);
      expect(() => priceFromInput(p.amountNzCents, 'line', p.enteredAt)).toThrow(RangeError);
    }
  });

  it('formats in whole cents with no Intl, for each basis', () => {
    expect(formatPriceAmount(price())).toBe('$6.50');
    expect(formatPriceAmount(price({ amountNzCents: 123_405 }))).toBe('$1,234.05');
    expect(priceText(price(), '12 October')).toBe(
      'Your price: $6.50 for this line, entered 12 October.',
    );
    expect(priceText(price({ basis: 'per_kg' }), '12 October')).toBe(
      'Your price: $6.50 per kilogram, entered 12 October.',
    );
    expect(priceText(price({ basis: 'each' }), '12 October')).toBe(
      'Your price: $6.50 each, entered 12 October.',
    );
    expect(csvPrice(price({ amountNzCents: 123_405 }))).toBe('1234.05');
  });

  it('parses only plain digits with up to two decimals', () => {
    const cases: [string, ReturnType<typeof parsePriceInput>][] = [
      ['6.5', { ok: true, cents: 650 }],
      ['$6.50', { ok: true, cents: 650 }],
      ['10000', { ok: true, cents: 1_000_000 }],
      ['6,50', { ok: false, problem: 'format' }],
      ['6.505', { ok: false, problem: 'format' }],
      ['1e3', { ok: false, problem: 'format' }],
      ['-1', { ok: false, problem: 'format' }],
      ['0', { ok: false, problem: 'range' }],
      ['10000.01', { ok: false, problem: 'range' }],
      ['  ', { ok: false, problem: 'empty' }],
    ];
    for (const [text, expected] of cases) expect(parsePriceInput(text), text).toEqual(expected);
  });

  it('J14: an estimate only for a per-kilogram price on grams taken off', () => {
    const perKg = price({ amountNzCents: 800, basis: 'per_kg' });
    expect(estimateText({ price: perKg, fromGardenG: 300, fromPantryG: null }, '12 October')).toBe(
      'Covered by what you have: about $2.40, an estimate from your price entered 12 October.',
    );
    expect(
      estimateText({ price: price(), fromGardenG: 300, fromPantryG: null }, '12 October'),
    ).toBeNull();
    expect(
      estimateText({ price: price({ basis: 'each' }), fromGardenG: 300, fromPantryG: null }, ''),
    ).toBeNull();
    expect(estimateText({ price: perKg, fromGardenG: null, fromPantryG: null }, '')).toBeNull();
  });
});
