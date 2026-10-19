import type { ReactElement } from 'react';
import { appStorageStore } from '../db/runtime';
import { useStore } from '../store';
import { BackupReminderCard, UpdateNoticeCard } from './backup/ReminderCards';
import { useBackupReminder } from './backup/reminder';
import { TodayFastCard } from './fasting/FastCard';
import { FastingErrorBoundary } from './fasting/FastingErrorBoundary';
import { InstallBanner } from './InstallBanner';
import { Placeholder } from './Placeholder';
import { AlcoholHelpCard } from './today/AlcoholHelpCard';
import { NutritionTodayCard } from './today/NutritionTodayCard';
import { WeightCard } from './weight/WeightCard';

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
      {storage === null ? null : <WeightCard storage={storage} />}
      {/* Item 15: the Fast card (UX section 2, card 2); item 16 sets Today's final order. */}
      {storage === null ? null : (
        <FastingErrorBoundary>
          <TodayFastCard storage={storage} />
        </FastingErrorBoundary>
      )}
      {/* Item 21: the Nutrition today card, third after Weight and Fast (UX 2). */}
      {storage === null ? null : <NutritionTodayCard storage={storage} />}
      <Placeholder coming="Today will show the rest of the day at a glance: water, steps, movement and drinks, with quick ways to log each." />
      {reminder.prominent ? null : card}
    </>
  );
}
