import {
  clockTimeFromMinutes,
  featureGateOf,
  fillTemplate,
  formatClockTime,
  formatDuration,
  formatElapsed,
  instantMs,
  isOneMealWindow,
  localDateOf,
  localWallClockOf,
  parseClockTime,
  patternPill,
  reasonStates,
  SNACK_TIME,
  zonedWallTimeToInstant,
} from '@diet/core';
import { fasting, privacy, reflux, schedule } from '@diet/core/copy/health';
import {
  ActionRow,
  Button,
  ButtonRow,
  Card,
  ChevronIcon,
  FastMeter,
  Notice,
  TextField,
} from '@diet/ui';
import { type ReactElement, type ReactNode, useEffect, useId, useRef, useState } from 'react';
import type { AppStorage } from '../../db/runtime';
import { GateNotice } from '../../onboarding/GateNotice';
import { consequenceText } from '../../onboarding/readinessText';
import { fastingHref, routeHref } from '../../routes';
import { changeStart, endFast, saveNote, startFast, undoEnd, undoStart } from './actions';
import { clockAt, eatWindowText, endHintText, joinedText, startedText } from './fastingText';
import { HelpRows } from './HelpRows';
import { MealCheck } from './MealCheck';
import { RefluxOptions } from './RefluxCard';
import { StopSignsRow } from './StopSigns';
import { ActionError, ProblemNotice } from './ActionError';
import { useAction } from './useAction';
import { type FastingRead, type FastingState, useFasting } from './useFasting';
import {
  type MealCheckView,
  type RefluxOptionsView,
  type RunningFastView,
  SNACK_BUTTON_KINDS,
} from './view';

/** How long the "Fast started" and "Fast ended" lines, and their Undo, stay (F46). */
export const OVERLAY_MS = 60_000;

const card = fasting.card;

/** Where focus goes after an action replaces the pressed button. */
type FocusTarget = 'started' | 'ended' | 'start' | 'end' | 'join';

/** The plain link to the Fasting screen, last on every Today card. */
function DetailsLink(): ReactElement {
  return (
    <a className="ui-button ui-button--quiet" href={routeHref('fasting')}>
      {card.detailsLink}
      <ChevronIcon />
    </a>
  );
}

/** "Log a reflux symptom", to the Fasting screen's Reflux card (C47: reachable from Today). */
function RefluxLink(): ReactElement {
  return (
    <ul className="ui-action-list">
      <li>
        <ActionRow href={fastingHref('reflux')} title={card.refluxLink} badge={<ChevronIcon />} />
      </li>
    </ul>
  );
}

/**
 * Answer 3's line, with "hypoglycaemia", when the diabetes-medication reason is stated (RD-03): on
 * the Fasting screen's gated cards, an open fast or not. The prescriber's agreement is confirmed
 * in Settings, Readiness answers (F44). The line follows the gates, so it never says meals keep a
 * deficit another answer closes (item 13 review).
 */
export function AnswerThreeLine({ state }: { readonly state: FastingState }): ReactElement | null {
  const { gateView } = state;
  const { stated } = reasonStates(gateView.input, featureGateOf(gateView.gates, 'fasting').reasons);
  if (!stated.includes('diabetes-medication')) return null;
  return (
    <p>{consequenceText('q3', gateView.input, gateView.gates, state.inputs.profile.dietMode)}</p>
  );
}

/** The card shown when the fasting records cannot be read (design 3.4): reload, and the help rows. */
export function FastingReadError(): ReactElement {
  return (
    <Card label={card.gatedLabel}>
      <Notice role="alert">
        <p>{card.readFailed}</p>
      </Notice>
      <HelpRows />
    </Card>
  );
}

/** The fast's figure, its meter and the "Started … / Eat …" row (mock-up Main). */
function Timer({
  running,
  state,
}: {
  readonly running: RunningFastView;
  readonly state: FastingState;
}): ReactElement {
  const over = running.phase === 'over-ceiling';
  const unit = over
    ? card.overCeilingUnit
    : running.spanPlannedMinutes === null
      ? null
      : fillTemplate(card.ofPlanned, {
          planned: formatDuration(running.spanPlannedMinutes, 'short'),
        });
  const hint = endHintText(running.endHint, state.deviceTimeZone, state.today);
  return (
    <>
      <p className="ui-figure-row" data-testid="fast-timer">
        <span className="ui-figure">
          {formatElapsed(running.clockBehind ? 0 : running.elapsedMs, 'figure')}
        </span>
        {unit === null || running.clockBehind ? null : (
          <span className="ui-figure__unit">{unit}</span>
        )}
      </p>
      <FastMeter
        progressPct={running.meter.progressPct}
        window={running.meter.window}
        over={running.meter.over}
      />
      <p className="ui-split-row">
        <span>{startedText(running, state.today)}</span>
        {hint === null ? null : <span className="ui-split-row__amber">{hint}</span>}
      </p>
      {running.zoneFallback ? <p className="ui-text-muted">{privacy.zoneFallback}</p> : null}
    </>
  );
}

/** "Change start time" on a running fast (design 3.4, 3.8): typed in the device zone. */
function ChangeStart({
  storage,
  state,
  running,
}: {
  readonly storage: AppStorage;
  readonly state: FastingState;
  readonly running: RunningFastView;
}): ReactElement {
  const action = useAction();
  const [fields, setFields] = useState<{ date: string; time: string } | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const { view } = state;
  const history = fasting.history;
  if (fields === null) {
    return (
      <Button
        variant="quiet"
        onClick={() => {
          const at = running.fast.startedAt;
          setFields({
            date: localDateOf(at, state.deviceTimeZone),
            time: clockTimeFromMinutes(localWallClockOf(at, state.deviceTimeZone).minutes),
          });
        }}
      >
        {card.changeStart}
      </Button>
    );
  }
  const save = () => {
    let at: number;
    try {
      at = zonedWallTimeToInstant(fields.date, parseClockTime(fields.time), state.deviceTimeZone);
    } catch {
      setProblem(card.invalid);
      return;
    }
    if (at > state.nowMs) {
      setProblem(history.future);
      return;
    }
    setProblem(null);
    if (view.kind !== 'open') return;
    void action
      .run(() =>
        changeStart(
          storage,
          running.fast,
          new Date(at).toISOString(),
          state.inputs.fasts,
          view.schedule,
        ),
      )
      .then((done) => {
        if (done !== null) setFields(null);
      });
  };
  return (
    <>
      <div className="ui-field-pair">
        <TextField
          label={history.startDate}
          type="date"
          value={fields.date}
          onChange={(event) => {
            setFields({ ...fields, date: event.currentTarget.value });
          }}
        />
        <TextField
          label={history.startTime}
          type="time"
          step={60}
          value={fields.time}
          onChange={(event) => {
            setFields({ ...fields, time: event.currentTarget.value });
          }}
        />
      </div>
      <ProblemNotice problem={problem} />
      <ButtonRow>
        <Button variant="secondary" disabled={action.busy} onClick={save}>
          {history.save}
        </Button>
        <Button
          variant="quiet"
          onClick={() => {
            setFields(null);
            setProblem(null);
          }}
        >
          {history.cancel}
        </Button>
      </ButtonRow>
      <ActionError action={action} />
    </>
  );
}

/** The compact reflux options Today shows: only after a symptom, not for the switches alone (F36). */
function todayOptions(state: FastingState): RefluxOptionsView | null {
  const { view } = state;
  if (view.kind !== 'open') return null;
  const options = view.reflux.options;
  return options === null || !options.symptomTriggered ? null : options;
}

/**
 * The meal-check regions of the card: the closed date's after-window line, then the upcoming date.
 * On Today, a date whose change the reflux options below already name gets no second line for it.
 */
function MealChecks({
  storage,
  state,
  today,
}: {
  readonly storage: AppStorage;
  readonly state: FastingState;
  readonly today: boolean;
}): ReactElement | null {
  const { view } = state;
  if (view.kind !== 'open') return null;
  const regions = [view.closed, view.upcoming].filter(
    (check): check is MealCheckView => check !== null,
  );
  const options = today ? todayOptions(state) : null;
  const changeShownOn = options !== null && options.changed !== null ? options.date : null;
  return (
    <>
      {regions.map((check) => (
        <MealCheck
          key={`${check.region}-${check.date}`}
          storage={storage}
          check={check}
          proteinTargetG={state.context.mealTargets(check.date).proteinTargetG}
          changeShownBelow={check.region === 'upcoming' && check.date === changeShownOn}
        />
      ))}
    </>
  );
}

/** The compact reflux options on Today: only after a symptom, not for the switches alone (F36). */
function TodayRefluxOptions({
  storage,
  state,
}: {
  readonly storage: AppStorage;
  readonly state: FastingState;
}): ReactElement | null {
  const { view } = state;
  if (view.kind !== 'open') return null;
  const options = todayOptions(state);
  if (options === null) return null;
  const upcoming = view.upcoming;
  const snackOffered =
    upcoming !== null &&
    upcoming.date === options.date &&
    upcoming.snack.fits !== null &&
    SNACK_BUTTON_KINDS.includes(upcoming.kind);
  return <RefluxOptions storage={storage} options={options} compact snackOffered={snackOffered} />;
}

/**
 * The current fast (item 15 design 3.3; mock-up Main): Today's Fast card and the first card of the
 * Fasting screen. End is present and enabled whenever a fast runs, in every state, with no step
 * before it (HS-18). Past 24 hours the figure keeps counting, the bar turns amber, and the card
 * says it is fine to eat now with the stop-signs and the help rows (HS-02, FS-02). "Start fast"
 * is the strongest action only outside the window with nothing short (F50). While fasting is
 * switched off there is no timer and no Start; an open fast can still be ended (FS-08).
 */
export function FastCard({
  storage,
  state,
  variant,
}: {
  readonly storage: AppStorage;
  readonly state: FastingState;
  readonly variant: 'today' | 'full';
}): ReactElement | null {
  const { view, nowMs } = state;
  const today = variant === 'today';
  const start = useAction();
  const end = useAction();
  const undo = useAction();
  const note = useAction();
  const [madeStart, setMadeStart] = useState<string | null>(null);
  const [madeEnd, setMadeEnd] = useState<string | null>(null);
  const [noteFor, setNoteFor] = useState<{ id: string; text: string } | null>(null);
  const [noteSaved, setNoteSaved] = useState(false);
  const [askingJoin, setAskingJoin] = useState(false);
  // After End, Start or an Undo the pressed button is gone, so focus moves to what took its place
  // (the overlay line, or the main button again) at the first render that draws it (design 3.9;
  // item 15 review). The write's own re-render and the records' update both come after the tap.
  const ids = useId();
  const focusTo = useRef<FocusTarget | null>(null);
  const setFocusTo = (target: FocusTarget) => {
    focusTo.current = target;
  };
  useEffect(() => {
    if (focusTo.current === null) return;
    const target = document.getElementById(`${ids}-${focusTo.current}`);
    if (target === null) return;
    target.focus();
    focusTo.current = null;
  });

  const running = view.kind === 'gated' ? view.openFast : view.running;
  const onEnd = () => {
    if (running === null) return;
    const id = running.fast.id;
    void end
      .run(() => endFast(storage, id))
      .then((done) => {
        if (done !== null) {
          setMadeEnd(id);
          setNoteSaved(false);
          if (view.kind === 'open') setFocusTo('ended');
        }
      });
  };
  const endButton = (label: string) => (
    <>
      <Button id={`${ids}-end`} variant="primary" block disabled={end.busy} onClick={onEnd}>
        {label}
      </Button>
      <ActionError action={end} />
    </>
  );

  if (view.kind === 'gated') {
    if (running === null) {
      // The Fasting screen lays out its own gated cards (design 3.4).
      if (!today) return null;
      if (view.quiet) {
        // G-quiet: no Fast card, no fasting words and no reasons, only the reflux log (F41).
        return (
          <Card label={reflux.label}>
            <RefluxLink />
          </Card>
        );
      }
      return (
        <Card label={card.gatedLabel}>
          <p className="ui-text-strong">{fasting.gated.title}</p>
          <GateNotice feature="fasting" link linkWhen="actionable" />
          <p className="ui-text-muted">{fasting.gated.kept}</p>
          <RefluxLink />
          <DetailsLink />
        </Card>
      );
    }
    // G+O: a fast started before fasting was switched off can always be ended.
    return (
      <Card label={card.gatedLabel}>
        <p className="ui-text-strong">{fasting.gated.title}</p>
        <p>{fasting.gated.openFast}</p>
        <p>{startedText(running, state.today)}</p>
        <p>{card.fineToEat}</p>
        {running.phase === 'over-ceiling' ? <p>{card.overCeiling}</p> : null}
        {today ? <StopSignsRow /> : null}
        {endButton(fasting.gated.endOpenFast)}
        <GateNotice feature="fasting" link linkWhen="actionable" />
        {today ? null : <AnswerThreeLine state={state} />}
        <p className="ui-text-muted">{fasting.gated.kept}</p>
        {today ? (
          <>
            <RefluxLink />
            <DetailsLink />
          </>
        ) : null}
      </Card>
    );
  }

  const pill = view.pattern === null ? null : patternPill(view.pattern.standing);
  // On the Fasting screen the Eating pattern card carries this line, so it shows once (F38).
  const pharmacist = view.pharmacist && today ? <p>{fasting.pharmacist}</p> : null;
  // After a Kickstart stop-sign answer: no window to wait for, and the fasting stop-signs (F20).
  const stopSignPause = (
    <>
      <Notice role="status">
        <p>{card.stopSignPause}</p>
      </Notice>
      <StopSignsRow />
    </>
  );

  const startedOverlay =
    running !== null &&
    running.fast.id === madeStart &&
    nowMs - instantMs(running.fast.startedAt) < OVERLAY_MS ? (
      <div id={`${ids}-started`} tabIndex={-1}>
        <Notice tone="info" role="status">
          <p>{card.started}</p>
          <Button
            variant="quiet"
            disabled={undo.busy}
            onClick={() => {
              void undo
                .run(() => undoStart(storage, running.fast.id))
                .then((done) => {
                  if (done !== null) setFocusTo('start');
                });
            }}
          >
            {card.undo}
          </Button>
          <ActionError action={undo} />
        </Notice>
      </div>
    ) : null;

  const lastEnded = view.lastEnded;
  const endedAt = lastEnded?.fast.endedAt ?? null;
  const endedOverlay =
    lastEnded !== null &&
    endedAt !== null &&
    lastEnded.fast.id === madeEnd &&
    nowMs - instantMs(endedAt) < OVERLAY_MS ? (
      <div id={`${ids}-ended`} tabIndex={-1}>
        <Notice tone="info" role="status">
          {/* With the clock behind, End stored the start (repos/fasts.ts): say so, not "0 m". */}
          {lastEnded.clockBehind ? (
            <>
              <p>{card.clockBehind}</p>
              <p>{card.endedAtStart}</p>
            </>
          ) : (
            <p>{fillTemplate(card.ended, { length: formatElapsed(lastEnded.spanMs, 'text') })}</p>
          )}
          {lastEnded.over24 ? <p>{card.overCeiling}</p> : null}
          <ButtonRow>
            <Button
              variant="quiet"
              disabled={undo.busy}
              onClick={() => {
                void undo
                  .run(() => undoEnd(storage, lastEnded.fast.id))
                  .then((done) => {
                    if (done !== null) setFocusTo('end');
                  });
              }}
            >
              {card.undo}
            </Button>
            {noteFor === null ? (
              <Button
                variant="quiet"
                onClick={() => {
                  setNoteFor({ id: lastEnded.fast.id, text: lastEnded.fast.note ?? '' });
                  setNoteSaved(false);
                }}
              >
                {card.addNote}
              </Button>
            ) : null}
          </ButtonRow>
          <ActionError action={undo} />
        </Notice>
      </div>
    ) : null;

  // The note editor stays open until saved or cancelled, whatever the 60-second timer does.
  const noteEditor =
    noteFor === null ? (
      noteSaved ? (
        <p role="status">{card.noteSaved}</p>
      ) : null
    ) : (
      <>
        <TextField
          label={card.noteLabel}
          hint={card.noteHint}
          autoComplete="off"
          maxLength={500}
          value={noteFor.text}
          onChange={(event) => {
            setNoteFor({ ...noteFor, text: event.currentTarget.value });
          }}
        />
        <ButtonRow>
          <Button
            variant="secondary"
            disabled={note.busy}
            onClick={() => {
              void note
                .run(() => saveNote(storage, noteFor.id, noteFor.text))
                .then((done) => {
                  if (done !== null) {
                    setNoteFor(null);
                    setNoteSaved(true);
                  }
                });
            }}
          >
            {card.saveNote}
          </Button>
          <Button
            variant="quiet"
            onClick={() => {
              setNoteFor(null);
            }}
          >
            {card.cancel}
          </Button>
        </ButtonRow>
        <ActionError action={note} />
      </>
    );

  let body: ReactNode;
  if (running !== null) {
    const { phase } = running;
    body = (
      <>
        <Timer running={running} state={state} />
        {running.clockBehind ? (
          <Notice role="status">
            <p>{card.clockBehind}</p>
          </Notice>
        ) : null}
        {phase === 'window-open' ? (
          <Notice tone="info" role="status">
            <p>{card.windowOpen}</p>
          </Notice>
        ) : null}
        {phase === 'near-ceiling' && !view.stopSignPause ? (
          <Notice tone="info" role="status">
            <p>{card.nearCeiling}</p>
          </Notice>
        ) : null}
        {view.stopSignPause && phase !== 'over-ceiling' ? stopSignPause : null}
        {phase === 'over-ceiling' ? (
          <>
            <Notice role="status">
              <p>{card.overCeiling}</p>
            </Notice>
            <p>{card.fineToEat}</p>
            <StopSignsRow />
          </>
        ) : null}
        {running.joinedGapMs === null ? null : (
          <Notice tone="info">
            <p>{joinedText(running.joinedGapMs)}</p>
          </Notice>
        )}
        {running.endHint.kind === 'eat-by' ? (
          <Notice tone="info">
            <p>
              {fillTemplate(card.cappedPlan, {
                time: clockAt(running.endHint.atMs, state.deviceTimeZone),
              })}
            </p>
          </Notice>
        ) : null}
        {startedOverlay}
        <MealChecks storage={storage} state={state} today={today} />
        {running.alcoholNote ? (
          <Notice tone="info">
            <p>{fasting.alcoholNote}</p>
          </Notice>
        ) : null}
        {today ? <TodayRefluxOptions storage={storage} state={state} /> : null}
        {pharmacist}
        {endButton(card.end)}
        {today ? null : <ChangeStart storage={storage} state={state} running={running} />}
      </>
    );
  } else {
    const idle = view.idle;
    const next = idle?.next ?? null;
    const openUntil = idle?.openUntil ?? null;
    const runStart = () => {
      void start
        .run(() => startFast(storage, state.inputs.fasts, view.schedule))
        .then((done) => {
          if (done !== null) {
            setMadeStart(done.value.id);
            setNoteFor(null);
            setNoteSaved(false);
            setFocusTo('started');
          }
        });
    };
    const join = view.joinIfStartedNow;
    const startButton =
      askingJoin && join !== null ? (
        // Less than an hour after the last fast ended: say it would join, and when it would not
        // (the 24-hour rule is unchanged; F21).
        <Notice>
          <p id={`${ids}-join`} tabIndex={-1}>
            {fillTemplate(card.joinAsk, {
              end: clockAt(join.endedMs, state.deviceTimeZone),
              time: clockAt(join.separateFromMs, state.deviceTimeZone),
            })}
          </p>
          <ButtonRow>
            <Button
              variant="secondary"
              disabled={start.busy}
              onClick={() => {
                setAskingJoin(false);
                runStart();
              }}
            >
              {card.joinAskStart}
            </Button>
            <Button
              variant="quiet"
              onClick={() => {
                setAskingJoin(false);
                setFocusTo('start');
              }}
            >
              {card.joinAskWait}
            </Button>
          </ButtonRow>
          <ActionError action={start} />
        </Notice>
      ) : (
        <>
          <Button
            id={`${ids}-start`}
            variant={view.startVariant}
            block
            disabled={start.busy}
            onClick={() => {
              if (join === null) {
                runStart();
                return;
              }
              setAskingJoin(true);
              setFocusTo('join');
            }}
          >
            {card.start}
          </Button>
          <ActionError action={start} />
        </>
      );
    body = (
      <>
        {endedOverlay}
        {noteEditor}
        {view.pattern === null ? (
          // A stored "No fasting plan for now" is named as the owner's choice, not as a pattern
          // still to choose (item 15 review).
          <>
            <p>{view.noPlanChosen ? schedule.none : card.noPattern}</p>
            <a className="ui-button ui-button--quiet" href={fastingHref('pattern')}>
              {view.noPlanChosen ? fasting.pattern.change : card.choosePattern}
              <ChevronIcon />
            </a>
          </>
        ) : view.stopSignPause ? (
          <>
            <p>{card.notRunning}</p>
            {stopSignPause}
          </>
        ) : openUntil !== null ? (
          <p>
            {fillTemplate(card.windowOpenUntil, {
              end: formatClockTime(openUntil.window.end),
            })}
          </p>
        ) : (
          <>
            <p>{card.notRunning}</p>
            {next === null ? null : (
              <p className="ui-split-row">
                <span className="ui-split-row__amber">{eatWindowText(next, state.today)}</span>
                {next.window.start === SNACK_TIME && !isOneMealWindow(next.window) ? (
                  <span>
                    {fillTemplate(card.snackAndDinner, { end: formatClockTime(next.window.end) })}
                  </span>
                ) : null}
              </p>
            )}
          </>
        )}
        {view.pattern === null ? null : (
          <MealChecks storage={storage} state={state} today={today} />
        )}
        {today && view.pattern !== null ? (
          <TodayRefluxOptions storage={storage} state={state} />
        ) : null}
        {pharmacist}
        {startButton}
      </>
    );
  }

  return (
    <Card
      label={card.label}
      aside={pill === null ? undefined : <span className="ui-pill">{pill}</span>}
    >
      {body}
      {today ? <DetailsLink /> : null}
    </Card>
  );
}

/** Today's Fast card: nothing while the records open, the read-failure card on an error. */
export function TodayFastCard({ storage }: { readonly storage: AppStorage }): ReactElement | null {
  const read: FastingRead = useFasting(storage);
  if (read.kind === 'loading') return null;
  if (read.kind === 'error') return <FastingReadError />;
  return <FastCard storage={storage} state={read} variant="today" />;
}
