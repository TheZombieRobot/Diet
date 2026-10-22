import type { CholesterolTrigger } from '@diet/core';
import { fasting, foodLog, privacy, readiness, reminders } from '@diet/core/copy/health';
import { Button, ButtonRow, Card } from '@diet/ui';
import { type ReactElement, type ReactNode, useRef } from 'react';
import type { AppStorage } from '../../db/runtime';
import { gpSummaryHref } from '../../routes';
import { BackupReminderItem } from '../backup/ReminderCards';
import { hideReminder } from './focus';
import { useTodayWrite } from './useWrite';
import { WriteError } from './WriteError';
import type { ElectrolyteLine, ReminderItem } from './view';

/** The GP summary's range for each cholesterol check-in (item 23 design 1.1). */
const GP_RANGE_FOR: Readonly<Record<CholesterolTrigger, 28 | 56 | 84>> = {
  'day-1': 28,
  'day-56': 56,
  'day-84': 84,
};

/** The electrolyte reminder's wording: one wording for each line (cross-item ruling 5). */
const electrolyteLine: Readonly<Record<ElectrolyteLine, string>> = {
  body: reminders.electrolytes.body,
  bloodPressure: readiness.bloodPressure.electrolyte,
};

type Hide = (item: HTMLElement | null, write: () => Promise<unknown>) => void;

/** One reminder: its title (a focusable h3), its lines, and an optional quiet hide. */
function Reminder({
  testId,
  title,
  children,
  hide,
  link,
}: {
  readonly testId: string;
  readonly title: string;
  readonly children: ReactNode;
  readonly hide?: {
    readonly label: string;
    readonly run: Hide;
    readonly write: () => Promise<unknown>;
  };
  /** A link before the hide button (item 23: the summary for a GP). */
  readonly link?: { readonly href: string; readonly label: string };
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
          {link === undefined ? null : (
            <a className="ui-button ui-button--quiet" href={link.href}>
              {link.label}
            </a>
          )}
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
                {reminder.lines.map((line) => (
                  <p key={line}>{electrolyteLine[line]}</p>
                ))}
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
                // Item 23 (C100): the summary for a GP, for everyone, its range set by the check-in.
                link={{
                  href: gpSummaryHref(GP_RANGE_FOR[reminder.trigger]),
                  label: foodLog.gp.reminderLink,
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
