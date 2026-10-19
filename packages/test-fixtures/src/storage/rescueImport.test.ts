// Importing a rescue copy (storage spec sections 9.5 and 10.6; D22, D23, D27; the data-loss and
// health-rules reviews), and bookkeeping instants dated after the export (health-rules review),
// over the version-1 fixture.
import {
  BackupError,
  checkBackupPayload,
  type DecodedBackup,
  describeRecordProblem,
  FUTURE_INSTANT_TOLERANCE_MS,
} from '@diet/core';
import { privacy } from '@diet/core/copy/health';
import { describe, expect, it } from 'vitest';
import { fixtureEnv } from './env';
import { fixtureId, snapshotV1 } from './snapshotV1';

const EXPORTED_AT = '2000-03-02T00:00:00.000Z';
const EXPORTED_MS = Date.parse(EXPORTED_AT);
type Row = Record<string, unknown>;
type Tables = Record<string, Row[]>;

const clone = (): Tables => structuredClone(snapshotV1) as unknown as Tables;
const rows = (tables: Tables, name: string): Row[] => tables[name] ?? [];
const first = (tables: Tables, name: string): Row => {
  const row = rows(tables, name)[0];
  if (row === undefined) throw new Error(`fixture has no ${name} row`);
  return row;
};
const at = (ms: number) => new Date(ms).toISOString();

function decode(tables: Tables, kind: 'backup' | 'rescue' = 'rescue'): DecodedBackup {
  return checkBackupPayload(
    { schemaVersion: 1, kind, exportedAt: EXPORTED_AT, appVersion: '0.1.0', tables },
    fixtureEnv(),
  );
}

function refusal(tables: Tables, kind: 'backup' | 'rescue' = 'rescue'): BackupError {
  try {
    decode(tables, kind);
  } catch (error) {
    if (error instanceof BackupError) return error;
    throw error;
  }
  throw new Error('expected a BackupError');
}

/** No store, field or rule code in anything the owner reads. */
const CODE_NAME = /[a-z][A-Z]|_|\b(?:fast-running|weight-onboarding|card-trigger|kickstart-)/;

describe('a rescue copy never sets Kickstart history aside (D27, D28)', () => {
  it.each([
    ['kickstart_periods', { startedAt: 'not an instant' }],
    ['kickstart_checks', { outcome: 'maybe' }],
  ] as const)('a failing %s row refuses the whole copy, in plain words', (table, patch) => {
    const tables = clone();
    Object.assign(first(tables, table), patch);
    const error = refusal(tables);
    expect(error.code).toBe('inconsistent');
    expect(error.rule).toBe('kickstart-history');
    expect(error.message).toBe(
      privacy.backupErrors.inconsistent.replace(
        '{detail}',
        privacy.recordProblem.invariants['kickstart-history'],
      ),
    );
    expect(error.message).not.toMatch(CODE_NAME);
  });

  it('a duplicate id in the Kickstart history refuses the copy instead of dropping a period', () => {
    const tables = clone();
    tables['kickstart_periods'] = [
      ...rows(tables, 'kickstart_periods'),
      { ...first(tables, 'kickstart_periods') },
    ];
    expect(refusal(tables).rule).toBe('kickstart-history');
  });

  it('the Kickstart caps still refuse a rescue copy (49 Kickstart days)', () => {
    const tables = clone();
    const stopSign = rows(tables, 'kickstart_checks').find((c) => c['outcome'] === 'stop-sign');
    if (stopSign === undefined) throw new Error('fixture');
    Object.assign(stopSign, {
      dizzyOnStanding: 'no',
      palpitations: 'no',
      crampsNotSettling: 'no',
      faintAtWork: 'no',
      outcome: 'extended',
    });
    const error = refusal(tables);
    expect(error.code).toBe('inconsistent');
    expect(error.rule).toBe('kickstart-days');
  });

  it('a whole fixture rescue copy imports with nothing set aside', () => {
    const decoded = decode(clone());
    expect(decoded.setAside).toEqual([]);
    expect(decoded.replacedFields).toEqual([]);
    expect(decoded.snapshot.kickstart_periods).toEqual(snapshotV1.kickstart_periods);
  });
});

describe('other cross-record rules set the offending rows aside and list them (data-loss review)', () => {
  it('a second running fast: the earlier one is set aside, the rest imports; a backup is refused', () => {
    const tables = clone();
    tables['fasts'] = [
      ...rows(tables, 'fasts'),
      {
        ...first(tables, 'fasts'),
        id: fixtureId(3901),
        startedAt: '2000-02-27T00:00:00.000Z',
        endedAt: null,
        endedTimeZone: null,
      },
    ];
    expect(refusal(tables, 'backup').code).toBe('inconsistent');
    const decoded = decode(tables);
    expect(decoded.setAside).toEqual([
      { table: 'fasts', index: 3, field: '', rule: 'fast-running', allowed: null },
    ]);
    expect(decoded.snapshot.fasts.map((f) => f.id)).toEqual(snapshotV1.fasts.map((f) => f.id));
    const line = describeRecordProblem(decoded.setAside[0] ?? { table: '', index: 0 });
    expect(line).toMatch(/^Fasts, record 4: /);
    expect(line).not.toMatch(CODE_NAME);
  });

  it('a second onboarding weigh-in and a reminder card this app does not know are set aside', () => {
    const tables = clone();
    Object.assign(rows(tables, 'weights')[3] ?? {}, { source: 'onboarding' });
    tables['card_state'] = [
      ...rows(tables, 'card_state'),
      {
        cardId: 'backup-reminder',
        trigger: 'monthly',
        firstShownAt: null,
        dismissedAt: null,
        dismissedTimeZone: null,
        doneAt: null,
      },
    ];
    const decoded = decode(tables);
    const listed = decoded.setAside.map((r) => [r.table, r.index, r.rule]);
    expect(listed).toContainEqual(['weights', 3, 'weight-onboarding']);
    expect(listed.some(([table]) => table === 'card_state')).toBe(true);
    expect(decoded.snapshot.weights).toHaveLength(snapshotV1.weights.length - 1);
    expect(decoded.snapshot.card_state).toEqual(snapshotV1.card_state);
    for (const row of decoded.setAside) expect(describeRecordProblem(row)).not.toMatch(CODE_NAME);
  });
});

describe('profile, targets and settings in a rescue copy (data-loss and health-rules reviews)', () => {
  it('a failing field that is not a safety setting is put back to its default and listed', () => {
    const tables = clone();
    Object.assign(first(tables, 'settings'), { theme: 'neon' });
    const decoded = decode(tables);
    expect(decoded.replacedFields).toEqual([{ table: 'settings', field: 'theme' }]);
    expect(decoded.snapshot.settings[0]?.theme).toBe('system');
    expect(decoded.setAside).toEqual([]);
  });

  it('a missing singleton row is replaced by the default row and listed as the whole record', () => {
    const tables = clone();
    tables['profile'] = [];
    const decoded = decode(tables);
    expect(decoded.replacedFields).toEqual([{ table: 'profile', field: '' }]);
    expect(decoded.snapshot.profile).toHaveLength(1);
  });

  it.each([
    ['targets', { energyFloorKj: 3000 }, 'energyFloorKj'],
    ['targets', { steadyDeficitPct: 25 }, 'steadyDeficitPct'],
    ['settings', { rapidLossThresholdGPerWeek: 1200 }, 'rapidLossThresholdGPerWeek'],
  ] as const)(
    'a failing safety setting (%s %o) refuses the copy instead of a default',
    (table, patch, field) => {
      const tables = clone();
      Object.assign(first(tables, table), patch);
      const error = refusal(tables);
      expect(error.code).toBe('invalid-record');
      expect(error.field).toBe(field);
      expect(error.rule).toBe('range');
      expect(error.message).toMatch(/Nothing was imported\.$/);
      expect(error.message).not.toMatch(CODE_NAME);
    },
  );
});

describe('bookkeeping instants dated after the export (health-rules review)', () => {
  const dismissedAt = (tables: Tables, value: string): void => {
    const card = rows(tables, 'card_state').find((c) => c['cardId'] === 'backup-reminder');
    if (card === undefined) throw new Error('fixture');
    card['dismissedAt'] = value;
  };

  it('a backup with a dismissal after its export time is refused, in plain words', () => {
    const tables = clone();
    dismissedAt(tables, '2001-03-02T00:00:00.000Z');
    const error = refusal(tables, 'backup');
    expect(error.code).toBe('invalid-record');
    expect(error.rule).toBe('future');
    expect(error.field).toBe('dismissedAt');
    expect(error.message).toContain(privacy.recordProblem.rules.future);
    expect(error.message).not.toMatch(CODE_NAME);
  });

  it('the tolerance is a few minutes: just inside it imports, one millisecond past it is refused', () => {
    const inside = clone();
    dismissedAt(inside, at(EXPORTED_MS + FUTURE_INSTANT_TOLERANCE_MS));
    expect(decode(inside, 'backup').setAside).toEqual([]);
    const outside = clone();
    dismissedAt(outside, at(EXPORTED_MS + FUTURE_INSTANT_TOLERANCE_MS + 1));
    expect(refusal(outside, 'backup').rule).toBe('future');
  });

  it('a rescue copy sets the row aside, and puts a future backup confirmation back to "none"', () => {
    const tables = clone();
    dismissedAt(tables, '2001-03-02T00:00:00.000Z');
    Object.assign(first(tables, 'settings'), { lastBackupAt: '2001-03-02T00:00:00.000Z' });
    const decoded = decode(tables);
    expect(decoded.setAside.map((r) => [r.table, r.field, r.rule])).toEqual([
      ['card_state', 'dismissedAt', 'future'],
    ]);
    expect(decoded.replacedFields).toEqual([{ table: 'settings', field: 'lastBackupAt' }]);
    expect(decoded.snapshot.settings[0]?.lastBackupAt).toBeNull();
  });

  it('a rescue copy whose rapid-loss explanation time is after the export is refused (a safety setting)', () => {
    const tables = clone();
    Object.assign(first(tables, 'settings'), {
      rapidLossThresholdGPerWeek: 800,
      rapidLossExplanationReadAt: '2001-03-02T00:00:00.000Z',
    });
    const error = refusal(tables);
    expect(error.code).toBe('invalid-record');
    expect(error.rule).toBe('future');
  });

  it('times that date a record, not bookkeeping, are not checked: a transfer sent "later" still imports', () => {
    const tables = clone();
    const sent = rows(tables, 'food_log').find((r) => typeof r['sentAt'] === 'string');
    if (sent !== undefined) sent['sentAt'] = '2001-03-02T00:00:00.000Z';
    expect(() => decode(tables, 'backup')).not.toThrow();
  });
});
