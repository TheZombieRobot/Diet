import { localDateOf } from '@diet/core';
import { today as copy } from '@diet/core/copy/health';
import { Button, Notice } from '@diet/ui';
import { type ReactElement, useMemo, useRef, useState } from 'react';
import { browserEnv } from '../../db/env';
import { useLiveQueryState } from '../../db/liveQuery';
import { type AppStorage, appStorageStore } from '../../db/runtime';
import { useReadinessGates } from '../../onboarding/state';
import { useStore } from '../../store';
import { useNow } from '../../useNow';
import { UpdateNoticeCard } from '../backup/ReminderCards';
import { useBackupReminder } from '../backup/reminder';
import { TodayFastCard } from '../fasting/FastCard';
import { FastingErrorBoundary } from '../fasting/FastingErrorBoundary';
import { InstallBanner } from '../InstallBanner';
import { endLatchStore } from '../weight/stores';
import { WeightCard } from '../weight/WeightCard';
import { AlcoholHelpCard } from './AlcoholHelpCard';
import { DrinksCard } from './DrinksCard';
import { useFocusRescue } from './focus';
import { LaterStepCard } from './LaterStepCard';
import { RemindersCard } from './RemindersCard';
import { LiveStatusBlock, StatusBlock } from './StatusBlock';
import { StepsCard } from './StepsCard';
import { readToday, type TodayInputs, type TodaySource, todayView } from './view';
import { WaterCard } from './WaterCard';

/**
 * Today (UX_SCREENS section 2; item 16 design section 1.1), in this order: the date and status
 * line; item 13's Talk to someone card; the Reminders card when the backup reminder is prominent
 * (D25); the app update card; the install banner; Weight (item 14) and Fast (item 15) with their
 * own cards; Nutrition so far; Water and Steps side by side; Movement; Drinks; and the Reminders
 * card in its normal place. A block not shown leaves no gap. Nothing can be written until setup is
 * finished (HS-20, C41), a second guard behind item 13's; while the read is pending only the date
 * shows, and a failed read offers a reload (T23, T24).
 */
export function TodayScreen(): ReactElement {
  const storage = useStore(appStorageStore);
  if (storage === null) {
    // Only outside the app shell: item 13's guard shows the opening screen until storage is open.
    const env = browserEnv();
    return <StatusBlock now={env.now()} zone={env.timeZone()} line={null} />;
  }
  return <TodayWithRecords storage={storage} />;
}

function TodayWithRecords({ storage }: { readonly storage: AppStorage }): ReactElement {
  const now = useNow(storage.env);
  const zone = storage.env.timeZone();
  const date = localDateOf(now, zone);
  const source = useMemo<TodaySource>(
    () => ({ gate: storage.gate, storage, today: date }),
    [storage, date],
  );
  const read = useLiveQueryState(source, readToday);
  // At midnight the read for the new date starts empty: keep the last result until it arrives,
  // so the cards (and an open Log weight panel) do not disappear for a moment.
  const [last, setLast] = useState<TodayInputs | null>(null);
  if (read.status === 'ready' && read.value !== last) setLast(read.value);
  const inputs = read.status === 'ready' ? read.value : last;
  const gateView = useReadinessGates(storage);
  const backup = useBackupReminder(storage);
  const endsPending = useStore(endLatchStore);
  const [editingSteps, setEditingSteps] = useState(false);
  const statusRef = useRef<HTMLDivElement>(null);
  useFocusRescue(statusRef);

  const dateOnly = <StatusBlock ref={statusRef} now={now} zone={zone} line={null} />;
  if (read.status === 'error') {
    return (
      <>
        {dateOnly}
        <Notice role="alert">
          <p>{copy.readFailed}</p>
          <Button
            variant="primary"
            onClick={() => {
              storage.platform.reload();
            }}
          >
            {copy.reload}
          </Button>
        </Notice>
      </>
    );
  }
  if (inputs === null || gateView === undefined) return dateOnly;
  const view = todayView({
    inputs,
    gates: gateView.gates,
    now,
    deviceTimeZone: zone,
    backup,
    endsPending,
  });
  if (!view.setupDone) {
    return (
      <>
        {dateOnly}
        <p className="ui-text-muted">{copy.setupFirst}</p>
      </>
    );
  }
  const { reminders } = view;
  const remindersCard =
    reminders.items.length === 0 ? null : (
      <RemindersCard storage={storage} items={reminders.items} prominent={reminders.prominent} />
    );
  return (
    <>
      <LiveStatusBlock ref={statusRef} storage={storage} now={now} />
      <AlcoholHelpCard storage={storage} />
      {reminders.prominent ? remindersCard : null}
      <UpdateNoticeCard storage={storage} />
      <InstallBanner />
      <WeightCard storage={storage} />
      <FastingErrorBoundary>
        <TodayFastCard storage={storage} />
      </FastingErrorBoundary>
      <LaterStepCard card="nutrition" />
      <div className={editingSteps ? 'ui-card-pair ui-card-pair--stacked' : 'ui-card-pair'}>
        <WaterCard
          key={inputs.today}
          storage={storage}
          date={inputs.today}
          homeTimeZone={inputs.settings.homeTimeZone}
          rows={inputs.water}
          day={view.water}
        />
        <StepsCard
          storage={storage}
          date={inputs.today}
          todayRow={view.steps.today}
          repeat={view.steps.repeat}
          editing={editingSteps}
          onEditing={setEditingSteps}
        />
      </div>
      <LaterStepCard card="movement" />
      <DrinksCard drinks={view.drinks} />
      {reminders.prominent ? null : remindersCard}
    </>
  );
}
