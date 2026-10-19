// Core-level backup tests over the version-1 fixture: the HS-15/BK-01 round trip (section 10.8),
// BK-02 (wrong password), C50 refusals (BK-06), unknown zones on import, and errors that carry no
// values (section 16 tests 16, 20 and 21, and the core part of 26 and 27).
import {
  BackupError,
  backupFileName,
  BACKUP_TABLES,
  createBackupFile,
  decodeBackupText,
  DEVICE_ONLY_TABLES,
  resolveZone,
  type Snapshot,
  sortByPrimaryKey,
  TABLES,
  validateSnapshot,
  webCrypto,
} from '@diet/core';
import { describe, expect, it } from 'vitest';
import { fixtureEnv, SYNTHETIC_PHRASE } from './env';
import { fixtureId, SNAPSHOT_V1_APP_VERSION, snapshotV1 } from './snapshotV1';

const EXPORTED_AT = '2000-03-02T00:00:00.000Z';
const ROOM_ID = 'AAAAAAAAAAAAAAAAAAAAAA';
const RELAY_URL = 'https://relay.example.com/room';

type Tables = Record<string, unknown[]>;
const clone = (s: Snapshot): Tables => structuredClone(s) as unknown as Tables;

/** S(db): every backed-up store in primary-key order (section 10.8). */
function stores(tables: Readonly<Record<string, readonly unknown[]>>): Tables {
  return Object.fromEntries(
    BACKUP_TABLES.map((name) => [name, sortByPrimaryKey(TABLES[name], tables[name] ?? [])]),
  );
}

async function deviceOnlyRows(): Promise<Tables> {
  const key = await webCrypto().subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, [
    'encrypt',
    'decrypt',
  ]);
  const bytes = new Uint8Array([0x5a, 0x5b, 0x5c, 0x5d, 0x5e, 0x5f, 0x60, 0x61]);
  return {
    transfer_pairings: [
      {
        id: 'singleton',
        relayUrl: RELAY_URL,
        roomId: ROOM_ID,
        key,
        pairedAt: '2000-01-01T00:00:00.000Z',
      },
    ],
    garden_photos: [
      {
        gardenId: fixtureId(901),
        mimeType: 'image/webp',
        bytes: bytes.buffer,
        width: 10,
        height: 10,
        takenAt: '2000-01-01T00:00:00.000Z',
      },
    ],
  };
}

async function exportFixture(
  password: string | null,
  tables: Readonly<Record<string, readonly unknown[]>> = snapshotV1,
) {
  return createBackupFile({
    tables,
    exportedAt: EXPORTED_AT,
    appVersion: SNAPSHOT_V1_APP_VERSION,
    password,
  });
}

async function refusal(promise: Promise<unknown>): Promise<BackupError> {
  try {
    await promise;
  } catch (error) {
    if (error instanceof BackupError) return error;
    throw error;
  }
  throw new Error('expected a BackupError');
}

describe('HS-15 / BK-01: every record round-trips exactly, except the device-only data (section 10.8)', () => {
  for (const locked of [false, true]) {
    it(`${locked ? 'locked' : 'plain'} file: export, then import, gives the same stores; no pairing or photo data in the file`, async () => {
      const device = await deviceOnlyRows();
      const file = await exportFixture(locked ? SYNTHETIC_PHRASE : null, {
        ...snapshotV1,
        ...device,
      });
      expect(file.locked).toBe(locked);

      // The owner answered Yes, so settings.lastBackupAt = exportedAt on both sides.
      const before = clone(snapshotV1);
      before.settings =
        before.settings?.map((s) => ({ ...(s as object), lastBackupAt: EXPORTED_AT })) ?? [];

      const decoded = await decodeBackupText(file.text, {
        password: locked ? SYNTHETIC_PHRASE : null,
        env: fixtureEnv(),
      });
      expect(stores(decoded.snapshot)).toStrictEqual(stores(before));
      expect(decoded.locked).toBe(locked);
      expect(decoded.changes).toEqual([]);
      expect(Object.keys(decoded.snapshot).sort()).toEqual([...BACKUP_TABLES].sort());
      for (const name of DEVICE_ONLY_TABLES)
        expect(Object.hasOwn(decoded.snapshot, name)).toBe(false);

      // Point 5: no room id, relay URL, photo bytes or device-only JSON keys in the file text.
      const photoBase64 = 'WltcXV5fYGE=';
      for (const needle of [
        ROOM_ID,
        RELAY_URL,
        photoBase64,
        'Z[\\]^_`a',
        '"bytes":',
        '"key":',
        '"roomId":',
        '"relayUrl":',
      ]) {
        expect(file.text.includes(needle), needle).toBe(false);
      }
    });
  }

  it('two exports of the same data differ only in exportedAt (plain)', async () => {
    const a = await createBackupFile({
      tables: snapshotV1,
      exportedAt: EXPORTED_AT,
      appVersion: '0.1.0',
      password: null,
    });
    const b = await createBackupFile({
      tables: snapshotV1,
      exportedAt: EXPORTED_AT,
      appVersion: '0.1.0',
      password: null,
    });
    expect(a.text).toBe(b.text);
    const later = await createBackupFile({
      tables: snapshotV1,
      exportedAt: '2000-03-03T00:00:00.000Z',
      appVersion: '0.1.0',
      password: null,
    });
    expect(later.text.replaceAll('2000-03-03T00:00:00.000Z', EXPORTED_AT)).toBe(a.text);
  });

  it('builds rows from the allow-list: a stray property never reaches the file', async () => {
    const tables = clone(snapshotV1);
    tables.weights = (tables.weights ?? []).map((w) => ({ ...(w as object), stray: 'zzsentinel' }));
    const file = await exportFixture(null, tables);
    expect(file.text).not.toContain('zzsentinel');
    expect(file.text).not.toContain('"stray"');
  });

  it('the file name carries the local date and the lock (section 10.1)', async () => {
    const file = await exportFixture(SYNTHETIC_PHRASE);
    expect(
      backupFileName(file.exportedAt, 'Pacific/Auckland', { locked: file.locked, kind: file.kind }),
    ).toBe('diet-backup-2000-03-02-locked.json');
  });
});

describe('BK-02: a wrong password fails cleanly and nothing is imported', () => {
  it('gives wrong-password-or-damaged, allows a retry with no lockout, and the right password then works', async () => {
    const file = await exportFixture(SYNTHETIC_PHRASE);
    for (const attempt of ['another synthetic phrase', 'a third synthetic phrase']) {
      const error = await refusal(
        decodeBackupText(file.text, { password: attempt, env: fixtureEnv() }),
      );
      expect(error.code).toBe('wrong-password-or-damaged');
      expect(error.message).toBe('Wrong password, or the file is damaged. Nothing was imported.');
    }
    const missing = await refusal(decodeBackupText(file.text, { env: fixtureEnv() }));
    expect(missing.code).toBe('wrong-password-or-damaged');
    const decoded = await decodeBackupText(file.text, {
      password: `  ${SYNTHETIC_PHRASE}  `,
      env: fixtureEnv(),
    });
    expect(decoded.snapshot.weights).toEqual(snapshotV1.weights);
  });
});

describe('BK-06 / C50: an out-of-range value refuses the whole file; nothing is ever clamped', () => {
  const cases: [string, (t: Tables) => void, string][] = [
    [
      'an energy floor of 3,000 kJ',
      (t) => {
        patchSingleton(t, 'targets', { energyFloorKj: 3000 });
      },
      'energyFloorKj',
    ],
    [
      'a Kickstart deficit of 50%',
      (t) => {
        patchSingleton(t, 'targets', { kickstartDeficitPct: 50 });
      },
      'kickstartDeficitPct',
    ],
    [
      'a Steady deficit of 25%',
      (t) => {
        patchSingleton(t, 'targets', { steadyDeficitPct: 25 });
      },
      'steadyDeficitPct',
    ],
    [
      'a protein maximum of 210 g',
      (t) => {
        patchSingleton(t, 'targets', { proteinRangeG: { min: 120, max: 210 } });
      },
      'proteinRangeG.max',
    ],
    [
      'a carb ceiling of 10 g',
      (t) => {
        patchSingleton(t, 'targets', { netCarbCeilingG: 10 });
      },
      'netCarbCeilingG',
    ],
    [
      'a moderate ceiling of 140 g',
      (t) => {
        patchSingleton(t, 'targets', { moderateNetCarbCeilingG: 140 });
      },
      'moderateNetCarbCeilingG',
    ],
    [
      'a rapid-loss threshold of 1,200 g',
      (t) => {
        patchSingleton(t, 'settings', { rapidLossThresholdGPerWeek: 1200 });
      },
      'rapidLossThresholdGPerWeek',
    ],
  ];

  function patchSingleton(t: Tables, table: string, patch: object): void {
    t[table] = (t[table] ?? []).map((row) => ({ ...(row as object), ...patch }));
  }

  for (const [label, mutate, field] of cases) {
    it(`refuses ${label}`, async () => {
      const tables = clone(snapshotV1);
      mutate(tables);
      const file = plainText(tables);
      const error = await refusal(decodeBackupText(file, { env: fixtureEnv() }));
      expect(error.code).toBe('invalid-record');
      expect(error.field).toBe(field);
      expect(error.rule).toBe('range');
      expect(error.message).toMatch(/Nothing was imported\.$/);
    });
  }

  it('refuses 3 extensions plus 1, and 49 Kickstart days', async () => {
    // The fixture's 42-day history: its stop-sign check becomes a second extension (49 days).
    const tables = clone(snapshotV1);
    const checks = tables.kickstart_checks as Record<string, unknown>[];
    const stopSign = checks.find((c) => c.outcome === 'stop-sign');
    if (stopSign === undefined) throw new Error('fixture');
    Object.assign(stopSign, {
      dizzyOnStanding: 'no',
      palpitations: 'no',
      crampsNotSettling: 'no',
      faintAtWork: 'no',
      outcome: 'extended',
    });
    const days = await refusal(decodeBackupText(plainText(tables), { env: fixtureEnv() }));
    expect(days.code).toBe('inconsistent');
    expect(days.rule).toBe('kickstart-days');

    const many = clone(snapshotV1);
    many.kickstart_periods = [
      {
        id: fixtureId(3001),
        startedAt: '2000-06-01T00:00:00.000Z',
        timeZone: 'UTC',
        endedAt: null,
        endedTimeZone: null,
        endReason: null,
      },
    ];
    // One period with an extension in each of its four windows (days 19, 26, 33 and 40).
    const asked = ['2000-06-19', '2000-06-26', '2000-07-03', '2000-07-10'];
    many.kickstart_checks = asked.map((date, e) => ({
      id: fixtureId(3010 + e),
      periodId: fixtureId(3001),
      askedAt: `${date}T12:00:00.000Z`,
      timeZone: 'UTC',
      dizzyOnStanding: 'no',
      palpitations: 'no',
      crampsNotSettling: 'no',
      faintAtWork: 'no',
      energyRating: null,
      sleepRating: null,
      outcome: 'extended',
    }));
    many.card_state = (many.card_state ?? []).filter(
      (c) => !(c as { trigger: string }).trigger.startsWith('period:'),
    );
    const extensions = await refusal(decodeBackupText(plainText(many), { env: fixtureEnv() }));
    expect(extensions.code).toBe('inconsistent');
    expect(extensions.rule).toBe('kickstart-extensions');
  });

  it('the floor and cap constants are bounds, never fields of any store', () => {
    const fieldNames = Object.values(TABLES).flatMap((spec) =>
      Object.keys((spec.row.desc as { fields?: object }).fields ?? {}),
    );
    for (const constantName of [
      'floorKj',
      'maxRaisedFloorKj',
      'kickstartMaxDeficitPct',
      'kickstartMaxTotalDays',
      'kickstartMaxExtensions',
    ]) {
      expect(fieldNames).not.toContain(constantName);
    }
  });
});

function plainText(tables: Readonly<Record<string, unknown>>, payloadPatch: object = {}): string {
  const payload = {
    schemaVersion: 1,
    kind: 'backup',
    exportedAt: EXPORTED_AT,
    appVersion: '0.1.0',
    tables,
    ...payloadPatch,
  };
  return JSON.stringify({
    format: ['diet', 'backup'].join('-'),
    version: 1,
    encrypted: false,
    payload,
  });
}

describe('unknown zones on import (section 16 test 20; C48, D6)', () => {
  it('imports records whose zone this Intl does not know, and reads them in the home zone with fallback', async () => {
    const zone = 'Example/Nowhere';
    const tables = clone(snapshotV1);
    tables.weights = (tables.weights ?? []).map((w) => ({ ...(w as object), timeZone: zone }));
    const decoded = await decodeBackupText(plainText(tables), { env: fixtureEnv() });
    const home = decoded.snapshot.settings[0]?.homeTimeZone ?? null;
    for (const w of decoded.snapshot.weights) {
      expect(w.timeZone).toBe(zone);
      expect(resolveZone(w.timeZone, home)).toEqual({
        timeZone: 'Pacific/Auckland',
        fallback: true,
      });
    }
  });
});

describe('errors carry no values (section 2.3; section 16 test 21, import and validator paths)', () => {
  const SENTINELS = ['123.456', 'zzsentinel', '2000-02-29'];

  function expectClean(error: unknown): void {
    expect(error).toBeInstanceOf(Error);
    const e = error as Error;
    const texts = [e.message, String(e), e.stack ?? '', JSON.stringify(e)];
    for (const text of texts) for (const s of SENTINELS) expect(text, s).not.toContain(s);
    expect(e.cause).toBeUndefined();
  }

  it('an out-of-range weight, a bad note and a bad day-note key never appear in the import error', async () => {
    const variants: ((t: Tables) => void)[] = [
      (t) => {
        t.weights = [{ ...(t.weights?.[0] as object), kg: 123.456 * 10 }];
      },
      (t) => {
        t.weights = [{ ...(t.weights?.[0] as object), note: ' zzsentinel' }];
      },
      (t) => {
        t.alcohol_day_notes = [
          { ...(t.alcohol_day_notes?.[0] as object), date: '2000-02-29', note: null },
        ];
      },
      (t) => {
        t.alcohol_day_notes = [
          { ...(t.alcohol_day_notes?.[0] as object), date: '2000-02-29' },
          { ...(t.alcohol_day_notes?.[0] as object), date: '2000-02-29' },
        ];
      },
      (t) => {
        t.weights = [{ ...(t.weights?.[0] as object), zzsentinel: 123.456 }];
      },
    ];
    for (const mutate of variants) {
      const tables = clone(snapshotV1);
      mutate(tables);
      expectClean(await refusal(decodeBackupText(plainText(tables), { env: fixtureEnv() })));
    }
    // A store name read from the file is never echoed either.
    const extra = { ...clone(snapshotV1), zzsentinel: [] };
    expectClean(await refusal(decodeBackupText(plainText(extra), { env: fixtureEnv() })));
  });

  it('validateSnapshot and checkInvariants errors name only the table, field and rule', () => {
    const tables = clone(snapshotV1);
    tables.weights = [{ ...(tables.weights?.[0] as object), kg: 1234.56, note: 'zzsentinel' }];
    let caught: unknown;
    try {
      validateSnapshot(tables);
    } catch (error) {
      caught = error;
    }
    expectClean(caught);
    expect(Object.keys(caught as object).sort()).toEqual(['field', 'rule', 'table']);
  });
});
