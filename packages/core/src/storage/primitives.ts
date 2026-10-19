/**
 * Formats and validator combinators for stored values (storage spec section 2; D10, D11).
 *
 * Every predicate returns a boolean, never throws and never builds a message containing a value.
 * Every validator returns a NEW value built only from the allowed parts, or a ValidationFailure
 * that names the field path and a rule id (section 2.3), never the value. Validators depend only
 * on the value and the code version: no clock, configuration, Intl time-zone data, seed datasets
 * or other records. No validation library is used.
 */
import type { ClockTime } from '../fasting/eatingWindow';
import type { LocalDate } from '../util/time';

/** Canonical UTC instant, exactly the `Date.prototype.toISOString()` form (24 characters). */
export type Instant = string;
/** IANA time-zone name, e.g. "Pacific/Auckland" (syntax only; see isTimeZoneName). */
export type TimeZone = string;
/** Lowercase UUID v4 from crypto.randomUUID(). */
export type Id = string;
/** A dataset id in code: "seed:<slug>", e.g. "seed:silverbeet" (D2). */
export type SeedId = string;
/** An Id or a SeedId. */
export type RefId = string;
export type YesNo = 'yes' | 'no';
export const YES_NO = Object.freeze(['yes', 'no'] as const satisfies readonly YesNo[]);

/** Rule ids carried by StorageValidationError (section 2.3). The last two are write-time only. */
export const STORAGE_RULES = Object.freeze([
  'type',
  'missing',
  'extra-key',
  'forbidden-key',
  'format',
  'range',
  'enum',
  'length',
  'unique',
  'order',
  'iff',
  'equals',
  'pattern',
  'zone-unknown',
  'future-year',
] as const);
export type StorageRule = (typeof STORAGE_RULES)[number];

/** Keys refused at any depth: JSON.parse creates `__proto__` as an ordinary own property. */
export const FORBIDDEN_KEYS = Object.freeze(['__proto__', 'constructor', 'prototype'] as const);
const FORBIDDEN = new Set<string>(FORBIDDEN_KEYS);

// ---------------------------------------------------------------------------------------------
// Format predicates (section 2.2)

/** First instant accepted (inclusive). */
export const INSTANT_MIN: Instant = '2000-01-01T00:00:00.000Z';
/** First instant refused (exclusive upper bound). */
export const INSTANT_END: Instant = '2100-01-01T00:00:00.000Z';
export const LOCAL_DATE_MIN: LocalDate = '2000-01-01';
export const LOCAL_DATE_MAX: LocalDate = '2099-12-31';
export const TIME_ZONE_MAX_LENGTH = 64;
export const SEED_ID_MAX_LENGTH = 64;

const INSTANT_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
const LOCAL_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const CLOCK_TIME_RE = /^(?:[01]\d|2[0-3]):[0-5]\d$/;
const TIME_ZONE_RE = /^[A-Za-z][A-Za-z0-9_+-]*(?:\/[A-Za-z0-9_+-]+){0,2}$/;
const ID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const SEED_ID_RE = /^seed:[a-z0-9]+(?:-[a-z0-9]+)*$/;
// U+0000–U+001F and U+007F; a Note also allows \n (U+000A).
// eslint-disable-next-line no-control-regex
const TEXT_CONTROL_RE = /[\u0000-\u001f\u007f]/;
// eslint-disable-next-line no-control-regex
const NOTE_CONTROL_RE = /[\u0000-\u0009\u000b-\u001f\u007f]/;

/**
 * A canonical instant: the 24-character toISOString form, a real time (no roll-over), from
 * 2000-01-01T00:00:00.000Z up to but not including 2100-01-01T00:00:00.000Z. One form means
 * string order is time order and equality is exact. Core's parseInstant is not used: its message
 * contains the value.
 */
export function isInstant(value: unknown): value is Instant {
  if (typeof value !== 'string' || !INSTANT_RE.test(value)) return false;
  if (value < INSTANT_MIN || value >= INSTANT_END) return false;
  const ms = Date.parse(value);
  return Number.isFinite(ms) && new Date(ms).toISOString() === value;
}

/** A real calendar date "YYYY-MM-DD" from 2000-01-01 to 2099-12-31. */
export function isLocalDate(value: unknown): value is LocalDate {
  if (typeof value !== 'string' || !LOCAL_DATE_RE.test(value)) return false;
  if (value < LOCAL_DATE_MIN || value > LOCAL_DATE_MAX) return false;
  const ms = Date.parse(`${value}T00:00:00.000Z`);
  return Number.isFinite(ms) && new Date(ms).toISOString().slice(0, 10) === value;
}

/** "HH:MM" on a 24-hour clock (the rule of core parseClockTime). */
export function isClockTime(value: unknown): value is ClockTime {
  return typeof value === 'string' && CLOCK_TIME_RE.test(value);
}

/**
 * Syntactic IANA zone name (D6): at most 64 characters, the IANA character set and not
 * "Etc/Unknown". Whether this device's Intl knows the zone is a write-time repository check, so a
 * backup or an upgrade is never refused because a browser has older time-zone data.
 */
export function isTimeZoneName(value: unknown): value is TimeZone {
  return (
    typeof value === 'string' &&
    value.length <= TIME_ZONE_MAX_LENGTH &&
    TIME_ZONE_RE.test(value) &&
    value !== 'Etc/Unknown'
  );
}

/** Lowercase UUID v4. */
export function isId(value: unknown): value is Id {
  return typeof value === 'string' && ID_RE.test(value);
}

/** "seed:<slug>", at most 64 characters. */
export function isSeedId(value: unknown): value is SeedId {
  return typeof value === 'string' && value.length <= SEED_ID_MAX_LENGTH && SEED_ID_RE.test(value);
}

export function isRefId(value: unknown): value is RefId {
  return isId(value) || isSeedId(value);
}

/** Single-line text: no leading or trailing whitespace, no control characters, min–max units. */
export function isText(value: unknown, min: number, max: number): value is string {
  return (
    typeof value === 'string' &&
    value.length >= min &&
    value.length <= max &&
    value.trim() === value &&
    !TEXT_CONTROL_RE.test(value)
  );
}

/** Multi-line text: as Text but "\n" is allowed; length 1–max (an empty note is stored as null). */
export function isNote(value: unknown, max: number): value is string {
  return (
    typeof value === 'string' &&
    value.length >= 1 &&
    value.length <= max &&
    value.trim() === value &&
    !NOTE_CONTROL_RE.test(value)
  );
}

/** A finite number that is not -0 (JSON and structured clone then agree; section 2.1). */
export function isJsonNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && !Object.is(value, -0);
}

export function isInt(value: unknown, min: number, max: number): value is number {
  return isJsonNumber(value) && Number.isSafeInteger(value) && value >= min && value <= max;
}

export function isNum(
  value: unknown,
  min: number,
  max: number,
  minExclusive = false,
): value is number {
  return isJsonNumber(value) && value <= max && (minExclusive ? value > min : value >= min);
}

/** An object literal or JSON object: not null, not an array, prototype Object.prototype or null. */
export function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  const proto: unknown = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

/** Milliseconds since the epoch of a canonical instant (callers validate it first). */
export function instantMs(at: Instant): number {
  return Date.parse(at);
}

// ---------------------------------------------------------------------------------------------
// Validators

/** A JSON description of a validator, for the spec fingerprint (section 9.2). */
export type Desc =
  null | boolean | number | string | readonly Desc[] | { readonly [key: string]: Desc };

/**
 * The field allow-list of a value (C49; section 10.3): for an object, its fields in spec order
 * with the tree of each; for an array, the tree of its items; null for a leaf value.
 */
export interface FieldTree {
  readonly [field: string]: FieldTree | null;
}

/** Why a value was refused: a field path and a rule id, plus the allowed range from the spec. */
export class ValidationFailure {
  constructor(
    readonly field: string,
    readonly rule: StorageRule,
    /** Built only from spec constants, e.g. "20–400"; never from the value. */
    readonly allowed: string | null = null,
  ) {}
}

export interface Validator<T> {
  /** Stable JSON description, part of the spec fingerprint. */
  readonly desc: Desc;
  /** Field allow-list (null for a leaf). */
  readonly tree: FieldTree | null;
  /** The validated value as a new object built from allowed parts only, or why it was refused. Never throws. */
  check(value: unknown, path: string): T | ValidationFailure;
  /**
   * Repository normalisation before validating (section 2.3; D11): -0 becomes 0; Text and Note
   * whitespace rules. Never throws; anything it does not recognise is returned unchanged for the
   * validator to judge. Import never normalises.
   */
  normalize(value: unknown): unknown;
}

/** An object validator also exposes its parts, so a later version's spec can build on them. */
export interface ObjectValidator<T extends object> extends Validator<T> {
  readonly fields: { readonly [K in keyof T]-?: Validator<T[K]> };
  readonly rules: readonly ObjectRule<T>[];
}

/** A rule inside one record ("null iff", "equals" and so on; section 4). */
export interface ObjectRule<T> {
  readonly id: string;
  /** Spec constants the rule uses, so a change to them changes the fingerprint. */
  readonly params: Desc;
  readonly test: (value: T, path: string) => ValidationFailure | null;
}

/** "a.b" for a field of an object at "a" (the row itself is ""). */
export function fieldPath(path: string, key: string): string {
  return path === '' ? key : `${path}.${key}`;
}

const itemPath = (path: string, index: number): string => `${path}[${index}]`;

export function fail(
  field: string,
  rule: StorageRule,
  allowed: string | null = null,
): ValidationFailure {
  return new ValidationFailure(field, rule, allowed);
}

export function isFailure(value: unknown): value is ValidationFailure {
  return value instanceof ValidationFailure;
}

const identity = (value: unknown): unknown => value;
const normalizeNumber = (value: unknown): unknown => (Object.is(value, -0) ? 0 : value);

function leaf<T>(
  desc: Desc,
  check: (value: unknown, path: string) => T | ValidationFailure,
  normalize: (value: unknown) => unknown = identity,
): Validator<T> {
  return Object.freeze({ desc, tree: null, check, normalize });
}

export function rule<T>(
  id: string,
  test: (value: T, path: string) => ValidationFailure | null,
  params: Desc = null,
): ObjectRule<T> {
  return Object.freeze({ id, params, test });
}

export function literal<const L extends string | number | boolean>(value: L): Validator<L> {
  return leaf({ type: 'literal', value }, (v, path) => {
    if (v === value) return value;
    return fail(path, typeof v === typeof value ? 'enum' : 'type');
  });
}

export function enumOf<const T extends readonly (string | number)[]>(
  values: T,
): Validator<T[number]> {
  const allowed = new Set<unknown>(values);
  const kinds = new Set<string>(values.map((v) => typeof v));
  return leaf({ type: 'enum', values: [...values] }, (v, path) => {
    if (allowed.has(v) && !Object.is(v, -0)) return v as T[number];
    return fail(path, kinds.has(typeof v) ? 'enum' : 'type');
  });
}

export const bool: Validator<boolean> = leaf({ type: 'bool' }, (v, path) =>
  typeof v === 'boolean' ? v : fail(path, 'type'),
);

/** Whole number in [min, max], optionally a multiple of `step`. */
export function int(min: number, max: number, step: number | null = null): Validator<number> {
  const allowed = step === null ? `${min}–${max}` : `${min}–${max}, a multiple of ${step}`;
  return leaf(
    { type: 'int', min, max, step },
    (v, path) => {
      if (typeof v !== 'number' || !Number.isSafeInteger(v)) return fail(path, 'type');
      if (Object.is(v, -0) || v < min || v > max) return fail(path, 'range', allowed);
      if (step !== null && v % step !== 0) return fail(path, 'range', allowed);
      return v;
    },
    normalizeNumber,
  );
}

/** Finite number in [min, max], or (min, max] when `minExclusive`. */
export function num(min: number, max: number, minExclusive = false): Validator<number> {
  const allowed = minExclusive ? `more than ${min}, up to ${max}` : `${min}–${max}`;
  return leaf(
    { type: 'num', min, max, minExclusive },
    (v, path) => {
      if (typeof v !== 'number' || !Number.isFinite(v)) return fail(path, 'type');
      if (!isNum(v, min, max, minExclusive)) return fail(path, 'range', allowed);
      return v;
    },
    normalizeNumber,
  );
}

/** Normalises a single-line Text field (section 2.3): line breaks and tabs become spaces. */
export function normalizeText(value: unknown): unknown {
  if (typeof value !== 'string') return value;
  return (
    value
      .replace(/\r\n|[\r\n\t]/g, ' ')
      // eslint-disable-next-line no-control-regex
      .replace(/[\u0000-\u001f\u007f]/g, '')
      .trim()
  );
}

/** Normalises a Note field: Windows line endings become \n, tabs spaces; empty becomes null. */
export function normalizeNote(value: unknown): unknown {
  if (typeof value !== 'string') return value;
  const out = value
    .replace(/\r\n?/g, '\n')
    .replace(/\t/g, ' ')
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u0009\u000b-\u001f\u007f]/g, '')
    .trim();
  return out === '' ? null : out;
}

export function text(min: number, max: number): Validator<string> {
  return leaf(
    { type: 'text', min, max },
    (v, path) => {
      if (typeof v !== 'string') return fail(path, 'type');
      if (v.length < min || v.length > max) return fail(path, 'length', `${min}–${max} characters`);
      if (v.trim() !== v || TEXT_CONTROL_RE.test(v)) return fail(path, 'format');
      return v;
    },
    normalizeText,
  );
}

export function note(max: number): Validator<string> {
  return leaf(
    { type: 'note', max },
    (v, path) => {
      if (typeof v !== 'string') return fail(path, 'type');
      if (v.length < 1 || v.length > max) return fail(path, 'length', `1–${max} characters`);
      if (v.trim() !== v || NOTE_CONTROL_RE.test(v)) return fail(path, 'format');
      return v;
    },
    normalizeNote,
  );
}

/** A string checked by a format predicate ('format' rule). */
function formatted<T extends string>(name: string, test: (v: unknown) => v is T): Validator<T> {
  return leaf({ type: name }, (v, path) => {
    if (typeof v !== 'string') return fail(path, 'type');
    return test(v) ? v : fail(path, 'format');
  });
}

export const instant: Validator<Instant> = formatted('instant', isInstant);
export const localDate: Validator<LocalDate> = formatted('local-date', isLocalDate);
export const clockTime: Validator<ClockTime> = formatted('clock-time', isClockTime);
export const timeZone: Validator<TimeZone> = formatted('time-zone', isTimeZoneName);
export const id: Validator<Id> = formatted('id', isId);
export const seedId: Validator<SeedId> = formatted('seed-id', isSeedId);
export const refId: Validator<RefId> = formatted('ref-id', isRefId);

/** A string matching a regular expression ('pattern' rule), with a length range. */
export function pattern(name: string, re: RegExp, min: number, max: number): Validator<string> {
  return leaf({ type: 'pattern', name, source: re.source, min, max }, (v, path) => {
    if (typeof v !== 'string') return fail(path, 'type');
    if (v.length < min || v.length > max) return fail(path, 'length', `${min}–${max} characters`);
    return re.test(v) ? v : fail(path, 'pattern');
  });
}

export function nullable<T>(inner: Validator<T>): Validator<T | null> {
  return Object.freeze({
    desc: { type: 'nullable', of: inner.desc },
    tree: inner.tree,
    check: (v: unknown, path: string) => (v === null ? null : inner.check(v, path)),
    normalize: (v: unknown) => (v === null ? null : inner.normalize(v)),
  });
}

export interface ArrayOptions {
  readonly min?: number;
  readonly max: number;
  /** 'value': no two items equal; 'ignore-case': no two strings equal ignoring case; field: no two items share it. */
  readonly unique?: 'value' | 'ignore-case' | { readonly field: string };
  /** 'ascending': strictly ascending numbers; `in`: strictly ascending positions in that list. */
  readonly order?: 'ascending' | { readonly in: readonly string[] };
}

function uniqueKey(item: unknown, unique: NonNullable<ArrayOptions['unique']>): unknown {
  if (unique === 'value') return item;
  if (unique === 'ignore-case') return typeof item === 'string' ? item.toLowerCase() : item;
  return isPlainObject(item) ? item[unique.field] : item;
}

export function array<T>(item: Validator<T>, options: ArrayOptions): Validator<T[]> {
  const min = options.min ?? 0;
  const { max, unique, order } = options;
  const lengthAllowed = min === max ? `exactly ${max} items` : `${min}–${max} items`;
  const orderKey = (v: unknown): number =>
    order === undefined || order === 'ascending'
      ? Number(v)
      : order.in.indexOf(typeof v === 'string' ? v : '');
  return Object.freeze({
    desc: {
      type: 'array',
      of: item.desc,
      min,
      max,
      unique:
        unique === undefined ? null : typeof unique === 'string' ? unique : { field: unique.field },
      order: order === undefined ? null : order === 'ascending' ? order : { in: [...order.in] },
    },
    tree: item.tree,
    check: (v: unknown, path: string): T[] | ValidationFailure => {
      if (!Array.isArray(v)) return fail(path, 'type');
      const list: readonly unknown[] = v;
      if (list.length < min || list.length > max) return fail(path, 'length', lengthAllowed);
      const out: T[] = [];
      for (let i = 0; i < list.length; i++) {
        if (!Object.hasOwn(list, i)) return fail(itemPath(path, i), 'type');
        const r = item.check(list[i], itemPath(path, i));
        if (isFailure(r)) return r;
        out.push(r);
      }
      if (unique !== undefined) {
        const seen = new Set<unknown>();
        for (const x of out) {
          const k = uniqueKey(x, unique);
          if (seen.has(k)) return fail(path, 'unique');
          seen.add(k);
        }
      }
      if (order !== undefined) {
        for (let i = 1; i < out.length; i++) {
          if (!(orderKey(out[i - 1]) < orderKey(out[i]))) return fail(path, 'order');
        }
      }
      return out;
    },
    normalize: (v: unknown) => (Array.isArray(v) ? v.map((x: unknown) => item.normalize(x)) : v),
  });
}

/**
 * A plain object with exactly these fields (section 2.1): a missing field, an extra key or a key
 * named __proto__, constructor or prototype is refused. The result is a new object with the
 * fields in spec order; the input is never spread. Rules run after every field has passed.
 */
export function object<T extends object>(
  fields: { readonly [K in keyof T]-?: Validator<T[K]> },
  rules: readonly ObjectRule<T>[] = [],
): ObjectValidator<T> {
  const keys = Object.keys(fields) as (keyof T & string)[];
  const known = new Set<string>(keys);
  const field = (key: keyof T & string): Validator<unknown> => fields[key];
  const tree: Record<string, FieldTree | null> = {};
  for (const key of keys) tree[key] = field(key).tree;
  return Object.freeze({
    desc: {
      type: 'object',
      fields: Object.fromEntries(keys.map((k) => [k, field(k).desc])),
      rules: rules.map((r) => ({ id: r.id, params: r.params })),
    },
    tree: Object.freeze(tree),
    fields,
    rules,
    check: (v: unknown, path: string): T | ValidationFailure => {
      if (!isPlainObject(v)) return fail(path, 'type');
      for (const key of Reflect.ownKeys(v)) {
        if (typeof key !== 'string') return fail(path, 'extra-key');
        if (FORBIDDEN.has(key)) return fail(path, 'forbidden-key');
        if (!known.has(key)) return fail(path, 'extra-key');
      }
      const out: Record<string, unknown> = {};
      for (const key of keys) {
        if (!Object.hasOwn(v, key)) return fail(fieldPath(path, key), 'missing');
        const r = field(key).check(v[key], fieldPath(path, key));
        if (isFailure(r)) return r;
        out[key] = r;
      }
      const value = out as T;
      for (const r of rules) {
        const failure = r.test(value, path);
        if (failure !== null) return failure;
      }
      return value;
    },
    normalize: (v: unknown): unknown => {
      if (!isPlainObject(v)) return v;
      const out: Record<string, unknown> = {};
      for (const key of Reflect.ownKeys(v)) {
        if (typeof key !== 'string' || FORBIDDEN.has(key)) continue;
        out[key] = known.has(key) ? field(key as keyof T & string).normalize(v[key]) : v[key];
      }
      return out;
    },
  });
}

function mergeTrees(a: FieldTree | null, b: FieldTree | null): FieldTree | null {
  if (a === null) return b;
  if (b === null) return a;
  const out: Record<string, FieldTree | null> = { ...a };
  for (const [key, sub] of Object.entries(b)) {
    out[key] = Object.hasOwn(out, key) ? mergeTrees(out[key] ?? null, sub) : sub;
  }
  return Object.freeze(out);
}

/** One of several object shapes, chosen by the string in `key` (a tagged union). */
export function variants<T extends object>(
  key: string,
  options: Readonly<Record<string, Validator<T>>>,
): Validator<T> {
  const tags = Object.keys(options);
  const pick = (v: unknown): Validator<T> | undefined => {
    if (!isPlainObject(v) || !Object.hasOwn(v, key)) return undefined;
    const tag = v[key];
    return typeof tag === 'string' && Object.hasOwn(options, tag) ? options[tag] : undefined;
  };
  return Object.freeze({
    desc: {
      type: 'variants',
      key,
      options: Object.fromEntries(tags.map((t) => [t, options[t]?.desc ?? null])),
    },
    tree: tags.reduce<FieldTree | null>(
      (acc, t) => mergeTrees(acc, options[t]?.tree ?? null),
      null,
    ),
    check: (v: unknown, path: string): T | ValidationFailure => {
      if (!isPlainObject(v)) return fail(path, 'type');
      if (!Object.hasOwn(v, key)) return fail(fieldPath(path, key), 'missing');
      const chosen = pick(v);
      return chosen === undefined ? fail(fieldPath(path, key), 'enum') : chosen.check(v, path);
    },
    normalize: (v: unknown) => pick(v)?.normalize(v) ?? v,
  });
}

/** A device-only ArrayBuffer of min–max bytes (garden photos; never in a backup). */
export function arrayBuffer(minBytes: number, maxBytes: number): Validator<ArrayBuffer> {
  return leaf({ type: 'array-buffer', minBytes, maxBytes }, (v, path) => {
    if (Object.prototype.toString.call(v) !== '[object ArrayBuffer]') return fail(path, 'type');
    const buffer = v as ArrayBuffer;
    if (buffer.byteLength < minBytes || buffer.byteLength > maxBytes) {
      return fail(path, 'length', `${minBytes}–${maxBytes} bytes`);
    }
    return buffer;
  });
}

/** The parts of a WebCrypto CryptoKey that storage checks (the DOM type is not in core's lib). */
export interface StoredCryptoKey {
  readonly type: string;
  readonly extractable: boolean;
  readonly algorithm: object;
  readonly usages: readonly string[];
}

/** A non-extractable AES-GCM 256-bit key for encrypt and decrypt (C34; device only). */
export const aesGcmKey: Validator<StoredCryptoKey> = leaf(
  {
    type: 'crypto-key',
    algorithm: 'AES-GCM',
    length: 256,
    extractable: false,
    usages: ['decrypt', 'encrypt'],
  },
  (v, path) => {
    if (
      Object.prototype.toString.call(v) !== '[object CryptoKey]' ||
      typeof v !== 'object' ||
      v === null
    ) {
      return fail(path, 'type');
    }
    const key = v as Partial<StoredCryptoKey>;
    const algorithm = key.algorithm as { name?: unknown; length?: unknown } | undefined;
    const usages = Array.isArray(key.usages) ? [...(key.usages as unknown[])].sort() : [];
    const ok =
      key.type === 'secret' &&
      key.extractable === false &&
      algorithm?.name === 'AES-GCM' &&
      algorithm.length === 256 &&
      usages.length === 2 &&
      usages[0] === 'decrypt' &&
      usages[1] === 'encrypt';
    return ok ? (v as StoredCryptoKey) : fail(path, 'equals');
  },
);

// ---------------------------------------------------------------------------------------------
// Allow-list picking (C49; sections 9.5 and 10.3)

/** Returned by pickByTree for a value that cannot be carried (an object where a leaf belongs). */
export const OMIT: unique symbol = Symbol('omit');

const isJsonPrimitive = (v: unknown): boolean =>
  v === null ||
  typeof v === 'string' ||
  typeof v === 'boolean' ||
  (typeof v === 'number' && Number.isFinite(v));

/**
 * Copies `value` keeping only what the allow-list names, without validating it (the rescue copy
 * and the unchecked export copy). JSON primitives are kept; arrays are copied item by item; a
 * plain object keeps only the fields in `tree`, recursively; anything else (an object where a
 * leaf belongs, an ArrayBuffer, a CryptoKey, a Date) is dropped. So nothing outside the
 * allow-list can ever reach a file.
 */
export function pickByTree(value: unknown, tree: FieldTree | null): unknown {
  if (isJsonPrimitive(value)) return value;
  if (Array.isArray(value)) {
    const list: readonly unknown[] = value;
    return Array.from({ length: list.length }, (_, i) => {
      const r = Object.hasOwn(list, i) ? pickByTree(list[i], tree) : null;
      return r === OMIT ? null : r;
    });
  }
  if (tree === null || !isPlainObject(value)) return OMIT;
  const out: Record<string, unknown> = {};
  for (const [key, sub] of Object.entries(tree)) {
    if (!Object.hasOwn(value, key)) continue;
    const r = pickByTree(value[key], sub);
    if (r !== OMIT) out[key] = r;
  }
  return out;
}

// ---------------------------------------------------------------------------------------------
// Table specs (sections 4.1, 4.2 and 8.4)

/** The generic repository operations a store allows (section 8.4; D46). */
export type GenericOp = 'create' | 'get' | 'list' | 'update' | 'remove';
export const GENERIC_OPS = Object.freeze([
  'create',
  'get',
  'list',
  'update',
  'remove',
] as const satisfies readonly GenericOp[]);

export interface TableSpec<Row extends object> {
  /** The Dexie stores string, e.g. 'id, startedAt' (section 4.2). */
  readonly schema: string;
  /** Primary-key fields: ['id'], or ['cardId', 'trigger'] for a compound key. */
  readonly key: readonly string[];
  /** Other indexes, as Dexie writes them ('at', '[table+recordId]'). */
  readonly indexes: readonly string[];
  /** In a backup (true) or device only (false). */
  readonly backup: boolean;
  /** What the generic repository allows; it refuses anything else. */
  readonly ops: readonly GenericOp[];
  readonly row: Validator<Row>;
}

/** Any version's specs, by store name. */
export type TableSpecs = Readonly<Record<string, TableSpec<object>>>;

/** Splits a Dexie stores string into the primary key fields and the other indexes. */
export function parseStoreSchema(schema: string): { key: string[]; indexes: string[] } {
  const [first = '', ...rest] = schema.split(',').map((s) => s.trim());
  const compound = /^\[(.+)\]$/.exec(first);
  return { key: compound?.[1] === undefined ? [first] : compound[1].split('+'), indexes: rest };
}

export function table<Row extends object>(
  schema: string,
  backup: boolean,
  ops: readonly GenericOp[],
  row: Validator<Row>,
): TableSpec<Row> {
  const { key, indexes } = parseStoreSchema(schema);
  return Object.freeze({ schema, key, indexes, backup, ops: Object.freeze([...ops]), row });
}
