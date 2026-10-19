import {
  clockTimeFromMinutes,
  fillTemplate,
  formatClockRange,
  formatClockTime,
  formatDuration,
  formatElapsed,
  instantMs,
  isOneMealWindow,
  localDateOf,
  localWallClockOf,
  parseClockTime,
  patternPill,
  SNACK_TIME,
  zonedWallTimeToInstant,
} from '@diet/core';
import { fasting, privacy, reflux } from '@diet/core/copy/health';
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
import { type ReactElement, type ReactNode, useState } from 'react';
import type { AppStorage } from '../../db/runtime';
import { GateNotice } from '../../onboarding/GateNotice';
import { fastingHref, routeHref } from '../../routes';
import { changeStart, endFast, saveNote, startFast, undoEnd, undoStart } from './actions';
import { clockAt, endHintText, joinedText, startedText } from './fastingText';
import { HelpRows } from './HelpRows';
import { MealCheck } from './MealCheck';
import { RefluxOptions } from './RefluxCard';
import { StopSignsRow } from './StopSigns';
import { ActionError } from './ActionError';
import { useAction } from './useAction';
import { type FastingRead, type FastingState, useFasting } from './useFasting';
import { type MealCheckView, type RunningFastView, SNACK_BUTTON_KINDS } from './view';

/** How long the "Fast started" and "Fast ended" lines, and their Undo, stay (F46). */
export const OVERLAY_MS = 60_000;

const card = fasting.card;

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
  const hint = endHintText(running.endHint, state.deviceTimeZone);
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
      {problem === null ? null : (
        <Notice role="alert">
          <p>{problem}</p>
        </Notice>
      )}
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

/** The meal-check regions of the card: the closed date's after-window line, then the upcoming date. */
function MealChecks({
  storage,
  state,
}: {
  readonly storage: AppStorage;
  readonly state: FastingState;
}): ReactElement | null {
  const { view } = state;
  if (view.kind !== 'open') return null;
  const regions = [view.closed, view.upcoming].filter(
    (check): check is MealCheckView => check !== null,
  );
  return (
    <>
      {regions.map((check) => (
        <MealCheck
          key={`${check.region}-${check.date}`}
          storage={storage}
          check={check}
          proteinTargetG={view.proteinTargetG}
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
  const options = view.reflux.options;
  if (options === null || !options.symptomTriggered) return null;
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
        }
      });
  };
  const endButton = (label: string) => (
    <>
      <Button variant="primary" block disabled={end.busy} onClick={onEnd}>
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
  const pharmacist = view.pharmacist ? <p>{fasting.pharmacist}</p> : null;

  const startedOverlay =
    running !== null &&
    running.fast.id === madeStart &&
    nowMs - instantMs(running.fast.startedAt) < OVERLAY_MS ? (
      <Notice tone="info" role="status">
        <p>{card.started}</p>
        <Button
          variant="quiet"
          disabled={undo.busy}
          onClick={() => {
            void undo.run(() => undoStart(storage, running.fast.id));
          }}
        >
          {card.undo}
        </Button>
        <ActionError action={undo} />
      </Notice>
    ) : null;

  const lastEnded = view.lastEnded;
  const endedAt = lastEnded?.fast.endedAt ?? null;
  const endedOverlay =
    lastEnded !== null &&
    endedAt !== null &&
    lastEnded.fast.id === madeEnd &&
    nowMs - instantMs(endedAt) < OVERLAY_MS ? (
      <Notice tone="info" role="status">
        <p>{fillTemplate(card.ended, { length: formatElapsed(lastEnded.spanMs, 'text') })}</p>
        {lastEnded.over24 ? <p>{card.overCeiling}</p> : null}
        <ButtonRow>
          <Button
            variant="quiet"
            disabled={undo.busy}
            onClick={() => {
              void undo.run(() => undoEnd(storage, lastEnded.fast.id));
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
        {phase === 'near-ceiling' ? (
          <Notice tone="info" role="status">
            <p>{card.nearCeiling}</p>
          </Notice>
        ) : null}
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
        <MealChecks storage={storage} state={state} />
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
    const startButton = (
      <>
        <Button
          variant={view.startVariant}
          block
          disabled={start.busy}
          onClick={() => {
            void start
              .run(() => startFast(storage, state.inputs.fasts, view.schedule))
              .then((done) => {
                if (done !== null) {
                  setMadeStart(done.value.id);
                  setNoteFor(null);
                  setNoteSaved(false);
                }
              });
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
          <>
            <p>{card.noPattern}</p>
            <a className="ui-button ui-button--quiet" href={fastingHref('pattern')}>
              {card.choosePattern}
              <ChevronIcon />
            </a>
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
                <span className="ui-split-row__amber">
                  {fillTemplate(card.eatWindow, {
                    range: formatClockRange(next.window.start, next.window.end),
                  })}
                </span>
                {next.window.start === SNACK_TIME && !isOneMealWindow(next.window) ? (
                  <span>
                    {fillTemplate(card.snackAndDinner, { end: formatClockTime(next.window.end) })}
                  </span>
                ) : null}
              </p>
            )}
          </>
        )}
        {view.pattern === null ? null : <MealChecks storage={storage} state={state} />}
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
