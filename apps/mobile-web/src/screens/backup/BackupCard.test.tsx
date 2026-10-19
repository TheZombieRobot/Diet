// The Backup and data card (storage spec sections 10 to 12; section 16 test 39; BK-01, BK-02,
// BK-03, PWA-06, HS-30; D19, D21, D49). Rendered in jsdom over the real repositories on a fresh
// fake-indexeddb database, with a fake platform that records downloads and reloads.
import { createRescueFile, STORES_V1 } from '@diet/core';
import { privacy } from '@diet/core/copy/health';
import {
  lockedReferenceEnvelopeV1,
  plainReferenceEnvelopeV1,
  REFERENCE_PHRASE_V1,
  snapshotV1,
} from '@diet/test-fixtures';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { appStorageStore } from '../../db/runtime';
import { openTestDb, rawWriter, type TestDb } from '../../db/testKit';
import { storageStore } from '../../pwa/storage';
import { BackupCard } from './BackupCard';
import { exportRequestStore } from './reminder';

let test: TestDb;

beforeEach(async () => {
  test = await openTestDb();
  appStorageStore.set(test.storage);
  storageStore.set('checking');
});

afterEach(() => {
  cleanup();
  appStorageStore.set(null);
  storageStore.set('checking');
  exportRequestStore.set(false);
  test.db.shutDown();
});

const card = () => screen.getByRole('region', { name: privacy.backupCard.title });
const button = (name: string) => within(card()).getByRole('button', { name });
const exportCopy = privacy.exportBackup;

function type(label: string, value: string): void {
  fireEvent.change(within(card()).getByLabelText(label), { target: { value } });
}

async function chooseFile(text: string, name = 'diet-backup-2000-03-01.json'): Promise<void> {
  fireEvent.click(button(privacy.backupCard.restoreAction));
  const input = within(card()).getByTestId('restore-file');
  await act(async () => {
    fireEvent.change(input, {
      target: { files: [new File([text], name, { type: 'application/json' })] },
    });
    await Promise.resolve();
  });
}

describe('Backup and data card (section 16 test 39)', () => {
  it.each([
    ['checking', privacy.storageStatus.checking],
    ['protected', privacy.storageStatus.protected],
    ['not-protected', privacy.storageStatus.notProtected],
    ['unsupported', privacy.storageStatus.unsupported],
  ] as const)('shows the storage status line when %s', (status, text) => {
    storageStore.set(status);
    render(<BackupCard />);
    expect(screen.getByTestId('backup-storage-status').textContent).toBe(text);
  });

  it('says "No backup made yet", then "Last backup made <date>" once a backup is recorded', async () => {
    render(<BackupCard />);
    expect((await screen.findByTestId('last-backup')).textContent).toBe(
      privacy.backupCard.noBackup,
    );
    await act(async () => {
      await test.repos.settings.recordBackup('2000-03-01T00:00:00.000Z');
    });
    await waitFor(() => {
      expect(screen.getByTestId('last-backup').textContent).toBe('Last backup made 1 March 2000');
    });
  });

  it('export: the lock is on by default, with the password rules, the warning and new-password autocomplete', () => {
    render(<BackupCard />);
    fireEvent.click(button(privacy.backupCard.exportAction));
    const lock = within(card()).getByRole('switch', { name: exportCopy.lockLabel });
    expect((lock as HTMLInputElement).checked).toBe(true);
    const first = within(card()).getByLabelText(exportCopy.passwordLabel);
    const repeat = within(card()).getByLabelText(exportCopy.passwordRepeatLabel);
    expect(first.getAttribute('autocomplete')).toBe('new-password');
    expect(repeat.getAttribute('autocomplete')).toBe('new-password');
    expect(first.getAttribute('type')).toBe('password');
    expect(card().textContent).toContain(exportCopy.forgottenWarning);
    expect(card().textContent).toContain(exportCopy.passwordRule);

    fireEvent.click(button(exportCopy.saveFile));
    expect(within(card()).getByRole('alert').textContent).toBe(exportCopy.passwordTooShort);
    type(exportCopy.passwordLabel, 'example phrase one');
    type(exportCopy.passwordRepeatLabel, 'example phrase two');
    fireEvent.click(button(exportCopy.saveFile));
    expect(within(card()).getByRole('alert').textContent).toBe(exportCopy.passwordsDiffer);
    expect(test.storage.platform.downloads).toEqual([]);

    fireEvent.click(lock);
    expect(card().textContent).toContain(exportCopy.plainWarning);
    expect(within(card()).queryByLabelText(exportCopy.passwordLabel)).toBeNull();
  });

  it('export: "Can you see the file?" No records nothing; Yes records the backup (D21)', async () => {
    render(<BackupCard />);
    fireEvent.click(button(privacy.backupCard.exportAction));
    fireEvent.click(within(card()).getByRole('switch', { name: exportCopy.lockLabel }));
    fireEvent.click(button(exportCopy.saveFile));
    expect(await within(card()).findByText(exportCopy.canYouSeeIt)).toBeDefined();
    expect(test.storage.platform.downloads.map((d) => d.fileName)).toEqual([
      'diet-backup-2000-03-01.json',
    ]);
    expect(card().textContent).toContain(
      'Your phone should now show diet-backup-2000-03-01.json in Downloads. Check it is there.',
    );
    fireEvent.click(button(exportCopy.no));
    expect(within(card()).getByText(exportCopy.notConfirmed)).toBeDefined();
    expect((await test.repos.settings.get()).lastBackupAt).toBeNull();

    fireEvent.click(button(exportCopy.tryAgain));
    fireEvent.click(within(card()).getByRole('switch', { name: exportCopy.lockLabel }));
    fireEvent.click(button(exportCopy.saveFile));
    fireEvent.click(await within(card()).findByRole('button', { name: exportCopy.yes }));
    await waitFor(async () => {
      expect((await test.repos.settings.get()).lastBackupAt).toBe('2000-03-01T00:00:00.000Z');
    });
    await waitFor(() => {
      expect(screen.getByTestId('last-backup').textContent).toBe('Last backup made 1 March 2000');
    });
  });

  it('export: a locked file is offered with the -locked name, and the inputs are cleared after use', async () => {
    render(<BackupCard />);
    fireEvent.click(button(privacy.backupCard.exportAction));
    const phrase = 'example phrase for the card test';
    type(exportCopy.passwordLabel, phrase);
    type(exportCopy.passwordRepeatLabel, phrase);
    fireEvent.click(button(exportCopy.saveFile));
    expect(
      await within(card()).findByText(exportCopy.canYouSeeIt, {}, { timeout: 10_000 }),
    ).toBeDefined();
    const [file] = test.storage.platform.downloads;
    expect(file?.fileName).toBe('diet-backup-2000-03-01-locked.json');
    expect(JSON.parse(file?.text ?? '{}')).toMatchObject({ encrypted: true, version: 1 });
    expect(file?.text).not.toContain(phrase);
    fireEvent.click(button(exportCopy.no));
    fireEvent.click(button(exportCopy.tryAgain));
    expect(within(card()).getByLabelText<HTMLInputElement>(exportCopy.passwordLabel).value).toBe(
      '',
    );
  });

  it('opens with the export panel when "Back up now" was tapped on Today', () => {
    exportRequestStore.set(true);
    render(<BackupCard />);
    expect(within(card()).getByRole('switch', { name: exportCopy.lockLabel })).toBeDefined();
    expect(exportRequestStore.get()).toBe(false);
  });

  it('restore: shows the counts and what would be lost, needs Replace, then replaces, asks for storage protection and reloads (PWA-06)', async () => {
    render(<BackupCard />);
    await chooseFile(plainReferenceEnvelopeV1());
    const confirm = await within(card()).findByTestId('restore-confirm');
    expect(confirm.textContent).toContain('Backup made 1 March 2000');
    expect(confirm.textContent).toContain(privacy.importBackup.filePlain);
    expect(within(confirm).getByTestId('restore-counts').textContent).toContain(
      `Weigh-ins: ${String(snapshotV1.weights.length)}`,
    );
    expect(within(confirm).getByTestId('restore-summary').textContent).toMatch(
      /^This replaces everything on this phone\. 2 records on this phone are not in the file\. 0 records/,
    );
    // The phone has records the file lacks, so exporting first is the first, default button.
    const buttons = within(confirm)
      .getAllByRole('button')
      .map((b) => b.textContent);
    expect(buttons.slice(0, 2)).toEqual([
      privacy.importBackup.exportFirst,
      privacy.importBackup.replace,
    ]);
    expect(await test.db.weights.count()).toBe(0);

    fireEvent.click(within(confirm).getByRole('button', { name: privacy.importBackup.replace }));
    await waitFor(() => {
      expect(test.storage.platform.reloads).toBe(1);
    });
    expect(test.storage.platform.posted).toEqual(['import']);
    expect(test.storage.platform.persistRequests).toBe(1);
    expect(await test.db.weights.count()).toBe(snapshotV1.weights.length);
  });

  it('restore: a wrong password says so and imports nothing; the right one opens the file (BK-02)', async () => {
    render(<BackupCard />);
    await chooseFile(lockedReferenceEnvelopeV1(), 'diet-backup-2000-03-01-locked.json');
    const field = await within(card()).findByLabelText(privacy.importBackup.passwordLabel);
    expect(field.getAttribute('autocomplete')).toBe('current-password');
    type(privacy.importBackup.passwordLabel, 'not the reference phrase');
    fireEvent.click(button(privacy.importBackup.unlock));
    expect((await within(card()).findByRole('alert', {}, { timeout: 10_000 })).textContent).toBe(
      privacy.backupErrors['wrong-password-or-damaged'],
    );
    expect(await test.db.weights.count()).toBe(0);
    const phrase = REFERENCE_PHRASE_V1;
    type(privacy.importBackup.passwordLabel, phrase);
    fireEvent.click(button(privacy.importBackup.unlock));
    const confirm = await within(card()).findByTestId('restore-confirm', {}, { timeout: 10_000 });
    expect(confirm.textContent).toContain(privacy.importBackup.fileLocked);
  });

  it('restore: a file that is not a backup is refused in plain words', async () => {
    render(<BackupCard />);
    await chooseFile('{"example":true}', 'example.json');
    expect((await within(card()).findByRole('alert')).textContent).toBe(
      privacy.backupErrors['not-a-backup'],
    );
  });

  it('restore: a rescue copy with a bad row lists it by store and position and offers "Import the rest"', async () => {
    const tables = structuredClone(snapshotV1) as unknown as Record<
      string,
      Record<string, unknown>[]
    >;
    const weight = tables['weights']?.[1];
    if (weight !== undefined) weight['kg'] = 5;
    const rescue = await createRescueFile({
      tables,
      schemaVersion: 1,
      exportedAt: '2000-03-01T00:00:00.000Z',
      appVersion: '0.1.0',
      password: null,
    });
    render(<BackupCard />);
    await chooseFile(rescue.text, 'diet-backup-2000-03-01-rescue.json');
    const confirm = await within(card()).findByTestId('restore-confirm');
    expect(within(confirm).getByTestId('restore-set-aside').textContent).toBe(
      'Weigh-ins, record 2: range',
    );
    expect(confirm.textContent).toContain(privacy.importBackup.rescueNote);
    expect(
      within(confirm).queryByRole('button', { name: privacy.importBackup.replace }),
    ).toBeNull();
    fireEvent.click(within(confirm).getByRole('button', { name: privacy.importBackup.importRest }));
    await waitFor(() => {
      expect(test.storage.platform.reloads).toBe(1);
    });
    expect(await test.db.weights.count()).toBe(snapshotV1.weights.length - 1);
  });

  it('export: a failed self-check names the problem and still offers an unchecked copy', async () => {
    test.db.shutDown();
    const raw = await rawWriter(test.deps, STORES_V1);
    await raw.table('weights').put({ ...snapshotV1.weights[0], kg: 5 });
    raw.close();
    test = await openTestDb({ deps: test.deps, env: test.env });
    appStorageStore.set(test.storage);
    render(<BackupCard />);
    fireEvent.click(button(privacy.backupCard.exportAction));
    fireEvent.click(within(card()).getByRole('switch', { name: exportCopy.lockLabel }));
    fireEvent.click(button(exportCopy.saveFile));
    expect((await within(card()).findByRole('alert')).textContent).toBe(
      'The backup could not be checked: weights kg failed range',
    );
    fireEvent.click(button(exportCopy.saveUnchecked));
    await waitFor(() => {
      expect(test.storage.platform.downloads.map((d) => d.fileName)).toEqual([
        'diet-backup-2000-03-01-rescue.json',
      ]);
    });
    expect(card().textContent).toContain(exportCopy.uncheckedNote);
    expect((await test.repos.settings.get()).lastBackupAt).toBeNull();
  });

  it('delete all: lists what stays, needs both confirmations, then deletes and reloads (HS-30)', async () => {
    render(<BackupCard />);
    fireEvent.click(button(privacy.backupCard.deleteAllAction));
    const first = within(card()).getByTestId('delete-first');
    expect(first.textContent).toContain(privacy.deleteAll.goes);
    for (const line of privacy.deleteAll.stays) expect(first.textContent).toContain(line);
    expect(
      within(first).getByRole('button', { name: privacy.deleteAll.exportFirst }),
    ).toBeDefined();
    expect(within(card()).queryByRole('button', { name: privacy.deleteAll.confirm })).toBeNull();
    fireEvent.click(within(first).getByRole('button', { name: privacy.deleteAll.next }));
    const second = within(card()).getByTestId('delete-second');
    expect(second.textContent).toContain(privacy.deleteAll.finalWarning);
    expect(test.storage.platform.reloads).toBe(0);
    fireEvent.click(within(second).getByRole('button', { name: privacy.deleteAll.confirm }));
    await waitFor(() => {
      expect(test.storage.platform.reloads).toBe(1);
    });
    expect(test.storage.platform.posted).toEqual(['delete-all']);
    expect(await test.deps.indexedDB.databases()).toEqual([]);
  });

  it('without an open database, says the records are still opening and offers no actions', () => {
    appStorageStore.set(null);
    render(<BackupCard />);
    expect(card().textContent).toContain(privacy.backupCard.notReady);
    expect(within(card()).queryAllByRole('button')).toEqual([]);
  });
});
