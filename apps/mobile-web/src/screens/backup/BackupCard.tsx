import { fillTemplate } from '@diet/core';
import { privacy } from '@diet/core/copy/health';
import { Button, Card, Notice } from '@diet/ui';
import { useEffect, useRef, useState, type ReactElement } from 'react';
import { appStorageStore } from '../../db/runtime';
import { formatLocalDate } from '../../format';
import { storageStore } from '../../pwa/storage';
import { useStore } from '../../store';
import { DeleteAllPanel } from './DeleteAllPanel';
import { ExportPanel } from './ExportPanel';
import { recordsBusyStore, useGateOpen } from './focus';
import { pendingCheckStore } from './pendingCheck';
import { exportRequestStore, useBackupReminder } from './reminder';
import { RestorePanel } from './RestorePanel';
import { storageStatusText } from './storageStatus';

/**
 * Settings, "Backup and data" (storage spec sections 10 to 12; UX_SCREENS section 7; C98): the
 * storage-protection line, when the last backup was made, the backup reminder when it is due, and
 * export, restore and delete all. "Export what is on this phone first", "Export a backup first"
 * and "Back up now" open the export panel, scroll it into view and put focus on its lock switch,
 * so the tap visibly does something (ux review). An unanswered "Can you see the file?" opens the
 * export panel at that question. After a restore or delete-all that did not finish (not while one
 * is still running), the card says nothing more will be saved until the app reloads, and offers
 * Reload.
 */
export function BackupCard(): ReactElement {
  const copy = privacy.backupCard;
  const storage = useStore(appStorageStore);
  const protection = useStore(storageStore);
  const pending = useStore(pendingCheckStore);
  const reminder = useBackupReminder(storage);
  const gateOpen = useGateOpen(storage?.gate ?? null);
  const busy = useStore(recordsBusyStore);
  const [exportOpen, setExportOpen] = useState(
    () => exportRequestStore.get() || pendingCheckStore.get() !== null,
  );
  const [restoreOpen, setRestoreOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  // Counts the requests to bring the export panel into view (0: none yet).
  const [exportFocus, setExportFocus] = useState(() => (exportRequestStore.get() ? 1 : 0));
  const exportPanel = useRef<HTMLDivElement>(null);
  const lockSwitch = useRef<HTMLInputElement>(null);

  useEffect(() => {
    exportRequestStore.set(false);
  }, []);

  // A new unanswered "Can you see the file?" opens the export panel at that question (adjusting
  // state while rendering, as React recommends for state that follows a store).
  const [shownPending, setShownPending] = useState(pending);
  if (pending !== shownPending) {
    setShownPending(pending);
    if (pending !== null) setExportOpen(true);
  }

  useEffect(() => {
    if (exportFocus === 0 || storage === null) return;
    // After this commit's other effects: arriving from "Back up now", the shell's own screen
    // change scrolls to the top and focuses the heading, which must not undo this.
    const timer = setTimeout(() => {
      const panel = exportPanel.current;
      if (panel === null) return;
      if (typeof panel.scrollIntoView === 'function') panel.scrollIntoView({ block: 'start' });
      const target =
        lockSwitch.current ?? panel.querySelector<HTMLElement>('button, input, [tabindex="-1"]');
      target?.focus({ preventScroll: true });
    }, 0);
    return () => {
      clearTimeout(timer);
    };
  }, [exportFocus, storage]);

  const openExport = (): void => {
    setExportOpen(true);
    setExportFocus((n) => n + 1);
  };

  const settings = reminder.inputs?.settings;
  const lastBackup =
    settings === undefined || storage === null
      ? null
      : settings.lastBackupAt === null
        ? copy.noBackup
        : fillTemplate(copy.lastBackup, {
            date: formatLocalDate(settings.lastBackupAt, storage.env.timeZone()),
          });

  return (
    <Card label={copy.title}>
      <p data-testid="backup-storage-status">{storageStatusText(protection)}</p>
      {storage !== null && !gateOpen && !busy ? (
        <Notice role="status">
          <p data-testid="backup-closed">{copy.closed}</p>
          <Button variant="primary" onClick={storage.platform.reload}>
            {copy.reload}
          </Button>
        </Notice>
      ) : lastBackup === null ? (
        <p className="ui-text-muted">{copy.notReady}</p>
      ) : (
        <p className="ui-text-strong" data-testid="last-backup">
          {lastBackup}
        </p>
      )}
      {reminder.visible ? (
        <Notice role="status">
          <p className="ui-text-strong">{privacy.backupReminder.title}</p>
          <p>{privacy.backupReminder.body}</p>
          {reminder.prominent ? <p>{privacy.backupReminder.weakStorage}</p> : null}
        </Notice>
      ) : null}
      {storage === null ? null : (
        <>
          <Button
            variant={exportOpen ? 'tint' : 'secondary'}
            block
            aria-expanded={exportOpen}
            onClick={() => {
              setExportOpen(!exportOpen);
            }}
          >
            {copy.exportAction}
          </Button>
          {exportOpen ? (
            <div ref={exportPanel} data-testid="export-panel">
              <ExportPanel
                storage={storage}
                switchRef={lockSwitch}
                onDone={() => {
                  setExportOpen(false);
                }}
              />
            </div>
          ) : null}
          <Button
            variant={restoreOpen ? 'tint' : 'secondary'}
            block
            aria-expanded={restoreOpen}
            onClick={() => {
              setRestoreOpen(!restoreOpen);
            }}
          >
            {copy.restoreAction}
          </Button>
          {restoreOpen ? (
            <RestorePanel
              storage={storage}
              onExportFirst={openExport}
              onCancel={() => {
                setRestoreOpen(false);
              }}
            />
          ) : null}
          <Button
            variant={deleteOpen ? 'tint' : 'secondary'}
            block
            aria-expanded={deleteOpen}
            onClick={() => {
              setDeleteOpen(!deleteOpen);
            }}
          >
            {copy.deleteAllAction}
          </Button>
          {deleteOpen ? (
            <DeleteAllPanel
              storage={storage}
              hasBackup={settings === undefined || settings.lastBackupAt !== null}
              onExportFirst={openExport}
              onCancel={() => {
                setDeleteOpen(false);
              }}
            />
          ) : null}
        </>
      )}
    </Card>
  );
}
