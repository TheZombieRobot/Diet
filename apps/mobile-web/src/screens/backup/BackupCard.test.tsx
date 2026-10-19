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
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { LockManagerLike } from '../../db/locks';
import { appStorageStore } from '../../db/runtime';
import { locksFor, openTestDb, rawWriter, type TestDb, testPlatform } from '../../db/testKit';
import { formatLocalTime } from '../../format';
import { storageStore } from '../../pwa/storage';
import { BackupCard } from './BackupCard';
import {
  PENDING_CHECK_KEY,
  pendingCheckStore,
  reloadPendingCheck,
  setPendingCheck,
} from './pendingCheck';
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
  setPendingCheck(null);
  sessionStorage.clear();
  test.db.shutDown();
});

const card = () => screen.getByRole('region', { name: privacy.backupCard.title });
const button = (name: string) => within(card()).getByRole('button', { name });
const exportCopy = privacy.exportBackup;
const importCopy = privacy.importBackup;
const AT = '2000-03-01T00:00:00.000Z';
const PLAIN_NAME = 'diet-backup-2000-03-01.json';

function type(label: string, value: string): void {
  fireEvent.change(within(card()).getByLabelText(label), { target: { value } });
}

async function chooseFile(text: string, name = PLAIN_NAME): Promise<void> {
  fireEvent.click(button(privacy.backupCard.restoreAction));
  const input = within(card()).getByTestId('restore-file');
  await act(async () => {
    fireEvent.change(input, {
      target: { files: [new File([text], name, { type: 'application/json' })] },
    });
    await Promise.resolve();
  });
}

/** Opens the app again on the same records with another platform (a "tab" with other locks). */
async function reopenWith(locks: () => LockManagerLike | null): Promise<void> {
  test.db.shutDown();
  test = await openTestDb({ deps: test.deps, env: test.env, platform: testPlatform({ locks }) });
  appStorageStore.set(test.storage);
}

/** Web Locks that never grant the exclusive lock (another tab that does not let go). */
const refusingLocks: LockManagerLike = {
  request: () => Promise.reject(new DOMException('The request was aborted.', 'AbortError')),
};

const classOf = (element: HTMLElement) => element.className;

/** Plain export (lock switched off) up to "Can you see the file?". */
async function exportPlain(): Promise<void> {
  fireEvent.click(button(privacy.backupCard.exportAction));
  fireEvent.click(within(card()).getByRole('switch', { name: exportCopy.lockLabel }));
  fireEvent.click(button(exportCopy.saveFile));
  await within(card()).findByText(exportCopy.canYouSeeIt);
}

const checkDownloadsText = (fileName: string) =>
  exportCopy.checkDownloads
    .replace('{fileName}', fileName)
    .replace('{time}', formatLocalTime(AT, test.env.timeZone()));

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
      await test.repos.settings.recordBackup(AT);
    });
    await waitFor(() => {
      expect(screen.getByTestId('last-backup').textContent).toBe('Last backup made 1 March 2000');
    });
  });

  it('export: the lock is on by default, with the password rules, the warning and new-password autocomplete', () => {
    render(<BackupCard />);
    fireEvent.click(button(privacy.backupCard.exportAction));
    expect(card().textContent).toContain(exportCopy.intro);
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

  it('export: "Can you see the file?" says where to look; No records nothing; Yes records the backup and says to copy it off the phone (D21)', async () => {
    render(<BackupCard />);
    await exportPlain();
    expect(test.storage.platform.downloads.map((d) => d.fileName)).toEqual([PLAIN_NAME]);
    // Where to look on Android, the time it was saved, and the "(1)" a second file gets.
    expect(within(card()).getByTestId('export-ask').textContent).toContain(
      checkDownloadsText(PLAIN_NAME),
    );
    expect(checkDownloadsText(PLAIN_NAME)).toContain('(1)');
    fireEvent.click(button(exportCopy.no));
    expect(within(card()).getByText(exportCopy.notConfirmed)).toBeDefined();
    expect((await test.repos.settings.get()).lastBackupAt).toBeNull();
    expect(pendingCheckStore.get()).toBeNull();

    fireEvent.click(button(exportCopy.tryAgain));
    fireEvent.click(within(card()).getByRole('switch', { name: exportCopy.lockLabel }));
    fireEvent.click(button(exportCopy.saveFile));
    fireEvent.click(await within(card()).findByRole('button', { name: exportCopy.yes }));
    const recorded = await within(card()).findByTestId('export-recorded');
    expect(recorded.textContent).toContain(exportCopy.recorded);
    expect((await test.repos.settings.get()).lastBackupAt).toBe(AT);
    await waitFor(() => {
      expect(screen.getByTestId('last-backup').textContent).toBe('Last backup made 1 March 2000');
    });
    fireEvent.click(within(recorded).getByRole('button', { name: exportCopy.close }));
    expect(within(card()).queryByTestId('export-panel')).toBeNull();
  });

  it('export: an unanswered "Can you see the file?" is asked again after leaving the screen and after a reload, and holds no record', async () => {
    render(<BackupCard />);
    await exportPlain();
    cleanup();

    // Back on the card: it opens at the question, saying what was left unanswered.
    render(<BackupCard />);
    const ask = await within(card()).findByTestId('export-ask');
    expect(ask.textContent).toContain(
      exportCopy.pendingCheck
        .replace('{fileName}', PLAIN_NAME)
        .replace('{time}', formatLocalTime(AT, test.env.timeZone())),
    );
    cleanup();

    // A reload of the same tab: the question comes back from sessionStorage, with only the name
    // and the time in it.
    const kept = sessionStorage.getItem(PENDING_CHECK_KEY) ?? '';
    expect(JSON.parse(kept)).toEqual({ fileName: PLAIN_NAME, exportedAt: AT });
    pendingCheckStore.set(null);
    reloadPendingCheck();
    render(<BackupCard />);
    fireEvent.click(await within(card()).findByRole('button', { name: exportCopy.yes }));
    await within(card()).findByTestId('export-recorded');
    expect((await test.repos.settings.get()).lastBackupAt).toBe(AT);
    expect(sessionStorage.getItem(PENDING_CHECK_KEY)).toBeNull();
  });

  it('export: while a locked file is made, the card says so in a status line', async () => {
    render(<BackupCard />);
    fireEvent.click(button(privacy.backupCard.exportAction));
    const phrase = 'example phrase for the progress test';
    type(exportCopy.passwordLabel, phrase);
    type(exportCopy.passwordRepeatLabel, phrase);
    fireEvent.click(button(exportCopy.saveFile));
    const status = await within(card()).findByRole('status');
    expect(status.textContent).toBe(exportCopy.locking);
    await within(card()).findByText(exportCopy.canYouSeeIt, {}, { timeout: 10_000 });
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

  it('opens with the export panel when "Back up now" was tapped on Today, scrolled into view with focus on the lock switch', async () => {
    const scrolled = vi.fn();
    HTMLElement.prototype.scrollIntoView = scrolled;
    exportRequestStore.set(true);
    render(<BackupCard />);
    const lock = within(card()).getByRole('switch', { name: exportCopy.lockLabel });
    await waitFor(() => {
      expect(document.activeElement).toBe(lock);
    });
    expect(scrolled).toHaveBeenCalled();
    expect(exportRequestStore.get()).toBe(false);
  });

  it('restore on a fresh phone: shows the counts, no loss warning, and Replace as the main button; then replaces, asks for storage protection and reloads (PWA-06)', async () => {
    render(<BackupCard />);
    await chooseFile(plainReferenceEnvelopeV1());
    const confirm = await within(card()).findByTestId('restore-confirm');
    expect(confirm.textContent).toContain('Backup made 1 March 2000');
    expect(confirm.textContent).toContain(importCopy.filePlain);
    expect(within(confirm).getByTestId('restore-counts').textContent).toContain(
      `Weigh-ins: ${String(snapshotV1.weights.length)}`,
    );
    const summary = within(confirm).getByTestId('restore-summary').textContent;
    expect(summary).toContain(importCopy.freshPhone);
    expect(summary).not.toContain(importCopy.missingNone);
    expect(summary).not.toMatch(/not in the file|differ/);
    const buttons = within(confirm).getAllByRole('button');
    expect(buttons.slice(0, 2).map((b) => b.textContent)).toEqual([
      importCopy.replace,
      importCopy.exportFirst,
    ]);
    expect(classOf(buttons[0] as HTMLElement)).toContain('ui-button--primary');
    expect(await test.db.weights.count()).toBe(0);

    fireEvent.click(within(confirm).getByRole('button', { name: importCopy.replace }));
    await waitFor(() => {
      expect(test.storage.platform.reloads).toBe(1);
    });
    expect(test.storage.platform.posted).toEqual(['import']);
    expect(test.storage.platform.persistRequests).toBe(1);
    expect(await test.db.weights.count()).toBe(snapshotV1.weights.length);
  });

  it('restore over records the file lacks: counts them, puts "Export what is on this phone first" first and draws Replace in amber', async () => {
    await test.repos.weights.create({ kg: 81, source: 'manual', note: null });
    render(<BackupCard />);
    await chooseFile(plainReferenceEnvelopeV1());
    const confirm = await within(card()).findByTestId('restore-confirm');
    const summary = within(confirm).getByTestId('restore-summary').textContent;
    expect(summary).toContain(importCopy.missingOne);
    expect(summary).toContain(importCopy.differNone);
    const buttons = within(confirm).getAllByRole('button');
    expect(buttons.slice(0, 2).map((b) => b.textContent)).toEqual([
      importCopy.exportFirst,
      importCopy.replace,
    ]);
    expect(classOf(buttons[0] as HTMLElement)).toContain('ui-button--primary');
    expect(classOf(buttons[1] as HTMLElement)).toContain('ui-button--caution');

    // Export first opens the export panel, in view, with focus on its lock switch.
    fireEvent.click(buttons[0] as HTMLElement);
    const lock = await within(card()).findByRole('switch', { name: exportCopy.lockLabel });
    await waitFor(() => {
      expect(document.activeElement).toBe(lock);
    });
    // The restore confirmation is still there to come back to.
    expect(within(card()).getByTestId('restore-confirm')).toBeDefined();
  });

  it('restore: focus moves to the start of each new step', async () => {
    render(<BackupCard />);
    await chooseFile(plainReferenceEnvelopeV1());
    const confirm = await within(card()).findByTestId('restore-confirm');
    await waitFor(() => {
      expect(document.activeElement?.textContent).toBe('Backup made 1 March 2000 at 1:00 pm.');
    });
    expect(confirm.contains(document.activeElement)).toBe(true);
  });

  it('restore: a wrong password is linked to the field, which is cleared and focused, and imports nothing; the right one opens the file (BK-02)', async () => {
    render(<BackupCard />);
    await chooseFile(lockedReferenceEnvelopeV1(), 'diet-backup-2000-03-01-locked.json');
    const field = await within(card()).findByLabelText<HTMLInputElement>(importCopy.passwordLabel);
    expect(field.getAttribute('autocomplete')).toBe('current-password');
    type(importCopy.passwordLabel, 'not the reference phrase');
    fireEvent.click(button(importCopy.unlock));
    expect(within(card()).getByRole('status').textContent).toBe(importCopy.unlocking);
    expect(field.readOnly).toBe(true);
    const alert = await within(card()).findByRole('alert', {}, { timeout: 10_000 });
    expect(alert.textContent).toBe(privacy.backupErrors['wrong-password-or-damaged']);
    const again = within(card()).getByLabelText<HTMLInputElement>(importCopy.passwordLabel);
    expect(again.getAttribute('aria-invalid')).toBe('true');
    expect(again.getAttribute('aria-describedby')?.split(' ')).toContain(alert.id);
    expect(again.value).toBe('');
    await waitFor(() => {
      expect(document.activeElement).toBe(again);
    });
    expect(await test.db.weights.count()).toBe(0);
    type(importCopy.passwordLabel, REFERENCE_PHRASE_V1);
    fireEvent.click(button(importCopy.unlock));
    const confirm = await within(card()).findByTestId('restore-confirm', {}, { timeout: 10_000 });
    expect(confirm.textContent).toContain(importCopy.fileLocked);
  });

  it('restore: a file that is not a backup is refused in plain words', async () => {
    render(<BackupCard />);
    await chooseFile('{"example":true}', 'example.json');
    expect((await within(card()).findByRole('alert')).textContent).toBe(
      privacy.backupErrors['not-a-backup'],
    );
  });

  it('restore: a rescue copy with a bad row lists it in plain words and offers "Import the rest"', async () => {
    const tables = structuredClone(snapshotV1) as unknown as Record<
      string,
      Record<string, unknown>[]
    >;
    const weight = tables['weights']?.[1];
    if (weight !== undefined) weight['kg'] = 5;
    const rescue = await createRescueFile({
      tables,
      schemaVersion: 1,
      exportedAt: AT,
      appVersion: '0.1.0',
      password: null,
    });
    render(<BackupCard />);
    await chooseFile(rescue.text, 'diet-backup-2000-03-01-rescue.json');
    const confirm = await within(card()).findByTestId('restore-confirm');
    expect(within(confirm).getByTestId('restore-set-aside').textContent).toBe(
      'Weigh-ins, record 2: the weight is outside the allowed range (20–400)',
    );
    expect(confirm.textContent).toContain(importCopy.rescueNote);
    expect(within(confirm).queryByRole('button', { name: importCopy.replace })).toBeNull();
    fireEvent.click(within(confirm).getByRole('button', { name: importCopy.importRest }));
    await waitFor(() => {
      expect(test.storage.platform.reloads).toBe(1);
    });
    expect(await test.db.weights.count()).toBe(snapshotV1.weights.length - 1);
  });

  it('restore: when another tab does not let go, nothing is written, the card says the app is open elsewhere, and Reload and Try again are offered', async () => {
    let refuse = true;
    await reopenWith(() => ({
      request: (name, options, callback) =>
        refuse
          ? refusingLocks.request(name, options, callback)
          : locksFor(test.deps.indexedDB).request(name, options, callback),
    }));
    await test.repos.weights.create({ kg: 81, source: 'manual', note: null });
    render(<BackupCard />);
    await chooseFile(plainReferenceEnvelopeV1());
    const confirm = await within(card()).findByTestId('restore-confirm');
    fireEvent.click(within(confirm).getByRole('button', { name: importCopy.replace }));
    const blocked = await within(card()).findByTestId('restore-blocked');
    expect(blocked.textContent).toContain(privacy.otherTabs);
    expect(blocked.textContent).toContain(privacy.backupCard.closed);
    expect(test.storage.platform.reloads).toBe(0);
    // This tab's records are closed: the card says so and offers Reload.
    expect(within(card()).getByTestId('backup-closed').textContent).toBe(privacy.backupCard.closed);
    expect(await test.db.weights.count()).toBe(1);

    refuse = false;
    fireEvent.click(within(blocked).getByRole('button', { name: importCopy.tryAgain }));
    await waitFor(() => {
      expect(test.storage.platform.reloads).toBe(1);
    });
    expect(await test.db.weights.count()).toBe(snapshotV1.weights.length);
  });

  it('export: a failed self-check names the problem in plain words and still offers an unchecked copy', async () => {
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
      'The backup could not be checked: Weigh-ins, record 1: the weight is outside the allowed range (20–400).',
    );
    fireEvent.click(button(exportCopy.saveUnchecked));
    await waitFor(() => {
      expect(test.storage.platform.downloads.map((d) => d.fileName)).toEqual([
        'diet-backup-2000-03-01-rescue.json',
      ]);
    });
    expect(card().textContent).toContain(exportCopy.uncheckedNote);
    expect(card().textContent).toContain(checkDownloadsText('diet-backup-2000-03-01-rescue.json'));
    expect((await test.repos.settings.get()).lastBackupAt).toBeNull();
  });

  it('delete all: lists what stays, needs both confirmations (Cancel the main button, delete in amber, no-backup warning), then deletes and reloads (HS-30)', async () => {
    render(<BackupCard />);
    await screen.findByText(privacy.backupCard.noBackup);
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
    expect(second.textContent).toContain(privacy.deleteAll.finalWarningNoBackup);
    await waitFor(() => {
      expect(document.activeElement?.textContent).toBe(privacy.deleteAll.finalWarningNoBackup);
    });
    const [cancel, confirm] = within(second).getAllByRole('button');
    expect(cancel?.textContent).toBe(privacy.deleteAll.cancel);
    expect(classOf(cancel as HTMLElement)).toContain('ui-button--primary');
    expect(confirm?.textContent).toBe(privacy.deleteAll.confirm);
    expect(classOf(confirm as HTMLElement)).toContain('ui-button--caution');
    expect(test.storage.platform.reloads).toBe(0);
    fireEvent.click(confirm as HTMLElement);
    await waitFor(() => {
      expect(test.storage.platform.reloads).toBe(1);
    });
    expect(test.storage.platform.posted).toEqual(['delete-all']);
    expect(await test.deps.indexedDB.databases()).toEqual([]);
  });

  it('delete all after a backup: the final warning points to the backup file', async () => {
    await test.repos.settings.recordBackup(AT);
    render(<BackupCard />);
    await screen.findByText('Last backup made 1 March 2000');
    fireEvent.click(button(privacy.backupCard.deleteAllAction));
    fireEvent.click(button(privacy.deleteAll.next));
    expect(within(card()).getByTestId('delete-second').textContent).toBe(
      privacy.deleteAll.finalWarning + privacy.deleteAll.cancel + privacy.deleteAll.confirm,
    );
  });

  it('delete all, blocked by another tab: says the app is open elsewhere, that nothing more is saved, and offers Reload and Try again', async () => {
    let refuse = true;
    await reopenWith(() => ({
      request: (name, options, callback) =>
        refuse
          ? refusingLocks.request(name, options, callback)
          : locksFor(test.deps.indexedDB).request(name, options, callback),
    }));
    render(<BackupCard />);
    fireEvent.click(button(privacy.backupCard.deleteAllAction));
    fireEvent.click(button(privacy.deleteAll.next));
    fireEvent.click(button(privacy.deleteAll.confirm));
    const failed = await within(card()).findByTestId('delete-failed');
    expect(failed.textContent).toContain(privacy.otherTabs);
    expect(failed.textContent).toContain(privacy.backupCard.closed);
    expect((await test.deps.indexedDB.databases()).map((d) => d.name)).toEqual(['diet']);
    expect(test.storage.platform.reloads).toBe(0);
    fireEvent.click(within(failed).getByRole('button', { name: privacy.backupCard.reload }));
    expect(test.storage.platform.reloads).toBe(1);

    refuse = false;
    fireEvent.click(within(failed).getByRole('button', { name: privacy.deleteAll.tryAgain }));
    await waitFor(() => {
      expect(test.storage.platform.reloads).toBe(2);
    });
    expect(await test.deps.indexedDB.databases()).toEqual([]);
  });

  it('without an open database, says the records are still opening and offers no actions', () => {
    appStorageStore.set(null);
    render(<BackupCard />);
    expect(card().textContent).toContain(privacy.backupCard.notReady);
    expect(within(card()).queryAllByRole('button')).toEqual([]);
  });
});
