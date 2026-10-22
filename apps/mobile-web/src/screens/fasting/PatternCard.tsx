import {
  dayBarSegments,
  describeEatingWindow,
  fillTemplate,
  formatClockRange,
  formatClockTime,
  patternPill,
} from '@diet/core';
import { fasting, reflux, schedule } from '@diet/core/copy/health';
import { Button, Card, DayBar } from '@diet/ui';
import type { ReactElement, Ref } from 'react';
import type { AppStorage } from '../../db/runtime';
import { ScheduleSettings } from '../settings/EatingScheduleScreen';
import { clearDayWindow } from './actions';
import { kickstartWhenText } from './fastingText';
import { ActionError } from './ActionError';
import { useAction } from './useAction';
import type { FastingState } from './useFasting';
import type { DayChangeView } from './view';

const pattern = fasting.pattern;

/**
 * A per-day change for today or tomorrow, with its Undo when the per-day limit allows it. During a
 * stop-sign pause it names no window time (F20).
 */
function DayChangeLine({
  storage,
  change,
  untimed,
}: {
  readonly storage: AppStorage;
  readonly change: DayChangeView;
  readonly untimed: boolean;
}): ReactElement {
  const action = useAction();
  const range = formatClockRange(change.window.start, change.window.end);
  const line = change.snackAdded
    ? untimed
      ? fasting.mealCheck.snackAddedNoRange[change.day]
      : fillTemplate(fasting.mealCheck.snackAdded[change.day], { range })
    : untimed
      ? reflux.options.changedNoRange[change.day]
      : fillTemplate(reflux.options.changed[change.day], { range });
  return (
    <div>
      <p>{line}</p>
      {change.undoAllowed ? (
        <Button
          variant="quiet"
          disabled={action.busy}
          onClick={() => {
            void action.run(() => clearDayWindow(storage, change.date));
          }}
        >
          {reflux.options.undo}
        </Button>
      ) : (
        <p className="ui-text-muted">{reflux.options.keepsFastShort}</p>
      )}
      <ActionError action={action} />
    </div>
  );
}

/**
 * The Eating pattern card on the Fasting screen (item 15 design 3.5; FS-01, HS-17, C55, C07). The
 * window is described from its clock times only (the pill, the day bar, "1 h eating, 23 h
 * fasting"). There is one editor, item 13's form in settings mode (F2), opened here inline; a new
 * pattern applies at once, and Save removes the per-day changes it no longer fits after naming
 * them.
 */
export function PatternCard({
  storage,
  state,
  open,
  onOpen,
  onClose,
  containerRef,
}: {
  readonly storage: AppStorage;
  readonly state: FastingState;
  readonly open: boolean;
  readonly onOpen: () => void;
  readonly onClose: () => void;
  readonly containerRef?: Ref<HTMLDivElement> | undefined;
}): ReactElement | null {
  const { view, inputs, today } = state;
  if (view.kind !== 'open') return null;
  const standing = view.pattern?.standing ?? null;
  const next = view.pattern?.next ?? null;
  const described = standing === null ? null : describeEatingWindow(standing);
  return (
    <div ref={containerRef}>
      <Card
        label={pattern.label}
        aside={
          standing === null ? undefined : <span className="ui-pill">{patternPill(standing)}</span>
        }
      >
        {standing === null || described === null ? (
          // "No eating schedule is saved yet" is item 13's line for nothing saved at all, so a
          // stored "No fasting plan for now" is named as chosen (item 13 review).
          <p>{view.noPlanChosen ? schedule.none : fasting.card.noPattern}</p>
        ) : (
          <>
            <DayBar segments={dayBarSegments(standing)} labels={schedule.dayBarLabels} />
            <p className="ui-text-lead">{described.summary}</p>
            <p className="ui-text-muted">{described.short}</p>
            {next === null ? null : (
              <p>
                {fillTemplate(next.date > today ? pattern.nextTomorrow : pattern.nextToday, {
                  time: formatClockTime(next.window.start),
                })}
              </p>
            )}
            {/*
              A Kickstart default stored before answer 4 turned yes reads as 22:2 (C07). The open
              form carries its own line, for the pattern being chosen (E19).
            */}
            {inputs.targets.presetChosenBy === 'kickstart-default' && !open ? (
              <p className="ui-text-muted">
                {view.pharmacist
                  ? schedule.kickstartDefaultSetAside
                  : kickstartWhenText(
                      state.context.kickstart.running ? state.context.kickstart.lastDay : null,
                    )}
              </p>
            ) : null}
            {view.dayChanges.map((change) => (
              <DayChangeLine
                key={change.date}
                storage={storage}
                change={change}
                untimed={view.stopSignPause}
              />
            ))}
          </>
        )}
        {/* The open form carries the same line above its choices. */}
        {view.pharmacist && !open ? <p>{fasting.pharmacist}</p> : null}
        {open ? (
          <ScheduleSettings
            storage={storage}
            view={state.gateView}
            targets={inputs.targets}
            onClose={onClose}
          />
        ) : (
          <Button variant="secondary" aria-expanded={false} onClick={onOpen}>
            {pattern.change}
          </Button>
        )}
      </Card>
    </div>
  );
}
