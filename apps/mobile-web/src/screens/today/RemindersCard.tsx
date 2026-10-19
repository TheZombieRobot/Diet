import { fasting, privacy, readiness, reminders } from '@diet/core/copy/health';
import { Button, ButtonRow, Card } from '@diet/ui';
import { type ReactElement, type ReactNode, useRef } from 'react';
import type { AppStorage } from '../../db/runtime';
import { BackupReminderItem } from '../backup/ReminderCards';
import { hideReminder } from './focus';
import { useTodayWrite } from './useWrite';
import { WriteError } from './WriteError';
import type { ReminderItem } from './view';

type Hide = (item: HTMLElement | null, write: () => Promise<unknown>) => void;

/** One reminder: its title (a focusable h3), its lines, and an optional quiet hide. */
function Reminder({
  testId,
  title,
  children,
  hide,
}: {
  readonly testId: string;
  readonly title: string;
  readonly children: ReactNode;
  readonly hide?: {
    readonly label: string;
    readonly run: Hide;
    readonly write: () => Promise<unknown>;
  };
}): ReactElement {
  const item = useRef<HTMLDivElement>(null);
  return (
    <div ref={item} className="ui-reminder" data-testid={testId}>
      <h3 className="ui-text-strong" tabIndex={-1}>
        {title}
      </h3>
      {children}
      {hide === undefined ? null : (
        <ButtonRow>
          <Button
            variant="quiet"
            onClick={() => {
              hide.run(item.current, hide.write);
            }}
          >
            {hide.label}
          </Button>
        </ButtonRow>
      )}
    </div>
  );
}

/**
 * Today's Reminders card (UX_SCREENS section 2, card 8; design section 1.9): the electrolyte
 * reminder (C72) with the C102 line while answer 4 is yes or unanswered, medication timing while
 * fasting is switched off (otherwise it is on the Fast card, C07), the lipid test or a cholesterol
 * check-in (C109) and the backup reminder (item 12), in that order, or with Backup first when the
 * phone has not promised to keep the records (D25). Hiding one moves focus to the next title, or
 * the previous; hiding the last one removes the card, and focus goes to the next card's heading.
 * Nothing here writes merely because it was shown (T30).
 */
export function RemindersCard({
  storage,
  items,
  prominent,
}: {
  readonly storage: AppStorage;
  readonly items: readonly ReminderItem[];
  readonly prominent: boolean;
}): ReactElement {
  const write = useTodayWrite();
  const hide: Hide = (item, run) => {
    void write.run(() => hideReminder(item, run));
  };
  const { cardState } = storage.repos;
  return (
    <Card label={privacy.backupReminder.cardLabel}>
      {items.map((reminder) => {
        switch (reminder.kind) {
          case 'electrolytes':
            return (
              <Reminder
                key="electrolytes"
                testId="reminder-electrolytes"
                title={reminders.electrolytes.title}
                hide={{
                  label: reminders.electrolytes.hide,
                  run: hide,
                  write: () => cardState.dismiss('electrolyte-reminder', 'daily'),
                }}
              >
                <p>{reminders.electrolytes.body}</p>
                {reminder.bloodPressure ? <p>{readiness.bloodPressure.electrolyte}</p> : null}
              </Reminder>
            );
          case 'medication':
            return (
              <Reminder
                key="medication"
                testId="reminder-medication"
                title={reminders.medicationTiming.title}
              >
                <p>{fasting.pharmacist}</p>
              </Reminder>
            );
          case 'cholesterol':
            return (
              <Reminder
                key={`cholesterol-${reminder.trigger}`}
                testId="reminder-cholesterol"
                title={reminders.cholesterol.title[reminder.trigger]}
                hide={{
                  label: reminders.cholesterol.hide,
                  run: hide,
                  write: () => cardState.dismiss('cholesterol-checkin', reminder.trigger),
                }}
              >
                <p>{reminders.cholesterol.body}</p>
              </Reminder>
            );
          case 'backup':
            return (
              <BackupReminderItem
                key="backup"
                storage={storage}
                prominent={prominent}
                onHide={hide}
              />
            );
        }
      })}
      <WriteError write={write} />
    </Card>
  );
}
