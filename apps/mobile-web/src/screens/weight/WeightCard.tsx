import { fillTemplate, type GoalView, type WeightOverview } from '@diet/core';
import { privacy, weight } from '@diet/core/copy/health';
import { Button, Card, ChevronIcon } from '@diet/ui';
import { useEffect, useId, useRef, useState, type ReactElement } from 'react';
import type { AppStorage } from '../../db/runtime';
import { formatKg, formatLocalDate } from '../../format';
import { routeHref } from '../../routes';
import { useStore } from '../../store';
import { weightEntryRequestStore } from './entryStore';
import { LogWeightPanel } from './LogWeightPanel';
import { EmptyValue, FourWeekChartView, KgValue, PhaseNotes, Stat, WeightStatus } from './parts';
import { useWeightView, type WeightView } from './useWeightView';
import { WeightCards } from './WeightCards';
import { phaseChip } from './weightText';

/** A link styled as a quiet button, to the Weight screen. */
function WeightLink({ children }: { children: string }): ReactElement {
  return (
    <a className="ui-button ui-button--quiet" href={routeHref('weight')}>
      {children}
      <ChevronIcon />
    </a>
  );
}

/** The long-term goal's slot (W37): a figure only when one is set and usable. */
function GoalValue({ goal }: { goal: Exclude<GoalView, { status: 'gated' }> }): ReactElement {
  switch (goal.status) {
    case 'set':
      return <KgValue kg={goal.goalKg} />;
    case 'none':
      return <EmptyValue>{weight.card.notSetShort}</EmptyValue>;
    case 'needs-height':
      return <EmptyValue>{weight.card.needsHeightShort}</EmptyValue>;
    case 'needs-update':
      return <EmptyValue>{weight.card.needsUpdatingShort}</EmptyValue>;
  }
}

/** The sentences that belong to the stats, under the row (W37). */
function StatNotes({ overview }: { overview: WeightOverview }): ReactElement {
  const { average7Kg, goal, zoneFallback } = overview;
  return (
    <>
      {average7Kg === null ? <p className="ui-text-muted">{weight.card.needs7}</p> : null}
      {goal.status === 'none' ? <WeightLink>{weight.goal.set}</WeightLink> : null}
      {goal.status === 'needs-height' ? (
        <p className="ui-text-muted">{weight.goal.needsHeight}</p>
      ) : null}
      {goal.status === 'needs-update' ? (
        <>
          <p className="ui-text-muted">{weight.goal.needsUpdating}</p>
          <WeightLink>{weight.goal.change}</WeightLink>
        </>
      ) : null}
      {goal.status === 'set' && goal.milestone.kind === 'milestone' ? (
        <p className="ui-text-muted">
          {fillTemplate(weight.card.milestoneStat, { kg: formatKg(goal.milestone.kg) })}
        </p>
      ) : null}
      {goal.status === 'set' && goal.milestone.kind === 'needs-weigh-in' ? (
        <p className="ui-text-muted">{weight.goal.milestoneNeedsWeighIn}</p>
      ) : null}
      {zoneFallback ? <p className="ui-text-muted">{privacy.zoneFallback}</p> : null}
    </>
  );
}

/**
 * The Weight card at the top of Today (UX_SCREENS section 2, card 1; item 14 design section 2.2):
 * the phase chip, Latest, the 7-day average and the long-term goal, the current four-week block
 * with its shaded typical range, the phase note, Log weight, and the way to the Weight screen.
 */
function WeightSummaryCard({
  storage,
  view,
}: {
  storage: AppStorage;
  view: WeightView;
}): ReactElement {
  const { overview } = view;
  const { latest, average7Kg, goal, chart, today } = overview;
  const ids = { latest: useId(), average: useId(), goal: useId() };
  const request = useStore(weightEntryRequestStore);
  const [seenRequest, setSeenRequest] = useState(request);
  const [opened, setOpened] = useState(false);
  const [saved, setSaved] = useState<string | null>(null);
  const fieldRef = useRef<HTMLInputElement>(null);
  const open = opened || request !== seenRequest;
  useEffect(() => {
    const field = fieldRef.current;
    if (!open || field === null) return;
    field.focus();
    if (typeof field.scrollIntoView === 'function') field.scrollIntoView({ block: 'center' });
  }, [open, request]);
  const chip = phaseChip(overview.phase);

  return (
    <Card
      label={weight.card.label}
      aside={chip === null ? undefined : <span className="ui-pill ui-pill--teal">{chip}</span>}
    >
      {latest === null ? (
        <p>{weight.card.noWeighIns}</p>
      ) : (
        <>
          <div className="ui-stats">
            <Stat
              id={ids.latest}
              label={
                latest.date === today
                  ? weight.card.latest
                  : fillTemplate(weight.card.latestOn, {
                      date: formatLocalDate(latest.at, latest.timeZone),
                    })
              }
            >
              <KgValue kg={latest.kg} lead />
            </Stat>
            <Stat id={ids.average} label={weight.card.average7}>
              {average7Kg === null ? (
                <EmptyValue>{weight.card.needsShort}</EmptyValue>
              ) : (
                <KgValue kg={average7Kg} />
              )}
            </Stat>
            {goal.status === 'gated' ? null : (
              <Stat id={ids.goal} label={weight.card.goalStat}>
                <GoalValue goal={goal} />
              </Stat>
            )}
          </div>
          <StatNotes overview={overview} />
          {chart.points.length === 0 ? (
            <p>{weight.card.noWeighInsBlock}</p>
          ) : (
            <FourWeekChartView chart={chart} />
          )}
          <PhaseNotes notes={overview.notes} />
        </>
      )}
      <p role="status" className="ui-text-strong ui-status-line">
        {saved}
      </p>
      {open ? (
        <LogWeightPanel
          storage={storage}
          latest={latest}
          fieldRef={fieldRef}
          onSaved={(message) => {
            setSaved(message);
            setOpened(false);
            setSeenRequest(request);
          }}
        />
      ) : (
        <Button
          block
          onClick={() => {
            setSaved(null);
            setOpened(true);
          }}
        >
          {weight.card.logWeight}
        </Button>
      )}
      <WeightLink>{weight.card.details}</WeightLink>
    </Card>
  );
}

/**
 * Today's weight block (item 16 places it): the Weight card, the outcome line, then the weight
 * cards with the "Start Kickstart today" card. Nothing until the records have loaded.
 */
export function WeightCard({ storage }: { readonly storage: AppStorage }): ReactElement | null {
  const view = useWeightView(storage);
  const [preStartStopSign, setPreStartStopSign] = useState(false);
  if (view === undefined) return null;
  return (
    <>
      <WeightSummaryCard storage={storage} view={view} />
      <WeightStatus storage={storage} />
      <WeightCards
        storage={storage}
        view={view}
        showStartCard
        preStartStopSign={preStartStopSign}
        onPreStartStopSign={setPreStartStopSign}
      />
    </>
  );
}
