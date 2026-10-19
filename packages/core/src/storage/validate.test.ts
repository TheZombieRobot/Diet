import { describe, expect, it } from 'vitest';
import { defaultSnapshot } from './defaults';
import { checkInvariants, StorageInvariantError } from './invariants';
import { normalizeRow, StorageValidationError, validateRow, validateSnapshot } from './validate';

const id = (n: number) => `00000000-0000-4000-8000-${n.toString(16).padStart(12, '0')}`;
const env = { now: '2000-01-01T00:00:00.000Z', randomId: () => id(99) };
const weight = {
  id: id(1),
  at: '2000-01-01T00:00:00.000Z',
  timeZone: 'Pacific/Auckland',
  kg: 80,
  source: 'manual',
  note: null,
};

function caught(fn: () => unknown): unknown {
  try {
    fn();
  } catch (error) {
    return error;
  }
  throw new Error('expected an error');
}

describe('validateRow (section 2.3; D10)', () => {
  it('returns a new row with the fields in spec order', () => {
    const shuffled = {
      note: null,
      kg: 80,
      id: id(1),
      source: 'manual',
      timeZone: 'Pacific/Auckland',
      at: '2000-01-01T00:00:00.000Z',
    };
    const out = validateRow('weights', shuffled);
    expect(out).toEqual(weight);
    expect(Object.keys(out)).toEqual(Object.keys(weight));
    expect(out).not.toBe(shuffled);
  });

  it('an error has exactly { table, field, rule }, no cause, and no value in its message (section 16 test 21)', () => {
    const error = caught(() =>
      validateRow('weights', { ...weight, kg: 123.456 * 10, note: 'zzsentinel' }),
    );
    expect(error).toBeInstanceOf(StorageValidationError);
    const e = error as StorageValidationError;
    expect(Object.keys(e).sort()).toEqual(['field', 'rule', 'table']);
    expect([e.table, e.field, e.rule, e.name]).toEqual([
      'weights',
      'kg',
      'range',
      'StorageValidationError',
    ]);
    expect(e.message).toBe('weights.kg failed range (must be 20–400)');
    expect(e.cause).toBeUndefined();
    for (const text of [e.message, String(e), e.stack ?? '']) {
      expect(text).not.toContain('1234.56');
      expect(text).not.toContain('zzsentinel');
    }
    const day = caught(() =>
      validateRow('alcohol_day_notes', {
        date: '2000-02-29',
        note: null,
        withdrawalTick: false,
        enteredAt: '2000-02-29T00:00:00.000Z',
        timeZone: 'UTC',
        updatedAt: '2000-02-29T00:00:00.000Z',
      }),
    ) as Error;
    expect(day.message).toBe('alcohol_day_notes.note failed missing');
    expect(day.stack ?? '').not.toContain('2000-02-29');
  });

  it('an unknown table is refused', () => {
    expect(
      (caught(() => validateRow('no_such_store' as 'weights', weight)) as StorageValidationError)
        .rule,
    ).toBe('enum');
  });

  it('validateSnapshot checks every row of every listed table', () => {
    const snapshot = defaultSnapshot(env);
    expect(validateSnapshot({ ...snapshot, weights: [weight] }).weights).toEqual([weight]);
    expect((caught(() => validateSnapshot({ weights: {} })) as StorageValidationError).rule).toBe(
      'type',
    );
    expect(
      (caught(() => validateSnapshot({ zzsentinel: [] })) as StorageValidationError).message,
    ).not.toContain('zzsentinel');
  });
});

describe('checkInvariants errors carry only the rule', () => {
  it('names the rule and nothing else', () => {
    const snapshot = defaultSnapshot(env);
    const twoOnboarding = {
      ...snapshot,
      weights: [
        { ...weight, source: 'onboarding' as const },
        { ...weight, id: id(2), source: 'onboarding' as const },
      ],
    };
    const error = caught(() => {
      checkInvariants(twoOnboarding);
    });
    expect(error).toBeInstanceOf(StorageInvariantError);
    expect(Object.keys(error as object)).toEqual(['rule']);
    expect((error as StorageInvariantError).rule).toBe('weight-onboarding');
    expect((error as Error).message).toBe('The records do not fit together: weight-onboarding');
  });
});

describe('repository normalisation (section 2.3; D11)', () => {
  it('a note with Windows line endings and a tab saves with \\n and a space; a name with a newline saves with a space', () => {
    const note = normalizeRow('weights', { ...weight, note: '  First line\r\nSecond\tline  ' });
    expect(validateRow('weights', note).note).toBe('First line\nSecond line');
    const name = normalizeRow('beverages', { name: 'Example\nlager', volumeMl: 330 }) as {
      name: string;
    };
    expect(name.name).toBe('Example lager');
  });

  it('a computed -0 saves as 0, an empty note becomes null, and nested shapes are normalised too', () => {
    const row = normalizeRow('weights', { ...weight, kg: 80, note: ' \r\n ' }) as { note: unknown };
    expect(row.note).toBeNull();
    const water = normalizeRow('water_log', {
      id: id(3),
      at: weight.at,
      timeZone: 'UTC',
      ml: -0,
      electrolyte: true,
    }) as { ml: number };
    expect(Object.is(water.ml, 0)).toBe(true);
    const nested = normalizeRow('targets', { proteinRangeG: { min: -0, max: 140 } }) as {
      proteinRangeG: { min: number };
    };
    expect(Object.is(nested.proteinRangeG.min, 0)).toBe(true);
    expect(normalizeRow('no_such_store', 5)).toBe(5);
  });
});
