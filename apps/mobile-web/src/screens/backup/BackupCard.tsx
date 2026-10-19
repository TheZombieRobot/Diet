import { fillTemplate } from '@diet/core';
import { privacy } from '@diet/core/copy/health';
import { Button, Card, Notice } from '@diet/ui';
import { useEffect, useState, type ReactElement } from 'react';
import { appStorageStore } from '../../db/runtime';
import { formatLocalDate } from '../../format';
import { storageStore } from '../../pwa/storage';
import { useStore } from '../../store';
import { DeleteAllPanel } from './DeleteAllPanel';
import { ExportPanel } from './ExportPanel';
import { exportRequestStore, useBackupReminder } from './reminder';
import { RestorePanel } from './RestorePanel';
import { storageStatusText } from './storageStatus';

/**
 * Settings, "Backup and data" (storage spec sections 10 to 12; UX_SCREENS section 7; C98): the
 * storage-protection line, when the last backup was made, the backup reminder when it is due, and
 * export, restore and delete all.
 */
export function BackupCard(): ReactElement {
  const copy = privacy.backupCard;
  const storage = useStore(appStorageStore);
  const protection = useStore(storageStore);
  const reminder = useBackupReminder(storage);
  const [exportOpen, setExportOpen] = useState(() => exportRequestStore.get());
  const [restoreOpen, setRestoreOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);

  useEffect(() => {
    exportRequestStore.set(false);
  }, []);

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
      {lastBackup === null ? (
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
            <ExportPanel
              storage={storage}
              onDone={() => {
                setExportOpen(false);
              }}
            />
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
              onExportFirst={() => {
                setExportOpen(true);
              }}
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
              onExportFirst={() => {
                setExportOpen(true);
              }}
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
