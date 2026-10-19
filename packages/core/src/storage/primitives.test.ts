import { describe, expect, it } from 'vitest';
import {
  array,
  enumOf,
  type FieldTree,
  int,
  isClockTime,
  isId,
  isInstant,
  isLocalDate,
  isNote,
  isNum,
  isInt,
  isRefId,
  isSeedId,
  isText,
  isTimeZoneName,
  isFailure,
  note,
  num,
  object,
  OMIT,
  parseStoreSchema,
  pickByTree,
  text,
  ValidationFailure,
  type Validator,
} from './primitives';

function failure<T>(v: Validator<T>, value: unknown): { field: string; rule: string } | null {
  const r = v.check(value, 'f');
  return isFailure(r) ? { field: r.field, rule: r.rule } : null;
}

describe('formats (section 2.2; section 16 test 1)', () => {
  it('Instant: only the canonical 24-character toISOString form, from 2000 up to but not including 2100', () => {
    expect(isInstant('2000-01-01T00:00:00.000Z')).toBe(true);
    expect(isInstant('2099-12-31T23:59:59.999Z')).toBe(true);
    for (const bad of [
      '2000-01-01T13:00:00.000+13:00', // an offset form
      '2000-01-01T00:00:00Z', // no millisecond part
      '2000-01-01T00:00Z',
      '1999-12-31T23:59:59.999Z',
      '2100-01-01T00:00:00.000Z',
      '2000-02-30T00:00:00.000Z', // rolls over
      '2000-01-01T24:00:00.000Z',
      '2000-01-01 00:00:00.000Z',
      ' 2000-01-01T00:00:00.000Z',
      '',
      20000101,
      null,
    ]) {
      expect(isInstant(bad), String(bad)).toBe(false);
    }
  });

  it('LocalDate: a real calendar date from 2000-01-01 to 2099-12-31', () => {
    expect(isLocalDate('2000-02-29')).toBe(true);
    expect(isLocalDate('2099-12-31')).toBe(true);
    for (const bad of [
      '1999-12-31',
      '2100-01-01',
      '2001-02-29',
      '2000-13-01',
      '2000-1-01',
      '2000-01-01T00:00',
      1,
    ]) {
      expect(isLocalDate(bad), String(bad)).toBe(false);
    }
  });

  it('ClockTime: HH:MM on a 24-hour clock', () => {
    expect(isClockTime('00:00')).toBe(true);
    expect(isClockTime('23:59')).toBe(true);
    for (const bad of ['24:00', '7:00', '07:60', '07:00:00', ''])
      expect(isClockTime(bad)).toBe(false);
  });

  it('TimeZone: syntax only; a well-formed name Intl does not know still passes the validator (D6)', () => {
    for (const ok of [
      'America/Argentina/Buenos_Aires',
      'Etc/GMT+10',
      'UTC',
      'Pacific/Auckland',
      'Example/Nowhere',
    ]) {
      expect(isTimeZoneName(ok), ok).toBe(true);
    }
    for (const bad of [
      'Etc/Unknown',
      '',
      'A'.repeat(65),
      '/Pacific',
      'Pacific/',
      'a/b/c/d',
      'Pacific Auckland',
      3,
    ]) {
      expect(isTimeZoneName(bad), String(bad)).toBe(false);
    }
    expect(isTimeZoneName('A'.repeat(64))).toBe(true);
  });

  it('Id: lowercase UUID v4; SeedId: seed:<slug> up to 64 characters; RefId: either', () => {
    expect(isId('00000000-0000-4000-8000-000000000001')).toBe(true);
    expect(isId('00000000-0000-4000-8000-00000000000A')).toBe(false);
    expect(isId('00000000-0000-1000-8000-000000000001')).toBe(false);
    expect(isId('00000000-0000-4000-c000-000000000001')).toBe(false);
    expect(isSeedId('seed:silverbeet')).toBe(true);
    expect(isSeedId('seed:example-food-2')).toBe(true);
    for (const bad of [
      'seed:',
      'seed:-x',
      'seed:x-',
      'seed:Silverbeet',
      'seed:a--b',
      `seed:${'a'.repeat(60)}`,
    ]) {
      expect(isSeedId(bad), bad).toBe(false);
    }
    expect(isRefId('seed:silverbeet')).toBe(true);
    expect(isRefId('00000000-0000-4000-8000-000000000001')).toBe(true);
    expect(isRefId('silverbeet')).toBe(false);
  });

  it('Text: single line, no surrounding whitespace, no control characters, length in UTF-16 units', () => {
    expect(isText('Example', 1, 7)).toBe(true);
    expect(isText('Example', 1, 6)).toBe(false);
    for (const bad of [
      ' Example',
      'Example ',
      'Ex\nample',
      'Ex\tample',
      'Ex\u0000ample',
      'Ex\u007fample',
      '',
    ]) {
      expect(isText(bad, 1, 80), JSON.stringify(bad)).toBe(false);
    }
    expect(failure(text(1, 5), 'Example')).toEqual({ field: 'f', rule: 'length' });
    expect(failure(text(1, 80), ' x')).toEqual({ field: 'f', rule: 'format' });
    expect(failure(text(1, 80), 5)).toEqual({ field: 'f', rule: 'type' });
  });

  it('Note: as Text but \\n is allowed; 1 to n characters (an empty note is stored as null)', () => {
    expect(isNote('Line one\nLine two', 280)).toBe(true);
    expect(isNote('', 280)).toBe(false);
    expect(isNote('Line one\r\nLine two', 280)).toBe(false);
    expect(isNote('Line\t', 280)).toBe(false);
    expect(isNote('\nLine', 280)).toBe(false);
    expect(failure(note(3), 'four')).toEqual({ field: 'f', rule: 'length' });
  });

  it('Int and Num: -0, NaN, Infinity and non-integers are refused', () => {
    expect(isInt(5, 0, 10)).toBe(true);
    expect(isInt(-0, -1, 1)).toBe(false);
    expect(isInt(5.5, 0, 10)).toBe(false);
    expect(isNum(Number.NaN, 0, 10)).toBe(false);
    expect(isNum(Number.POSITIVE_INFINITY, 0, Number.POSITIVE_INFINITY)).toBe(false);
    expect(isNum(0, 0, 10, true)).toBe(false);
    expect(isNum(0.001, 0, 10, true)).toBe(true);
    expect(failure(int(0, 10), 5.5)).toEqual({ field: 'f', rule: 'type' });
    expect(failure(int(0, 10), -0)).toEqual({ field: 'f', rule: 'range' });
    expect(failure(int(0, 360, 30), 45)).toEqual({ field: 'f', rule: 'range' });
    expect(failure(int(0, 360, 30), 330)).toBeNull();
    expect(failure(num(0, 10), Number.NaN)).toEqual({ field: 'f', rule: 'type' });
    expect(failure(num(0, 10), -0)).toEqual({ field: 'f', rule: 'range' });
    expect(failure(num(0, 3000, true), 0)).toEqual({ field: 'f', rule: 'range' });
    expect(failure(num(0, 10), '5')).toEqual({ field: 'f', rule: 'type' });
  });

  it('a failure names the allowed range from the spec, never the value', () => {
    const r = num(20, 400).check(123.456 * 10, 'kg');
    expect(r).toBeInstanceOf(ValidationFailure);
    expect(r).toEqual(new ValidationFailure('kg', 'range', '20–400'));
  });
});

describe('combinators', () => {
  const shape = object<{ a: number; b: { c: string } }>({
    a: int(0, 5),
    b: object({ c: text(1, 5) }),
  });

  it('returns a new object built only from the allowed keys, in spec order', () => {
    const input = { b: { c: 'x' }, a: 1 };
    const out = shape.check(input, '');
    expect(out).toEqual({ a: 1, b: { c: 'x' } });
    expect(out).not.toBe(input);
    expect(Object.keys(out)).toEqual(['a', 'b']);
  });

  it('refuses a missing field, an extra key and the keys __proto__, constructor and prototype at any depth', () => {
    expect(failure(shape, { a: 1 })).toEqual({ field: 'f.b', rule: 'missing' });
    expect(failure(shape, { a: 1, b: { c: 'x' }, d: 1 })).toEqual({
      field: 'f',
      rule: 'extra-key',
    });
    expect(failure(shape, JSON.parse('{"a":1,"b":{"c":"x"},"__proto__":{"a":2}}'))).toEqual({
      field: 'f',
      rule: 'forbidden-key',
    });
    expect(failure(shape, JSON.parse('{"a":1,"b":{"c":"x","__proto__":null}}'))).toEqual({
      field: 'f.b',
      rule: 'forbidden-key',
    });
    for (const key of ['constructor', 'prototype']) {
      expect(failure(shape, { a: 1, b: { c: 'x', [key]: 1 } })).toEqual({
        field: 'f.b',
        rule: 'forbidden-key',
      });
    }
    expect(failure(shape, { a: 1, b: { c: 'x' }, [Symbol('s')]: 1 })).toEqual({
      field: 'f',
      rule: 'extra-key',
    });
    expect(
      failure(
        shape,
        Object.assign(Object.create({ inherited: 1 }) as object, { a: 1, b: { c: 'x' } }),
      ),
    ).toEqual({
      field: 'f',
      rule: 'type',
    });
    expect(failure(shape, [1])).toEqual({ field: 'f', rule: 'type' });
  });

  it('arrays: length, sparse items, uniqueness and order', () => {
    const list = array(int(0, 100), { max: 3, unique: 'value', order: 'ascending' });
    expect(failure(list, [1, 2, 3])).toBeNull();
    expect(failure(list, [1, 2, 3, 4])).toEqual({ field: 'f', rule: 'length' });
    // eslint-disable-next-line no-sparse-arrays
    expect(failure(list, [1, , 3])).toEqual({ field: 'f[1]', rule: 'type' });
    expect(failure(list, [1, 1])).toEqual({ field: 'f', rule: 'unique' });
    expect(failure(list, [2, 1])).toEqual({ field: 'f', rule: 'order' });
    expect(failure(array(text(1, 9), { max: 3, unique: 'ignore-case' }), ['Ab', 'aB'])).toEqual({
      field: 'f',
      rule: 'unique',
    });
    expect(
      failure(array(enumOf(['a', 'b', 'c']), { max: 3, order: { in: ['a', 'b', 'c'] } }), [
        'c',
        'a',
      ]),
    ).toEqual({
      field: 'f',
      rule: 'order',
    });
  });

  it('enum and literal refusals', () => {
    expect(failure(enumOf(['a', 'b']), 'c')).toEqual({ field: 'f', rule: 'enum' });
    expect(failure(enumOf(['a', 'b']), 1)).toEqual({ field: 'f', rule: 'type' });
    expect(failure(enumOf([2, 3]), -0)).toEqual({ field: 'f', rule: 'enum' });
  });

  it('normalises Text, Note and -0 for repositories (section 2.3; D11)', () => {
    expect(text(1, 80).normalize('  Example\r\nname\tthere\u0007 ')).toBe('Example name there');
    expect(note(280).normalize(' Line one\r\nLine\ttwo\rthree\u0000 ')).toBe(
      'Line one\nLine two\nthree',
    );
    expect(note(280).normalize('  \r\n ')).toBeNull();
    expect(Object.is(num(-1, 1).normalize(-0), 0)).toBe(true);
    expect(shape.normalize({ a: -0, b: { c: ' x\n' }, extra: 1 })).toEqual({
      a: 0,
      b: { c: 'x' },
      extra: 1,
    });
  });

  it('parses Dexie stores strings into the key and the other indexes', () => {
    expect(parseStoreSchema('id')).toEqual({ key: ['id'], indexes: [] });
    expect(parseStoreSchema('id, at, [table+recordId]')).toEqual({
      key: ['id'],
      indexes: ['at', '[table+recordId]'],
    });
    expect(parseStoreSchema('[cardId+trigger]')).toEqual({
      key: ['cardId', 'trigger'],
      indexes: [],
    });
  });
});

describe('allow-list picking (C49; sections 9.5 and 10.3)', () => {
  const tree: FieldTree = { a: null, b: { c: null }, list: { d: null } };

  it('keeps only the named fields at every depth and drops what cannot be carried', () => {
    const picked = pickByTree(
      {
        a: 1,
        b: { c: 'x', secret: 'y' },
        list: [{ d: true, e: 1 }, 'z', { d: { nested: 1 } }],
        extra: 2,
        key: {},
      },
      tree,
    );
    expect(picked).toEqual({ a: 1, b: { c: 'x' }, list: [{ d: true }, 'z', {}] });
    expect(pickByTree(new ArrayBuffer(4), null)).toBe(OMIT);
    expect(pickByTree({ a: new ArrayBuffer(2) }, tree)).toEqual({});
  });
});
