// Importing a rescue copy (storage spec sections 9.5 and 10.6; D22, D23, D27; the data-loss and
// health-rules reviews), and bookkeeping instants dated after the export (health-rules review),
// over the version-1 fixture.
import {
  BackupError,
  checkBackupPayload,
  type DecodedBackup,
  describeRecordProblem,
  FUTURE_INSTANT_TOLERANCE_MS,
  type LooseSnapshot,
  type Migration,
  TABLES_V1,
} from '@diet/core';
import { privacy } from '@diet/core/copy/health';
import { describe, expect, it } from 'vitest';
import { fixtureEnv } from './env';
import { fixtureId, snapshotV1 } from './snapshotV1';
import { V1 } from './testChains';

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

/** This phone's clock: a day after the export, so the limit is the export time plus 5 minutes. */
const NOW = '2000-03-03T00:00:00.000Z';

function decode(
  tables: Tables,
  kind: 'backup' | 'rescue' = 'rescue',
  options: { now?: string; chain?: readonly Migration[] } = {},
): DecodedBackup {
  return checkBackupPayload(
    { schemaVersion: 1, kind, exportedAt: EXPORTED_AT, appVersion: '0.1.0', tables },
    fixtureEnv(options.now ?? NOW),
    options.chain === undefined ? {} : { chain: options.chain },
  );
}

function refusal(
  tables: Tables,
  kind: 'backup' | 'rescue' = 'rescue',
  options: { now?: string; chain?: readonly Migration[] } = {},
): BackupError {
  try {
    decode(tables, kind, options);
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
    expect(error.code).toBe('invalid-record');
    expect(error.rule).toBe('kickstart-history');
    expect(error.message).toBe(
      privacy.kickstartHistory.replace('{record}', `${privacy.storeNames[table]}, record 1`),
    );
    expect(error.message).not.toMatch(CODE_NAME);
  });

  it('a Kickstart row that fails only after migration (step 8) refuses the copy too; a backup is refused as a record', () => {
    // A test-only version 2 whose step leaves every check with an energy rating of 99.
    const chain: readonly Migration[] = [
      V1,
      {
        version: 2,
        stores: {},
        backup: { added: [], removed: [], deviceOnly: [] },
        specs: TABLES_V1,
        reads: ['kickstart_checks'],
        rewrites: ['kickstart_checks'],
        removesRows: [],
        upgrade: (snapshot: LooseSnapshot) => ({
          snapshot: {
            ...snapshot,
            kickstart_checks: (snapshot['kickstart_checks'] ?? []).map((c) => ({
              ...(c as Row),
              energyRating: 99,
            })),
          },
          changes: [],
        }),
      },
    ];
    const rescue = refusal(clone(), 'rescue', { chain });
    expect(rescue.code).toBe('invalid-record');
    expect(rescue.rule).toBe('kickstart-history');
    expect(rescue.table).toBe('kickstart_checks');
    const backup = refusal(clone(), 'backup', { chain });
    expect([backup.code, backup.table, backup.field, backup.rule]).toEqual([
      'invalid-record',
      'kickstart_checks',
      'energyRating',
      'range',
    ]);
  });

  it('a duplicate id in the Kickstart history refuses the copy instead of dropping a period', () => {
    const tables = clone();
    tables['kickstart_periods'] = [
      ...rows(tables, 'kickstart_periods'),
      { ...first(tables, 'kickstart_periods') },
    ];
    expect(refusal(tables).rule).toBe('kickstart-history');
  });

  it('a Kickstart start or check dated after the export (or after this phone\u2019s clock) refuses the whole history; a fast is set aside', () => {
    const late = at(EXPORTED_MS + FUTURE_INSTANT_TOLERANCE_MS + 1);
    for (const [table, field] of [
      ['kickstart_periods', 'startedAt'],
      ['kickstart_checks', 'askedAt'],
    ] as const) {
      const tables = clone();
      const row = rows(tables, table).at(-1);
      if (row === undefined) throw new Error('fixture');
      row[field] = late;
      if (table === 'kickstart_periods') {
        // A start dated ahead, on its own: no checks, no end.
        tables['kickstart_checks'] = [];
      }
      expect(refusal(tables).rule).toBe('kickstart-history');
      const backup = refusal(tables, 'backup');
      expect([backup.code, backup.field, backup.rule]).toEqual(['invalid-record', field, 'future']);
    }
    // The phone's clock is the limit when it is behind the export time.
    const behind = clone();
    const period = rows(behind, 'kickstart_periods').at(-1);
    if (period === undefined) throw new Error('fixture');
    period['startedAt'] = '2000-02-20T00:00:00.000Z';
    behind['kickstart_checks'] = [];
    expect(refusal(behind, 'rescue', { now: '2000-02-10T00:00:00.000Z' }).rule).toBe(
      'kickstart-history',
    );
    const fasts = clone();
    const fast = rows(fasts, 'fasts').find((f) => f['endedAt'] === null);
    if (fast === undefined) throw new Error('fixture');
    fast['startedAt'] = late;
    const decoded = decode(fasts);
    expect(decoded.setAside.map((r) => [r.table, r.field, r.rule])).toEqual([
      ['fasts', 'startedAt', 'future'],
    ]);
    expect(refusal(fasts, 'backup').field).toBe('startedAt');
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

  it.each(['profile', 'targets', 'settings'] as const)(
    'a %s store that is empty, holds two rows or a row that is not an object refuses the copy (no default row)',
    (table) => {
      for (const list of [[], [first(clone(), table), first(clone(), table)], [null]]) {
        const tables = clone();
        tables[table] = list as Row[];
        const error = refusal(tables);
        expect(error.message).toMatch(/Nothing was imported\.$/);
        expect(error.message).not.toMatch(CODE_NAME);
      }
    },
  );

  it.each([
    ['targets', 'kickstartDeficitPct'],
    ['targets', 'energyFloorKj'],
    ['settings', 'rapidLossThresholdGPerWeek'],
    ['settings', 'alcoholGuidanceSet'],
    ['profile', 'dietMode'],
  ] as const)(
    'a missing safety setting (%s %s) refuses the copy instead of the default',
    (table, field) => {
      const tables = clone();
      Reflect.deleteProperty(first(tables, table), field);
      const error = refusal(tables);
      expect([error.code, error.table, error.field, error.rule]).toEqual([
        'invalid-record',
        table,
        field,
        'missing',
      ]);
    },
  );

  it('a failing Kickstart choice becomes "no", and a failing allergen list keeps every entry it can read', () => {
    const tables = clone();
    Object.assign(first(tables, 'profile'), {
      kickstartOptIn: 'false',
      allergens: ['peanut', 'gluten', 'example-unknown', 'peanut'],
    });
    const decoded = decode(tables);
    expect(decoded.snapshot.profile[0]).toMatchObject({
      kickstartOptIn: false,
      allergens: ['peanut', 'gluten'],
    });
    expect(decoded.replacedFields).toEqual([
      { table: 'profile', field: 'kickstartOptIn' },
      { table: 'profile', field: 'allergens' },
    ]);
  });

  it.each([
    ['targets', { energyFloorKj: 3000 }, 'energyFloorKj'],
    ['targets', { steadyDeficitPct: 25 }, 'steadyDeficitPct'],
    ['settings', { rapidLossThresholdGPerWeek: 1200 }, 'rapidLossThresholdGPerWeek'],
    ['settings', { alcoholGuidanceSet: 'nz-woman' }, 'alcoholGuidanceSet'],
    ['profile', { dietMode: 'Balanced' }, 'dietMode'],
  ] as const)(
    'a failing safety setting (%s %o) refuses the copy instead of a default',
    (table, patch, field) => {
      const tables = clone();
      Object.assign(first(tables, table), patch);
      const error = refusal(tables);
      expect(error.code).toBe('invalid-record');
      expect(error.field).toBe(field);
      expect(error.rule).toBe(
        table === 'targets' || field === 'rapidLossThresholdGPerWeek' ? 'range' : 'enum',
      );
      expect(error.message).toMatch(/Nothing was imported\.$/);
      expect(error.message).not.toMatch(CODE_NAME);
    },
  );
});

describe('bookkeeping instants dated after the export or this phone\u2019s clock are put back, not refused (health-rules review)', () => {
  const dismissedAt = (tables: Tables, value: string): void => {
    const card = rows(tables, 'card_state').find((c) => c['cardId'] === 'backup-reminder');
    if (card === undefined) throw new Error('fixture');
    card['dismissedAt'] = value;
  };
  const limit = at(EXPORTED_MS + FUTURE_INSTANT_TOLERANCE_MS);

  it('a backup with a dismissal after its export time imports, with the dismissal at the limit', () => {
    const tables = clone();
    dismissedAt(tables, '2001-03-02T00:00:00.000Z');
    const decoded = decode(tables, 'backup');
    const card = decoded.snapshot.card_state.find((c) => c.cardId === 'backup-reminder');
    expect(card?.dismissedAt).toBe(limit);
    expect(decoded.setAside).toEqual([]);
  });

  it('the tolerance is a few minutes: just inside it is kept as it is, one millisecond past it is put back', () => {
    const inside = clone();
    dismissedAt(inside, limit);
    const kept = decode(inside, 'backup').snapshot.card_state;
    expect(kept.find((c) => c.cardId === 'backup-reminder')?.dismissedAt).toBe(limit);
    const outside = clone();
    dismissedAt(outside, at(EXPORTED_MS + FUTURE_INSTANT_TOLERANCE_MS + 1));
    const back = decode(outside, 'backup').snapshot.card_state;
    expect(back.find((c) => c.cardId === 'backup-reminder')?.dismissedAt).toBe(limit);
  });

  it('this phone\u2019s clock is the limit when it is behind the export time', () => {
    const tables = clone();
    dismissedAt(tables, '2000-03-01T12:00:00.000Z');
    const decoded = decode(tables, 'backup', { now: '2000-03-01T00:00:00.000Z' });
    expect(
      decoded.snapshot.card_state.find((c) => c.cardId === 'backup-reminder')?.dismissedAt,
    ).toBe(at(Date.parse('2000-03-01T00:00:00.000Z') + FUTURE_INSTANT_TOLERANCE_MS));
  });

  it('a rescue copy keeps every row: a future dismissal, backup confirmation, explanation time and carb-ceiling start are put back to the limit, never to "none"', () => {
    const tables = clone();
    dismissedAt(tables, '2001-03-02T00:00:00.000Z');
    Object.assign(first(tables, 'settings'), {
      lastBackupAt: '2001-03-02T00:00:00.000Z',
      rapidLossThresholdGPerWeek: 800,
      rapidLossExplanationReadAt: '2001-03-02T00:00:00.000Z',
    });
    Object.assign(first(tables, 'profile'), {
      carbCeilingStartedAt: '2001-03-02T00:00:00.000Z',
      updatedAt: '2001-03-02T00:00:00.000Z',
    });
    const decoded = decode(tables);
    expect(decoded.setAside).toEqual([]);
    expect(decoded.replacedFields).toEqual([]);
    expect(decoded.snapshot.settings[0]).toMatchObject({
      lastBackupAt: limit,
      rapidLossThresholdGPerWeek: 800,
      rapidLossExplanationReadAt: limit,
    });
    expect(decoded.snapshot.profile[0]?.carbCeilingStartedAt).toBe(limit);
  });

  it('times that date a record, not bookkeeping, are not checked: a transfer sent "later" still imports', () => {
    const tables = clone();
    const sent = rows(tables, 'food_log').find((r) => typeof r['sentAt'] === 'string');
    if (sent !== undefined) sent['sentAt'] = '2001-03-02T00:00:00.000Z';
    expect(() => decode(tables, 'backup')).not.toThrow();
  });
});
