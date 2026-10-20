import {
  beachPromptLines,
  type BeforeStartStep,
  type ExerciseData,
  fillTemplate,
  type Id,
  joinList,
  type LocalDate,
  type MoveContext,
  painFreeOnlyExercises,
  type PreCheck,
  PRE_CHECK_KEYS,
  preCheckOutcome,
  type SessionChoice,
  type SessionRecord,
  sessionMinutes,
  sessionMode,
  type SessionScreenState,
  sessionScreenState,
  type SessionTemplate,
  startGateFor,
} from '@diet/core';
import { move, moveScreen } from '@diet/core/copy/health';
import { Button, ButtonRow, Card, ChoiceList } from '@diet/ui';
import { Fragment, type ReactElement, type ReactNode, useEffect, useRef, useState } from 'react';
import type { AppStorage } from '../../db/runtime';
import { formatLocalDay } from '../../format';
import { SaveError } from '../../onboarding/SaveError';
import { useSave } from '../../onboarding/useSave';
import { SafetyRows } from '../weight/parts';
import { FinishCard } from './FinishCard';
import { MoveTabLink } from './links';
import { heatWaterText, movementLines } from './moveText';
import { SessionLog } from './SessionLog';
import { moveSaveMessage, removeRestedSession, startSession, writeSession } from './sessionWrites';

type PreCheckKey = (typeof PRE_CHECK_KEYS)[number];
type Answers = Readonly<Record<PreCheckKey, 'yes' | 'no' | null>>;
const NO_ANSWERS: Answers = Object.freeze(
  Object.fromEntries(PRE_CHECK_KEYS.map((key) => [key, null])) as Record<PreCheckKey, null>,
);
const ANSWER_OPTIONS = [
  { value: 'yes', label: move.preCheck.yes },
  { value: 'no', label: move.preCheck.no },
];

const complete = (answers: Answers): PreCheck | null =>
  PRE_CHECK_KEYS.every((key) => answers[key] !== null) ? (answers as PreCheck) : null;

/** The view's identity: a write is reported only once the live records move it on (N29, N31). */
const viewKey = (state: SessionScreenState, reopened: Id | null): string =>
  `${state.kind}:${'row' in state ? state.row.id : ''}:${reopened ?? ''}`;

const nameOf = (template: SessionTemplate | null): string =>
  template?.name ?? moveScreen.today.unknownTemplate;

/** The check's six questions and, once all are answered, the choice (design section 1.8). */
function PreCheckCard({
  data,
  ctx,
  template,
  answers,
  locked,
  busy,
  onAnswer,
  onChoose,
  save,
}: {
  readonly data: ExerciseData;
  readonly ctx: MoveContext;
  readonly template: SessionTemplate;
  readonly answers: Answers;
  readonly locked: boolean;
  readonly busy: boolean;
  readonly onAnswer: (key: PreCheckKey, value: 'yes' | 'no') => void;
  readonly onChoose: (choice: SessionChoice, check: PreCheck) => void;
  readonly save: ReturnType<typeof useSave>;
}): ReactElement {
  const check = complete(answers);
  const { preCheck } = move;
  let choice: ReactNode = null;
  if (check !== null) {
    // HS-29 and ruling 9: any yes, a recent Kickstart stop sign or a fast past 24 hours leaves
    // only the lighter session or rest; the fasted note never shows while fasting is gated.
    const outcome = preCheckOutcome(check, {
      fastingNow: ctx.fastingNow,
      recentStopSign: ctx.stopSignOn !== null,
      fastOverCeiling: ctx.fastOverCeiling,
    });
    choice = (
      <div aria-live="polite" data-testid="choice">
        {outcome.notes.map((note) => {
          if (note === 'recentStopSign') {
            return (
              <Fragment key={note}>
                <p className="ui-text-strong">
                  {fillTemplate(preCheck.recentStopSign, {
                    day: formatLocalDay(ctx.stopSignOn ?? ctx.today),
                  })}
                </p>
                <SafetyRows />
              </Fragment>
            );
          }
          if (note === 'fasted') {
            return (
              <Fragment key={note}>
                <p>{preCheck.fasted}</p>
                <p>{preCheck.eatFirst}</p>
              </Fragment>
            );
          }
          return <p key={note}>{preCheck[note]}</p>;
        })}
        <ButtonRow stacked>
          {outcome.choices.map((c, i) => (
            <Button
              key={c}
              variant={i === 0 ? 'primary' : 'secondary'}
              block
              disabled={busy}
              onClick={() => {
                onChoose(c, check);
              }}
            >
              {move.choices[c]}
            </Button>
          ))}
        </ButtonRow>
        {outcome.choices.includes('lighter') ? (
          <p className="ui-text-muted">{move.lighter}</p>
        ) : null}
        <p className="ui-text-muted">{preCheck.notDiagnosis}</p>
        <SaveError save={save} />
      </div>
    );
  }
  return (
    <Card label={preCheck.title}>
      <p className="ui-text-strong">{template.name}</p>
      <p className="ui-text-muted">
        {fillTemplate(moveScreen.today.minutes, {
          minutes: sessionMinutes(data, template, ctx.equipment),
        })}
      </p>
      <p>{template.summary}</p>
      <p>{preCheck.intro}</p>
      {PRE_CHECK_KEYS.map((key) => (
        <ChoiceList
          key={key}
          layout="inline"
          legend={preCheck.questions[key]}
          name={`precheck-${key}`}
          options={ANSWER_OPTIONS}
          value={answers[key]}
          disabled={locked || busy}
          onChange={(value) => {
            onAnswer(key, value === 'yes' ? 'yes' : 'no');
          }}
        />
      ))}
      {check === null ? (
        <p className="ui-text-muted" role="status">
          {preCheck.mustAnswer}
        </p>
      ) : (
        choice
      )}
    </Card>
  );
}

/** What comes before Start, in item 26's order: the beach prompts, the pain-free note, the check. */
function BeforeStart({
  data,
  ctx,
  template,
  steps,
  children,
}: {
  readonly data: ExerciseData;
  readonly ctx: MoveContext;
  readonly template: SessionTemplate;
  readonly steps: readonly BeforeStartStep[];
  readonly children: ReactNode;
}): ReactElement {
  const { beachPrompts, painFreeOnly } = move.safety;
  return (
    <>
      {steps.includes('beachPrompts') ? (
        <Card label={beachPrompts.title}>
          <ul className="ui-plain-list">
            {beachPromptLines({ dietMode: ctx.dietMode, gates: ctx.gates }).map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
          <p>{heatWaterText(data, template, ctx)}</p>
        </Card>
      ) : null}
      {steps.includes('painFreeOnly') ? (
        <Card label={painFreeOnly.title}>
          <p>{painFreeOnly.body}</p>
          <p>
            {fillTemplate(painFreeOnly.inSession, {
              names: joinList(
                painFreeOnlyExercises(data, template, ctx.equipment).map((e) => e.name),
                moveScreen.listComma,
                moveScreen.listAnd,
              ),
            })}
          </p>
        </Card>
      ) : null}
      {steps.includes('preCheck') ? children : null}
    </>
  );
}

/** A finished session's read-only lines: its ratings and note, as history shows them. */
function ReadOnlyDone({ row }: { readonly row: SessionRecord }): ReactElement {
  const rating = (n: number | null) => (n === null ? moveScreen.history.notRated : String(n));
  return (
    <>
      <p>
        {fillTemplate(moveScreen.history.ratings, {
          exertion: rating(row.exertion),
          soreness: rating(row.soreness),
          energy: rating(row.energy),
        })}
        {row.note === null ? null : ` ${fillTemplate(moveScreen.history.note, { note: row.note })}`}
      </p>
      {row.preCheck === null ? (
        <p className="ui-text-muted">{moveScreen.finish.noCheckDone}</p>
      ) : null}
      <MoveTabLink from="move-session" />
    </>
  );
}

/**
 * One session on the session screen (design sections 1.6 to 1.11), from sessionScreenState on the
 * live records, so a write moves it on by itself: before start (the steps and the check), the log,
 * the finish, the done summary, a rest, a refusal, or a session that can only be finished now
 * (the plan or jogging changed, or midnight passed while it was open).
 */
export function SessionFlow({
  data,
  ctx,
  storage,
  templateId,
  startAtFinish,
}: {
  readonly data: ExerciseData;
  readonly ctx: MoveContext;
  readonly storage: AppStorage;
  readonly templateId: string | null;
  readonly startAtFinish: boolean;
}): ReactElement {
  const [check, setCheck] = useState<{ on: LocalDate; answers: Answers }>(() => ({
    on: ctx.today,
    answers: NO_ANSWERS,
  }));
  // Answers given before midnight are never written after it.
  const answers = check.on === ctx.today ? check.answers : NO_ANSWERS;
  const [step, setStep] = useState<'log' | 'finish'>(() =>
    startAtFinish && sessionScreenState(data, ctx, templateId, null).kind === 'log'
      ? 'finish'
      : 'log',
  );
  const [chosen, setChosen] = useState<'planned' | 'lighter' | null>(null);
  const [pinnedRowId, setPinnedRowId] = useState<Id | null>(null);
  const [reopened, setReopened] = useState<Id | null>(null);
  const [pending, setPending] = useState<string | null>(null);
  const [justSaved, setJustSaved] = useState<Id | null>(null);
  // Where focus goes once the live records move the view on to one of `until` (section 1.17):
  // kept through an interim view, such as the rest card while a reopened rest becomes the log.
  const focusFrom = useRef<{
    key: string;
    target: 'first' | 'check';
    until: readonly SessionScreenState['kind'][] | null;
  } | null>(null);
  const box = useRef<HTMLDivElement>(null);
  const save = useSave(moveSaveMessage);

  const state = sessionScreenState(data, ctx, templateId, pinnedRowId);
  // The row shown in the log stays in view across midnight (finish only; section 1.17).
  if (pinnedRowId === null && (state.kind === 'log' || state.kind === 'finish-only')) {
    setPinnedRowId(state.row.id);
  }
  const key = `${viewKey(state, reopened)}:${step}`;
  if (pending !== null && pending !== key) setPending(null);
  const busy = pending !== null;

  const kind = state.kind;
  const shownKey = useRef(key);
  useEffect(() => {
    const changed = shownKey.current !== key;
    shownKey.current = key;
    const request = focusFrom.current;
    const headings = [...(box.current?.querySelectorAll('h2') ?? [])];
    if (request === null) {
      // The view changed by itself (midnight, another tab) and took the focused control with it.
      if (changed && document.activeElement === document.body) headings[0]?.focus();
      return;
    }
    if (request.key === key || (request.until !== null && !request.until.includes(kind))) return;
    focusFrom.current = null;
    const target =
      request.target === 'check'
        ? headings.find((h) => h.textContent === move.preCheck.title)
        : headings[0];
    target?.focus();
  }, [key, kind]);
  const focusAfter = (
    target: 'first' | 'check',
    until: readonly SessionScreenState['kind'][] | null = null,
  ) => {
    focusFrom.current = { key, target, until };
  };

  /** A write that moves the view on to `until`: disabled from the tap until it does, or fails. */
  const act = (
    write: () => Promise<unknown>,
    until: readonly SessionScreenState['kind'][],
    target: 'first' | 'check' = 'first',
  ) => {
    setPending(key);
    focusAfter(target, until);
    void save.run(write).then((ok) => {
      if (!ok) {
        setPending(null);
        focusFrom.current = null;
      }
    });
  };
  const restRow = (row: SessionRecord) => {
    act(() => writeSession(storage, data, row.id, { status: 'rested' }, 'unticked'), ['rested']);
  };
  /** The finish card's props shared by the log, finish-only and done views. */
  const finishProps = (row: SessionRecord, mode: 'log' | 'finish-only' | 'done') => ({
    data,
    storage,
    row,
    mode,
    saved: justSaved === row.id,
    onEdited: () => {
      setJustSaved(null);
    },
    restDisabled: busy,
  });
  let view: ReactNode;
  switch (state.kind) {
    case 'blocked':
      // Never reached: the route shows RD-05's notice before the flow (section 1.2).
      view = null;
      break;
    case 'refused':
      view = (
        <Card label={nameOf(state.template)}>
          <p>{move.start.problems[state.problem]}</p>
          <MoveTabLink from="move-session" />
        </Card>
      );
      break;
    case 'before-start':
    case 'rested': {
      const reopenedRow = state.kind === 'rested' && reopened === state.row.id ? state.row : null;
      if (state.kind === 'rested' && reopenedRow === null) {
        const { row, undo } = state;
        const name = nameOf(state.template);
        view = (
          <Card label={nameOf(state.template)}>
            <p className="ui-text-lead">{move.rest.rested}</p>
            {undo === 'remove' ? (
              <Button
                variant="quiet"
                disabled={busy}
                onClick={() => {
                  act(() => removeRestedSession(storage, row.id), ['before-start'], 'check');
                }}
              >
                {fillTemplate(moveScreen.today.undoRest, { name })}
              </Button>
            ) : null}
            {undo === 'reopen' ? (
              <Button
                variant="quiet"
                onClick={() => {
                  // Writes nothing: the choice is shown again with the stored answers, locked, so a
                  // yes given today is never erased (N5).
                  setReopened(row.id);
                  focusAfter('check');
                }}
              >
                {/* The same words as the link on Move and Today that leads here (N5). */}
                {fillTemplate(moveScreen.today.changeChoice, { name })}
              </Button>
            ) : null}
            <SaveError save={save} />
            <MoveTabLink from="move-session" />
          </Card>
        );
        break;
      }
      const { template } = state;
      const gate =
        reopenedRow === null
          ? null
          : startGateFor(data, ctx, reopenedRow.templateId, reopenedRow.id);
      const steps =
        state.kind === 'before-start' ? state.steps : gate?.kind === 'ready' ? gate.steps : [];
      if (template === null) {
        view = null;
        break;
      }
      const shown: Answers = reopenedRow?.preCheck ?? answers;
      view = (
        <BeforeStart data={data} ctx={ctx} template={template} steps={steps}>
          <PreCheckCard
            data={data}
            ctx={ctx}
            template={template}
            answers={shown}
            locked={reopenedRow !== null}
            busy={busy}
            save={save}
            onAnswer={(k, value) => {
              setCheck({ on: ctx.today, answers: { ...answers, [k]: value } });
            }}
            onChoose={(choice, preCheck) => {
              act(
                async () => {
                  await startSession(storage, data, {
                    ctx,
                    templateId: template.id,
                    check: preCheck,
                    choice,
                    reopened: reopenedRow?.id ?? null,
                  });
                  if (choice !== 'rest') setChosen(choice);
                  setReopened(null);
                  setStep('log');
                },
                choice === 'rest' ? ['rested'] : ['log'],
              );
            }}
          />
        </BeforeStart>
      );
      break;
    }
    case 'log': {
      const { row, template } = state;
      const mode = sessionMode(template, row, chosen, ctx);
      view =
        step === 'finish' ? (
          <FinishCard
            key={`${row.id}-log`}
            {...finishProps(row, 'log')}
            onSaved={() => {
              setJustSaved(row.id);
              // The done summary's heading takes focus once the row reads as done.
              focusAfter('first', ['done']);
            }}
            onBack={() => {
              setStep('log');
              focusAfter('first');
            }}
            onRest={() => {
              restRow(row);
            }}
          />
        ) : (
          <SessionLog
            data={data}
            ctx={ctx}
            storage={storage}
            template={template}
            row={row}
            mode={mode}
            restDisabled={busy}
            onRest={() => {
              restRow(row);
            }}
            onFinish={() => {
              setStep('finish');
              focusAfter('first');
            }}
          />
        );
      break;
    }
    case 'finish-only': {
      const { row, reason } = state;
      view = (
        <>
          <Card label={nameOf(state.template)}>
            {reason === 'day-changed' ? (
              <p>
                {fillTemplate(moveScreen.session.dayChanged, { day: formatLocalDay(row.date) })}
              </p>
            ) : (
              <p>
                {move.start.problems[reason]} {moveScreen.session.refusedKept}
              </p>
            )}
            <ul className="ui-plain-list">
              {movementLines(data, row).map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
          </Card>
          <FinishCard
            key={`${row.id}-finish-only`}
            {...finishProps(row, 'finish-only')}
            onSaved={() => {
              setJustSaved(row.id);
              focusAfter('first', ['done']);
            }}
          />
        </>
      );
      break;
    }
    case 'done': {
      const { row, editable } = state;
      view = (
        <>
          <Card label={nameOf(state.template)}>
            <p>{move.week.dayDone}</p>
            <ul className="ui-plain-list">
              {movementLines(data, row).map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
            {editable ? null : <ReadOnlyDone row={row} />}
          </Card>
          {editable ? (
            <FinishCard
              key={`${row.id}-done`}
              {...finishProps(row, 'done')}
              onSaved={() => {
                setJustSaved(row.id);
              }}
            />
          ) : null}
        </>
      );
      break;
    }
  }
  return (
    <div ref={box} className="ui-move-flow">
      {view}
    </div>
  );
}
