import {
  checkWeeklyPattern,
  dayChoiceOf,
  editorStart,
  type ExerciseData,
  fillTemplate,
  type IsoWeekday,
  joinList,
  type MoveContext,
  patternOptions,
  planChangeRestProblem,
  type WeeklyPatternDay,
  withDayChoice,
} from '@diet/core';
import { move, moveScreen } from '@diet/core/copy/health';
import { Button, ButtonRow, Card, ChoiceList, Notice } from '@diet/ui';
import { type ReactElement, useEffect, useRef, useState } from 'react';
import { type AppStorage, appStorageStore } from '../../db/runtime';
import { formatWeekdayLong } from '../../format';
import { goToTab } from '../../navigation';
import { SaveError } from '../../onboarding/SaveError';
import { useSave } from '../../onboarding/useSave';
import { useStore } from '../../store';
import { MoveTabLink } from './links';
import { MoveReadNotice } from './MoveGateNotice';
import { itemNames } from './moveText';
import { useMoveContext } from './useMoveContext';

const NONE = 'none';

/** The problems of a draft: item 26's rules, then the rolling rest check (null: the standard week). */
function problemsOf(
  data: ExerciseData,
  ctx: MoveContext,
  draft: readonly WeeklyPatternDay[] | null,
): string[] {
  const rules =
    draft === null ? [] : checkWeeklyPattern(data, draft, { jogUnlocked: ctx.jogUnlocked });
  if (rules.length > 0) return rules.map((code) => move.week.problems[code]);
  const rolling = planChangeRestProblem(data, draft, {
    sessions: ctx.sessions,
    today: ctx.today,
    jogUnlocked: ctx.jogUnlocked,
  });
  return rolling === null ? [] : [moveScreen.plan.rollingRest];
}

/**
 * The weekly plan editor (EX-07; design section 1.14): one day open at a time, with a strength and
 * a beach choice. The jog is offered only once jogging is unlocked. Nothing is written until Save
 * plan, and only a plan with no problems saves: item 26's rules, and two rest days in every 7 days
 * in a row counting what was done in the last six (N33). The editor never touches session rows.
 */
function PlanEditor({
  data,
  ctx,
  storage,
}: {
  readonly data: ExerciseData;
  readonly ctx: MoveContext;
  readonly storage: AppStorage;
}): ReactElement {
  const [draft, setDraft] = useState<WeeklyPatternDay[]>(() => editorStart(ctx.week));
  const [open, setOpen] = useState<IsoWeekday | null>(null);
  const [shownProblems, setShownProblems] = useState<string[] | null>(null);
  // Counts refused saves, so each one moves focus to the problems list.
  const [refusals, setRefusals] = useState(0);
  const firstChoice = useRef<HTMLInputElement>(null);
  const problemsRef = useRef<HTMLDivElement>(null);
  const save = useSave();
  const options = patternOptions(data, ctx.jogUnlocked);
  const problems = shownProblems ?? problemsOf(data, ctx, draft);
  const { plan } = moveScreen;

  useEffect(() => {
    if (open !== null) firstChoice.current?.focus();
  }, [open]);
  useEffect(() => {
    if (refusals > 0) problemsRef.current?.focus();
  }, [refusals]);

  const store = (pattern: WeeklyPatternDay[] | null) => {
    const found = problemsOf(data, ctx, pattern);
    if (found.length > 0) {
      setShownProblems(found);
      setRefusals((n) => n + 1);
      return;
    }
    void save
      .run(() => storage.repos.settings.update({ weeklyPattern: pattern }))
      .then((ok) => {
        if (ok) goToTab('move', 'move-plan');
      });
  };

  return (
    <Card label={plan.title}>
      <p>{plan.intro}</p>
      {ctx.week.source === 'default-fallback' ? (
        <Notice tone="info">
          <p>{move.week.fallback}</p>
          <ul className="ui-plain-list">
            {ctx.week.problems.map((code) => (
              <li key={code}>{move.week.problems[code]}</li>
            ))}
          </ul>
        </Notice>
      ) : null}
      {ctx.jogAsWalkDays.length > 0 ? (
        <p className="ui-text-muted">
          {fillTemplate(plan.jogKeptAsWalk, {
            days: joinList(
              ctx.jogAsWalkDays.map((weekday) => {
                const date = ctx.days[weekday - 1]?.date;
                return date === undefined ? '' : formatWeekdayLong(date);
              }),
              moveScreen.listComma,
              moveScreen.listAnd,
            ),
          })}
        </p>
      ) : null}
      <ul className="ui-rows">
        {draft.map((day) => {
          const weekday = day.weekday as IsoWeekday;
          const date = ctx.days[weekday - 1]?.date;
          const name = date === undefined ? String(weekday) : formatWeekdayLong(date);
          const choice = dayChoiceOf(data, day);
          const summary =
            day.templateIds.length === 0 ? plan.restDay : itemNames(data, day.templateIds);
          const isOpen = open === weekday;
          const set = (next: typeof choice) => {
            setDraft((d) => withDayChoice(d, weekday, next));
            setShownProblems(null);
          };
          return (
            <li key={weekday} data-testid={`plan-day-${weekday}`}>
              <Button
                variant="secondary"
                block
                aria-expanded={isOpen}
                onClick={() => {
                  setOpen(isOpen ? null : weekday);
                }}
              >
                {fillTemplate(plan.dayButton, { day: name, summary })}
              </Button>
              {isOpen ? (
                <>
                  <ChoiceList
                    legend={fillTemplate(plan.strengthLegend, { day: name })}
                    name={`plan-strength-${weekday}`}
                    firstInputRef={firstChoice}
                    options={[
                      { value: NONE, label: plan.none },
                      ...options.strength.map((t) => ({ value: t.id, label: t.name })),
                    ]}
                    value={choice.strength ?? NONE}
                    onChange={(value) => {
                      set({ ...choice, strength: value === NONE ? null : value });
                    }}
                  />
                  <ChoiceList
                    legend={fillTemplate(plan.beachLegend, { day: name })}
                    name={`plan-beach-${weekday}`}
                    hint={ctx.jogUnlocked ? undefined : plan.jogHint}
                    options={[
                      { value: NONE, label: plan.none },
                      ...options.beach.map((t) => ({ value: t.id, label: t.name })),
                    ]}
                    value={choice.beach ?? NONE}
                    onChange={(value) => {
                      set({ ...choice, beach: value === NONE ? null : value });
                    }}
                  />
                </>
              ) : null}
            </li>
          );
        })}
      </ul>
      {problems.length > 0 ? (
        <div ref={problemsRef} role="status" tabIndex={-1}>
          <p className="ui-text-strong">{plan.problemsTitle}</p>
          <ul className="ui-plain-list">
            {problems.map((text) => (
              <li key={text}>{text}</li>
            ))}
          </ul>
        </div>
      ) : null}
      <ButtonRow stacked>
        <Button
          variant="primary"
          block
          disabled={save.busy}
          onClick={() => {
            store(draft);
          }}
        >
          {plan.save}
        </Button>
        <Button
          variant="secondary"
          block
          disabled={save.busy}
          onClick={() => {
            store(null);
          }}
        >
          {plan.standard}
        </Button>
        <MoveTabLink from="move-plan">{plan.back}</MoveTabLink>
      </ButtonRow>
      <SaveError save={save} />
    </Card>
  );
}

export function MovePlanScreen(): ReactElement | null {
  const storage = useStore(appStorageStore);
  return storage === null ? null : <PlanWithStorage storage={storage} />;
}

function PlanWithStorage({ storage }: { readonly storage: AppStorage }): ReactElement | null {
  const read = useMoveContext(storage);
  if (read.status === 'pending') return null;
  if (read.status !== 'ready') return <MoveReadNotice read={read} storage={storage} />;
  return <PlanEditor data={read.data} ctx={read.ctx} storage={storage} />;
}
