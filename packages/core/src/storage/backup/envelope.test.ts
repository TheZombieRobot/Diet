// The envelope, payload and import refusals (section 10.6; BK-05), the rescue copy (section 9.5;
// BK-10 at the core level) and file names (section 10.1; C89). Section 16 test 15.
import { describe, expect, it } from 'vitest';
import { defaultSnapshot } from '../defaults';
import { MAX_BACKUP_FILE_BYTES } from '../limits';
import { SCHEMA_VERSION, type MigrationEnv } from '../migrations';
import { BACKUP_TABLES } from '../tables';
import {
  checkBackupPayload,
  decodeBackupText,
  importConfirmation,
  newestInstantOf,
  parseBackupText,
  utf8ByteLength,
} from './decode';
import { buildBackupPayload, createBackupFile, createRescueFile, plainBackupText } from './encode';
import { BackupError, BackupExportError } from './errors';
import { backupFileName, exportFileName } from './fileName';

const id = (n: number) => `00000000-0000-4000-8000-${n.toString(16).padStart(12, '0')}`;
let counter = 0;
const env: MigrationEnv = {
  now: '2000-01-01T00:00:00.000Z',
  timeZone: 'Pacific/Auckland',
  randomId: () => id(++counter),
};
const PHRASE = 'synthetic example phrase for tests';
const EXPORTED_AT = '2000-01-02T00:00:00.000Z';
const snapshot = defaultSnapshot(env);
const payload = buildBackupPayload(snapshot, {
  kind: 'backup',
  exportedAt: EXPORTED_AT,
  appVersion: '0.1.0',
});

type Json = Record<string, unknown>;
const envelope = (patch: Json = {}, payloadPatch: Json = {}): string =>
  JSON.stringify({
    format: ['diet', 'backup'].join('-'),
    version: 1,
    encrypted: false,
    payload: { ...payload, ...payloadPatch },
    ...patch,
  });

async function refusal(text: string, sizeBytes: number | null = null): Promise<BackupError> {
  try {
    await decodeBackupText(text, { env, sizeBytes });
  } catch (error) {
    if (error instanceof BackupError) return error;
    throw error;
  }
  throw new Error('expected a BackupError');
}
const codeOf = async (text: string) => (await refusal(text)).code;

describe('the plain envelope (sections 10.2 and 10.6; section 16 test 15)', () => {
  it('round-trips, with format first and every backed-up store present', async () => {
    const text = plainBackupText(payload);
    expect(Object.keys(JSON.parse(text) as Json)).toEqual([
      'format',
      'version',
      'encrypted',
      'payload',
    ]);
    expect(Object.keys(payload.tables)).toEqual([...BACKUP_TABLES]);
    expect(payload.tables.weights).toEqual([]);
    const decoded = await decodeBackupText(text, { env });
    expect(decoded).toMatchObject({
      kind: 'backup',
      schemaVersion: 1,
      exportedAt: EXPORTED_AT,
      appVersion: '0.1.0',
      locked: false,
    });
    expect(decoded.snapshot.profile).toEqual(snapshot.profile);
    expect(decoded.snapshot.beverages).toEqual(snapshot.beverages);
  });

  it('refuses a wrong format, and anything that is not a backup', async () => {
    expect(await codeOf(envelope({ format: 'other-backup' }))).toBe('not-a-backup');
    expect(await codeOf('not json')).toBe('not-a-backup');
    expect(await codeOf('[1]')).toBe('not-a-backup');
    expect(await codeOf('null')).toBe('not-a-backup');
    expect(await codeOf(JSON.stringify({ version: 1 }))).toBe('not-a-backup');
  });

  it('refuses envelope versions 2 (newer), 0, "1" and 1.5 (unsupported)', async () => {
    expect(await codeOf(envelope({ version: 2 }))).toBe('newer-version');
    for (const version of [0, '1', 1.5, null, -1]) {
      expect(await codeOf(envelope({ version })), String(version)).toBe('unsupported-version');
    }
  });

  it('refuses a missing or non-boolean encrypted flag and any extra envelope key as damaged', async () => {
    expect(await codeOf(envelope({ encrypted: 'false' }))).toBe('damaged');
    expect(await codeOf(envelope({ extra: 1 }))).toBe('damaged');
  });

  it('refuses a file over 50 MiB as too large before parsing', async () => {
    expect((await refusal('{}', MAX_BACKUP_FILE_BYTES + 1)).code).toBe('too-large');
    expect(utf8ByteLength('aé€😀')).toBe(1 + 2 + 3 + 4);
  });

  it('refuses a schemaVersion newer than this app, and one that is not a whole number from 1', async () => {
    const newer = await refusal(envelope({}, { schemaVersion: SCHEMA_VERSION + 1 }));
    expect(newer.code).toBe('newer-version');
    expect(newer.message).toBe(
      'This backup was made by a newer version of the app. Open the app online to update it, then try again.',
    );
    for (const schemaVersion of [0, '1', 1.5]) {
      expect(await codeOf(envelope({}, { schemaVersion })), String(schemaVersion)).toBe(
        'unsupported-version',
      );
    }
  });

  it('a newer file whose payload has a new shape is still newer-version, so it is kept, not thrown away as damaged (data-loss review)', async () => {
    const reshaped = envelope({}, { schemaVersion: SCHEMA_VERSION + 1, laterKey: 1 });
    expect(await codeOf(reshaped)).toBe('newer-version');
    const noTables = JSON.parse(envelope({}, { schemaVersion: SCHEMA_VERSION + 1 })) as {
      payload: Record<string, unknown>;
    };
    delete noTables.payload['tables'];
    expect(await codeOf(JSON.stringify(noTables))).toBe('newer-version');
  });

  it('a backup cut short (it starts like one but does not parse) is damaged, not "not a backup" (data-loss review)', async () => {
    const whole = envelope();
    for (const keep of [30, Math.floor(whole.length / 2), whole.length - 1]) {
      expect(await codeOf(whole.slice(0, keep)), String(keep)).toBe('damaged');
    }
    expect(await codeOf('{"example":')).toBe('not-a-backup');
    expect(await codeOf('not json')).toBe('not-a-backup');
  });

  it('refuses a missing or unknown kind, a non-canonical exportedAt and a bad appVersion as damaged', async () => {
    const withoutKind: Record<string, unknown> = { ...payload };
    Reflect.deleteProperty(withoutKind, 'kind');
    expect(
      await codeOf(
        JSON.stringify({
          format: ['diet', 'backup'].join('-'),
          version: 1,
          encrypted: false,
          payload: withoutKind,
        }),
      ),
    ).toBe('damaged');
    expect(await codeOf(envelope({}, { kind: 'snapshot' }))).toBe('damaged');
    expect(await codeOf(envelope({}, { exportedAt: '2000-01-02T00:00:00Z' }))).toBe('damaged');
    expect(await codeOf(envelope({}, { appVersion: 'v1' }))).toBe('damaged');
    expect(await codeOf(envelope({}, { appVersion: `1.0.0-${'a'.repeat(35)}` }))).toBe('damaged');
    expect(await codeOf(envelope({}, { extra: 1 }))).toBe('damaged');
    expect(await codeOf(envelope({}, { tables: [] }))).toBe('damaged');
  });

  it('refuses a missing store, an extra store, a device-only store and a non-array table as invalid-record', async () => {
    const missing: Record<string, unknown> = { ...payload.tables };
    Reflect.deleteProperty(missing, 'weights');
    const missingError = await refusal(envelope({}, { tables: missing }));
    expect([missingError.code, missingError.table, missingError.rule]).toEqual([
      'invalid-record',
      'weights',
      'missing',
    ]);

    const extra = await refusal(envelope({}, { tables: { ...payload.tables, notes: [] } }));
    expect([extra.code, extra.table, extra.rule]).toEqual(['invalid-record', null, 'extra-key']);

    const device = await refusal(
      envelope({}, { tables: { ...payload.tables, transfer_pairings: [] } }),
    );
    expect([device.code, device.table, device.rule]).toEqual([
      'invalid-record',
      'transfer_pairings',
      'extra-key',
    ]);

    const notArray = await refusal(envelope({}, { tables: { ...payload.tables, weights: {} } }));
    expect([notArray.code, notArray.table, notArray.rule]).toEqual([
      'invalid-record',
      'weights',
      'type',
    ]);

    const proto = await refusal(envelope().replace('"tables":{', '"tables":{"__proto__":[],'));
    expect([proto.code, proto.table]).toEqual(['invalid-record', null]);
  });

  it('refuses a row that fails its version’s specs, naming store, position, field and rule (never the value)', async () => {
    const bad = {
      ...payload.tables,
      weights: [
        { id: id(1), at: EXPORTED_AT, timeZone: 'UTC', kg: 401, source: 'manual', note: null },
      ],
    };
    const error = await refusal(envelope({}, { tables: bad }));
    expect([error.code, error.table, error.index, error.field, error.rule]).toEqual([
      'invalid-record',
      'weights',
      0,
      'kg',
      'range',
    ]);
    expect(error.message).toBe(
      'The backup has a record this app cannot accept: Weigh-ins, record 1: the weight is outside the allowed range (20–400). Nothing was imported.',
    );
  });

  it('refuses records that do not fit together as inconsistent', async () => {
    const twoSettings = {
      ...payload.tables,
      settings: [...(payload.tables.settings ?? []), ...(payload.tables.settings ?? [])],
    };
    const error = await refusal(envelope({}, { tables: twoSettings }));
    expect([error.code, error.rule]).toEqual(['inconsistent', 'singleton']);
  });

  it('parses the plain envelope without touching anything else', () => {
    const parsed = parseBackupText(plainBackupText(payload));
    expect(parsed.encrypted).toBe(false);
  });
});

describe('the export self-check and the unchecked copy (section 10.5; D22)', () => {
  it('a corrupted row makes export refuse, naming the table, field and rule; the unchecked copy is a locked rescue file', async () => {
    const corrupted = {
      ...snapshot,
      weights: [
        { id: id(1), at: EXPORTED_AT, timeZone: 'UTC', kg: 5, source: 'manual', note: null },
      ],
    };
    let caught: unknown;
    try {
      await createBackupFile({
        tables: corrupted,
        exportedAt: EXPORTED_AT,
        appVersion: '0.1.0',
        password: null,
      });
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(BackupExportError);
    const e = caught as BackupExportError;
    expect([e.code, e.table, e.field, e.rule]).toEqual([
      'self-check-failed',
      'weights',
      'kg',
      'range',
    ]);
    expect(e.message).toBe(
      'The backup could not be checked: Weigh-ins, record 1: the weight is outside the allowed range (20–400).',
    );

    const rescue = await createRescueFile({
      tables: corrupted,
      schemaVersion: SCHEMA_VERSION,
      exportedAt: EXPORTED_AT,
      appVersion: '0.1.0',
      password: PHRASE,
    });
    expect(rescue).toMatchObject({ kind: 'rescue', locked: true });
    expect(backupFileName(rescue.exportedAt, 'Pacific/Auckland', rescue)).toBe(
      'diet-backup-2000-01-02-rescue-locked.json',
    );
    const decoded = await decodeBackupText(rescue.text, { password: PHRASE, env });
    expect(decoded.kind).toBe('rescue');
    expect(decoded.setAside).toEqual([
      { table: 'weights', index: 0, field: 'kg', rule: 'range', allowed: '20–400' },
    ]);
    expect(decoded.snapshot.weights).toEqual([]);
    expect(decoded.snapshot.settings[0]?.lastBackupAt).toBeNull(); // a rescue copy never records a backup
  });
});

describe('the rescue copy (section 9.5; D23)', () => {
  it('builds rows from the version’s allow-list alone, writes a missing store as [] and never writes device-only stores', async () => {
    const raw = {
      ...snapshot,
      weights: [
        {
          id: id(2),
          at: EXPORTED_AT,
          timeZone: 'UTC',
          kg: 80,
          source: 'manual',
          note: null,
          leaked: 'zzsentinel',
        },
      ],
      transfer_pairings: [{ id: 'singleton', roomId: 'zzroom' }],
      garden_photos: [{ gardenId: id(3), bytes: new ArrayBuffer(3) }],
      audit: undefined,
    };
    const file = await createRescueFile({
      tables: raw,
      schemaVersion: 1,
      exportedAt: EXPORTED_AT,
      appVersion: '0.1.0',
      password: null,
    });
    expect(file.text).not.toContain('zzsentinel');
    expect(file.text).not.toContain('zzroom');
    expect(file.text).not.toContain('"bytes":');
    const tables = (JSON.parse(file.text) as { payload: { tables: Record<string, unknown[]> } })
      .payload.tables;
    expect(tables.audit).toEqual([]);
    expect(Object.keys(tables)).toEqual([...BACKUP_TABLES]);
    const decoded = await decodeBackupText(file.text, { env });
    expect(decoded.snapshot.weights).toHaveLength(1);
    expect(decoded.setAside).toEqual([]);
  });

  it('puts back to their defaults only the singleton fields it cannot keep, and lists them', () => {
    const profile = {
      ...(payload.tables.profile?.[0] as object),
      heightCm: 'tall',
      householdSize: 3,
    };
    const tables = { ...payload.tables, profile: [profile] };
    const decoded = checkBackupPayload({ ...payload, kind: 'rescue', tables }, env);
    expect(decoded.replacedFields).toEqual([{ table: 'profile', field: 'heightCm' }]);
    expect(decoded.setAside).toEqual([]);
    expect(decoded.snapshot.profile[0]?.heightCm).toBeNull();
    expect(decoded.snapshot.profile[0]?.householdSize).toBe(3);
  });
});

describe('file names (section 10.1; C89; D18)', () => {
  it('uses the local date of the export in the device zone', () => {
    // 08:00 on 2 January in Auckland, still 1 January in UTC.
    expect(
      backupFileName('2000-01-01T19:00:00.000Z', 'Pacific/Auckland', {
        locked: false,
        kind: 'backup',
      }),
    ).toBe('diet-backup-2000-01-02.json');
    // 23:30 on 1 January in Auckland.
    expect(
      backupFileName('2000-01-01T10:30:00.000Z', 'Pacific/Auckland', {
        locked: false,
        kind: 'backup',
      }),
    ).toBe('diet-backup-2000-01-01.json');
  });

  it('names locked and rescue files, and later exports, through the one helper', () => {
    const at = '2000-01-01T10:30:00.000Z';
    expect(backupFileName(at, 'Pacific/Auckland', { locked: true, kind: 'backup' })).toBe(
      'diet-backup-2000-01-01-locked.json',
    );
    expect(backupFileName(at, 'Pacific/Auckland', { locked: false, kind: 'rescue' })).toBe(
      'diet-backup-2000-01-01-rescue.json',
    );
    expect(backupFileName(at, 'Example/Nowhere', { locked: true, kind: 'rescue' })).toBe(
      'diet-backup-2000-01-01-rescue-locked.json',
    );
    expect(exportFileName('gp-summary-csv', '2000-01-01')).toBe('diet-gp-summary-2000-01-01.csv');
    expect(exportFileName('gp-summary-txt', '2000-01-01')).toBe('diet-gp-summary-2000-01-01.txt');
    expect(exportFileName('grocery-list-csv', '2000-01-01')).toBe(
      'diet-grocery-list-2000-01-01.csv',
    );
    expect(exportFileName('grocery-list-json', '2000-01-01')).toBe(
      'diet-grocery-list-2000-01-01.json',
    );
    expect(() => exportFileName('gp-summary-csv', '2000-02-30')).toThrow(RangeError);
  });
});

describe('the import confirmation (section 10.6 step 9; D17)', () => {
  const phoneWeight = (n: number, at: string, kg = 80) => ({
    id: id(n),
    at,
    timeZone: 'UTC',
    kg,
    source: 'manual' as const,
    note: null,
  });

  it('counts phone records missing from the file and records changed after the export, and defaults to exporting first', () => {
    const file = {
      snapshot: {
        ...snapshot,
        weights: [
          phoneWeight(1, '2000-01-01T05:00:00.000Z'),
          phoneWeight(2, '2000-01-01T06:00:00.000Z'),
        ],
      },
      exportedAt: EXPORTED_AT,
    };
    const phone = {
      ...snapshot,
      weights: [
        phoneWeight(1, '2000-01-01T05:00:00.000Z'), // the same as the file
        phoneWeight(2, '2000-01-03T06:00:00.000Z', 81), // changed after the export
        phoneWeight(3, '2000-01-01T07:00:00.000Z'), // not in the file
      ],
    };
    expect(importConfirmation(phone, file)).toEqual({
      missingFromFile: 1,
      differFromFile: 1,
      phoneNewest: '2000-01-03T06:00:00.000Z',
      fileNewest: '2000-01-01T06:00:00.000Z',
      phoneHasOwnRecords: true,
      exportFirst: true,
    });
  });

  it('a phone that matches the file, with nothing newer, makes Replace the default', () => {
    const tables = { ...snapshot, weights: [phoneWeight(1, '2000-01-01T05:00:00.000Z')] };
    const settingsWithBackup = {
      ...tables,
      settings: tables.settings.map((s) => ({ ...s, lastBackupAt: '2000-02-01T00:00:00.000Z' })),
    };
    expect(
      importConfirmation(settingsWithBackup, { snapshot: tables, exportedAt: EXPORTED_AT }),
    ).toMatchObject({
      missingFromFile: 0,
      differFromFile: 0,
      exportFirst: false,
    });
    expect(newestInstantOf({ lastBackupAt: '2000-02-01T00:00:00.000Z' })).toBeNull();
  });
});
