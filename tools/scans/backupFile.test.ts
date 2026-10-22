import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  buildBackupPayload,
  createBackupFile,
} from '../../packages/core/src/storage/backup/encode';
import {
  backupFileName,
  exportFileName,
  type ExportFileKind,
} from '../../packages/core/src/storage/backup/fileName';
import { defaultSnapshot } from '../../packages/core/src/storage/defaults';
import { SCHEMA_VERSION } from '../../packages/core/src/storage/migrations';
import { personalDataRules, personalPathRules } from './rules';
import { gitEnv, scanPath, scanText } from './scan';

// BK-08 / C89 (storage spec section 16 test 46): every name the app gives a saved file is ignored
// by git, a generated backup (plain and locked) trips the backup-marker content rule, and backup
// names trip the backup-file path rule. Nothing here is written to disk.
const root = resolve(import.meta.dirname, '../..');
const env = {
  now: '2000-01-01T00:00:00.000Z',
  randomId: () => '00000000-0000-4000-8000-000000000001',
};
const AT = '2000-01-01T10:30:00.000Z';

const backupNames = [
  backupFileName(AT, 'Pacific/Auckland', { locked: false, kind: 'backup' }),
  backupFileName(AT, 'Pacific/Auckland', { locked: true, kind: 'backup' }),
  backupFileName(AT, 'Pacific/Auckland', { locked: false, kind: 'rescue' }),
  backupFileName(AT, 'Pacific/Auckland', { locked: true, kind: 'rescue' }),
];
const withDuplicateSuffix = backupNames.map((n) => n.replace(/\.json$/, ' (1).json'));
const exportKinds: ExportFileKind[] = [
  'gp-summary-csv',
  'gp-summary-txt',
  'grocery-list-csv',
  'grocery-list-json',
];
const exportNames = exportKinds.map((kind) => exportFileName(kind, '2000-01-01'));

function ignored(path: string): boolean {
  try {
    execFileSync('git', ['check-ignore', '--no-index', '-q', path], { cwd: root, env: gitEnv() });
    return true;
  } catch {
    return false;
  }
}

describe('BK-08 / C89: saved files never reach the public repository', () => {
  it('names the four backup variants as section 10.1 says', () => {
    expect(backupNames).toEqual([
      'diet-backup-2000-01-01.json',
      'diet-backup-2000-01-01-locked.json',
      'diet-backup-2000-01-01-rescue.json',
      'diet-backup-2000-01-01-rescue-locked.json',
    ]);
  });

  it.each([...backupNames, ...withDuplicateSuffix, ...exportNames])(
    '%s is ignored by git, at the root and in a subfolder',
    (name) => {
      expect(ignored(name)).toBe(true);
      expect(ignored(`some/folder/${name}`)).toBe(true);
    },
  );

  it.each([...backupNames, ...withDuplicateSuffix])(
    '%s trips the backup-file path rule',
    (name) => {
      expect(scanPath(name, 100, personalPathRules).map((v) => v.ruleId)).toContain('backup-file');
    },
  );

  it('a plain and a locked backup, generated at run time, both trip the backup-marker content rule', async () => {
    const tables = defaultSnapshot(env);
    const plain = await createBackupFile({
      tables,
      exportedAt: AT,
      appVersion: '0.1.0',
      password: null,
    });
    const locked = await createBackupFile({
      tables,
      exportedAt: AT,
      appVersion: '0.1.0',
      password: 'synthetic example phrase for tests',
    });
    for (const file of [plain, locked]) {
      expect(
        scanText(backupFileName(AT, 'UTC', file), file.text, personalDataRules).map(
          (v) => v.ruleId,
        ),
      ).toContain('backup-marker');
    }
    expect(
      buildBackupPayload(tables, { kind: 'backup', exportedAt: AT, appVersion: '0.1.0' })
        .schemaVersion,
    ).toBe(SCHEMA_VERSION);
  });

  it('uses the local date: 08:00 on 2 January in Auckland is still 1 January in UTC', () => {
    expect(
      backupFileName('2000-01-01T19:00:00.000Z', 'Pacific/Auckland', {
        locked: false,
        kind: 'backup',
      }),
    ).toBe('diet-backup-2000-01-02.json');
    expect(
      backupFileName('2000-01-01T10:30:00.000Z', 'Pacific/Auckland', {
        locked: false,
        kind: 'backup',
      }),
    ).toBe('diet-backup-2000-01-01.json');
  });
});
