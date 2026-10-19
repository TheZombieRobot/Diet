// Record problems in plain words (storage spec section 10.9; ux review): every message the owner
// reads about a record names the store, the position and the field in plain words, with the
// allowed range, and never a code name (a field, store or rule id) or a value.
import { describe, expect, it } from 'vitest';
import { privacy } from '../../copy/health';
import { INVARIANT_RULES } from '../invariants';
import { STORAGE_RULES } from '../primitives';
import { BACKUP_TABLES, TABLES } from '../tables';
import {
  BACKUP_ERROR_CODES,
  BackupError,
  describeRecordProblem,
  KICKSTART_HISTORY_RULE,
} from './errors';

/** Every field name in a spec description, at any depth (objects inside arrays and nullables). */
function fieldNames(desc: unknown, into: Set<string> = new Set()): Set<string> {
  if (Array.isArray(desc)) {
    for (const item of desc) fieldNames(item, into);
  } else if (typeof desc === 'object' && desc !== null) {
    const record = desc as Record<string, unknown>;
    const fields = record['fields'];
    if (typeof fields === 'object' && fields !== null && !Array.isArray(fields)) {
      for (const name of Object.keys(fields)) into.add(name);
    }
    for (const value of Object.values(record)) fieldNames(value, into);
  }
  return into;
}

const ALL_FIELDS = [
  ...new Set(Object.values(TABLES).flatMap((spec) => [...fieldNames(spec.row.desc)])),
].sort();
const RULE_IDS = [...STORAGE_RULES, ...INVARIANT_RULES, KICKSTART_HISTORY_RULE, 'migration'];

/** A code name: camelCase, snake_case, or a hyphenated rule id. */
const codeName = (text: string): string | null => {
  const camel = /\b[a-z]+[A-Z]\w*/.exec(text);
  if (camel !== null) return camel[0];
  const snake = /\b\w+_\w+\b/.exec(text);
  if (snake !== null) return snake[0];
  return RULE_IDS.find((rule) => rule.includes('-') && text.includes(rule)) ?? null;
};

describe('record problems in plain words (ux review)', () => {
  it('finds the stored field names', () => {
    expect(ALL_FIELDS.length).toBeGreaterThan(150);
    expect(ALL_FIELDS).toContain('steadyDeficitPct');
    expect(ALL_FIELDS).toContain('energyAsEntered');
  });

  it('every stored field name, at any depth, has a plain label with no code name in it', () => {
    const labels = privacy.recordProblem.fields as Readonly<Record<string, string>>;
    expect(ALL_FIELDS.filter((name) => !Object.hasOwn(labels, name))).toEqual([]);
    for (const [name, label] of Object.entries(labels)) expect(codeName(label), name).toBeNull();
  });

  it('every rule id, of a field or across records, has a plain sentence', () => {
    const rules = privacy.recordProblem.rules as Readonly<Record<string, string>>;
    const invariants = privacy.recordProblem.invariants as Readonly<Record<string, string>>;
    expect(STORAGE_RULES.filter((rule) => !Object.hasOwn(rules, rule))).toEqual([]);
    expect(INVARIANT_RULES.filter((rule) => !Object.hasOwn(invariants, rule))).toEqual([]);
  });

  it('no description of any store, field and rule contains a code name', () => {
    const plain = (detail: Parameters<typeof describeRecordProblem>[0]) => {
      const text = describeRecordProblem(detail);
      expect(codeName(text), JSON.stringify(detail)).toBeNull();
      expect(text).not.toMatch(/\{\w+\}/);
    };
    // Every store and rule, with and without a position.
    for (const table of [...BACKUP_TABLES, 'example_unknown', null]) {
      for (const rule of [...RULE_IDS, 'example-unknown-rule']) {
        for (const index of [null, 0]) plain({ table, index, field: '', rule });
      }
    }
    // Every field, at any depth, with each rule of a field.
    for (const field of [...ALL_FIELDS, 'example.nested[2].unknownField']) {
      for (const rule of STORAGE_RULES) {
        plain({ table: 'targets', index: 0, field, rule, allowed: '15–20' });
        plain({ table: 'targets', index: 0, field: `items[3].${field}`, rule });
      }
    }
  });

  it('reads as the store, the position, the field and the rule, with the allowed range', () => {
    expect(
      describeRecordProblem({
        table: 'targets',
        index: 0,
        field: 'steadyDeficitPct',
        rule: 'range',
        allowed: '15–20',
      }),
    ).toBe('Targets, record 1: the Steady-phase deficit is outside the allowed range (15–20)');
    expect(
      describeRecordProblem({ table: 'fasts', index: 3, field: '', rule: 'fast-overlap' }),
    ).toBe('Fasts, record 4: two fasts overlap');
    expect(describeRecordProblem({ rule: 'fast-overlap' })).toBe('two fasts overlap');
    expect(describeRecordProblem({ table: null, rule: 'extra-key' })).toBe(
      privacy.recordProblem.unknownList,
    );
  });

  it('a problem with a whole list, or with the file, is not called a record (wording review)', () => {
    expect(new BackupError('invalid-record', { table: 'weights', rule: 'missing' }).message).toBe(
      'The backup is missing a list this app needs (Weigh-ins). Nothing was imported.',
    );
    expect(new BackupError('invalid-record', { table: 'weights', rule: 'type' }).message).toBe(
      'The backup has a list this app cannot read (Weigh-ins). Nothing was imported.',
    );
    expect(new BackupError('invalid-record', { table: null, rule: 'extra-key' }).message).toBe(
      privacy.backupListErrors.unknown,
    );
    expect(
      new BackupError('invalid-record', { table: 'garden_photos', rule: 'extra-key' }).message,
    ).toBe(
      'The backup has a list that belongs only on the phone, never in a backup (Garden photos). Nothing was imported.',
    );
    expect(new BackupError('invalid-record', { rule: 'migration' }).message).toBe(
      privacy.backupListErrors.migration,
    );
  });

  it('a rescue copy\u2019s Kickstart history refusal has its own message, naming the record', () => {
    const message = new BackupError('invalid-record', {
      table: 'kickstart_checks',
      index: 1,
      field: 'outcome',
      rule: KICKSTART_HISTORY_RULE,
    }).message;
    expect(message).toBe(
      'This rescue copy has a Kickstart record that could not be imported (Kickstart checks, record 2), and the Kickstart history is imported whole or not at all. Nothing was imported. Keep the file: a later version of the app may read it.',
    );
    expect(message).not.toMatch(/do not fit together|cannot accept/);
  });

  it('every BackupError message is plain, whatever detail it carries', () => {
    for (const code of BACKUP_ERROR_CODES) {
      for (const rule of [null, ...RULE_IDS]) {
        for (const [table, index] of [
          ['kickstart_periods', 2],
          ['weights', null],
          [null, null],
        ] as const) {
          const error = new BackupError(code, { table, index, field: 'endedTimeZone', rule });
          expect(codeName(error.message), `${code} ${String(rule)}`).toBeNull();
          expect(error.message).not.toMatch(/\{\w+\}/);
        }
      }
    }
  });
});
