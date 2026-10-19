import type { ReactElement } from 'react';
import { appStorageStore } from '../db/runtime';
import { useStore } from '../store';
import { BackupReminderCard, UpdateNoticeCard } from './backup/ReminderCards';
import { useBackupReminder } from './backup/reminder';
import { InstallBanner } from './InstallBanner';
import { Placeholder } from './Placeholder';
import { AlcoholHelpCard } from './today/AlcoholHelpCard';

export function TodayScreen(): ReactElement {
  const storage = useStore(appStorageStore);
  const reminder = useBackupReminder(storage);
  // The backup reminder goes first among Today's reminders when the phone has not promised to
  // keep the records (storage spec section 12.2; D25).
  const card =
    storage !== null && reminder.visible ? (
      <BackupReminderCard storage={storage} prominent={reminder.prominent} />
    ) : null;
  return (
    <>
      {/* The "talk to someone" card goes first, above the prominent backup reminder (item 13). */}
      {storage === null ? null : <AlcoholHelpCard storage={storage} />}
      {reminder.prominent ? card : null}
      <InstallBanner />
      {storage === null ? null : <UpdateNoticeCard storage={storage} />}
      <Placeholder coming="Today will show the day at a glance: weight, the current fast, food so far, water, steps, movement and drinks, with quick ways to log each." />
      {reminder.prominent ? null : card}
    </>
  );
}
