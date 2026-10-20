import { fillTemplate, instantMs } from '@diet/core';
import { privacy } from '@diet/core/copy/health';
import { Button, ButtonRow, Card, Notice } from '@diet/ui';
import { useEffect, useRef, useState, type ReactElement } from 'react';
import { useLiveQuery } from '../../db/liveQuery';
import type { AppStorage } from '../../db/runtime';
import { formatLocalTime } from '../../format';
import { useStore } from '../../store';
import { pendingCheckStore } from './pendingCheck';
import { useRedrawAt } from './redraw';
import { readUpdateNotices, startBackupFromToday, visibleUpdateNotices } from './reminder';

export interface BackupReminderItemProps {
  readonly storage: AppStorage;
  readonly prominent: boolean;
  /**
   * Runs the "Not now" write; Today's Reminders card moves focus once it resolves (item 16). A
   * failed write leaves the reminder showing, which is the safe side.
   */
  readonly onHide: (item: HTMLElement | null, write: () => Promise<unknown>) => void;
}

/**
 * The backup reminder, an item of Today's Reminders card (storage spec section 12.2; BK-03;
 * UX_SCREENS section 2, card 8; item 16 placed it in that card). "Not now" snoozes it (7 days, or
 * 1 when the phone has not promised to keep the records); a backup only clears it once the owner
 * confirms they can see the file. When an exported file is still waiting for that answer, the
 * item says so.
 */
export function BackupReminderItem({
  storage,
  prominent,
  onHide,
}: BackupReminderItemProps): ReactElement {
  const copy = privacy.backupReminder;
  const pending = useStore(pendingCheckStore);
  const item = useRef<HTMLDivElement>(null);
  return (
    <div ref={item} className="ui-reminder" data-testid="backup-reminder">
      <h3 className="ui-text-strong" tabIndex={-1}>
        {copy.title}
      </h3>
      <p>{copy.body}</p>
      {pending === null ? null : (
        <p data-testid="backup-reminder-pending">
          {fillTemplate(privacy.exportBackup.pendingCheck, {
            fileName: pending.fileName,
            time: formatLocalTime(pending.exportedAt, storage.env.timeZone()),
          })}
        </p>
      )}
      {prominent ? (
        <Notice>
          <p>{copy.weakStorage}</p>
        </Notice>
      ) : null}
      <ButtonRow>
        <Button variant="primary" onClick={startBackupFromToday}>
          {copy.backUpNow}
        </Button>
        <Button
          variant="quiet"
          onClick={() => {
            onHide(item.current, () =>
              storage.repos.cardState.dismiss('backup-reminder', 'weekly'),
            );
          }}
        >
          {copy.notNow}
        </Button>
      </ButtonRow>
    </div>
  );
}

/** The update-notice card (section 9.2; D13), after an upgrade or import that changed values. */
export function UpdateNoticeCard({
  storage,
}: {
  readonly storage: AppStorage;
}): ReactElement | null {
  const notices = useLiveQuery(storage, readUpdateNotices);
  const [open, setOpen] = useState(false);
  const firstReason = useRef<HTMLLIElement>(null);
  useEffect(() => {
    // The list replaces the button that opened it, so focus moves to its first line.
    if (open) firstReason.current?.focus();
  }, [open]);
  const now = storage.env.now();
  const shown = visibleUpdateNotices(notices?.cards ?? [], now);
  useRedrawAt(shown.wakeAt, instantMs(now));
  const trigger = shown.triggers[0];
  if (notices === undefined || trigger === undefined) return null;
  return (
    <Card label={privacy.backupReminder.updateCardLabel}>
      <div className="ui-card__body" data-testid="update-notice">
        <p>{privacy.updateNotice}</p>
        {open ? (
          <ul className="ui-plain-list">
            {notices.reasons.map((reason, i) => (
              <li
                key={`${String(i)}-${reason}`}
                ref={i === 0 ? firstReason : undefined}
                tabIndex={i === 0 ? -1 : undefined}
                className="ui-step-start"
              >
                {reason}
              </li>
            ))}
          </ul>
        ) : null}
        <ButtonRow>
          {open ? null : (
            <Button
              onClick={() => {
                setOpen(true);
              }}
            >
              {privacy.updateNoticeLink}
            </Button>
          )}
          <Button
            variant="quiet"
            onClick={() => {
              storage.repos.cardState.done('update-notice', trigger).catch(() => undefined);
            }}
          >
            {privacy.updateNoticeClose}
          </Button>
        </ButtonRow>
      </div>
    </Card>
  );
}
