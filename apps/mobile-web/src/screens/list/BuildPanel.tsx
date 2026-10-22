/**
 * Make, update or start a new list from the plan (item 24 design 1.5): the first of seven days,
 * what the plan holds for them (meals that cannot be read, 5 pm snack windows with no meal, J46),
 * and one tap. On success the parent closes the panel and says so in its status line; a refusal
 * or failure stays here, in an alert that takes focus, with nothing written.
 */
import {
  addDays,
  fillTemplate,
  formatClockTime,
  type GroceryListRecord,
  isLocalDate,
  type LocalDate,
  SNACK_TIME,
  calendarDateText,
} from '@diet/core';
import { grocery, privacy } from '@diet/core/copy/health';
import type { ListFoods } from '@diet/grocery';
import { Button, ButtonRow, Card, Notice, TextField } from '@diet/ui';
import { type ReactElement, useEffect, useRef, useState } from 'react';
import type { AppStorage } from '../../db/runtime';
import { Progress } from '../backup/Progress';
import { type BuildMode, type BuildOutcome, runBuild } from './buildList';
import { usePlanSummary } from './useListScreen';
import type { ListMessage } from './writeErrors';

const copy = grocery.build;

function dateProblem(text: string): string | null {
  if (!isLocalDate(text)) return copy.dateErrors.format;
  return text < '2000-01-01' || text > '2099-12-31' ? copy.dateErrors.range : null;
}

export function BuildPanel({
  storage,
  foods,
  foodsStatus,
  mode,
  current,
  today,
  onBuilt,
  onCancel,
}: {
  readonly storage: AppStorage;
  readonly foods: ListFoods | null;
  readonly foodsStatus: 'pending' | 'error' | 'ready';
  readonly mode: BuildMode;
  readonly current: GroceryListRecord | null;
  readonly today: LocalDate;
  readonly onBuilt: (outcome: Extract<BuildOutcome, { ok: true }>) => void;
  readonly onCancel: () => void;
}): ReactElement {
  const [firstDay, setFirstDay] = useState<string>(today);
  const [dateError, setDateError] = useState<string | null>(null);
  const [running, setRunning] = useState(false);
  const [failure, setFailure] = useState<ListMessage | null>(null);
  const hintRef = useRef<HTMLParagraphElement>(null);
  const failureRef = useRef<HTMLDivElement>(null);
  const valid: LocalDate | null = dateProblem(firstDay) === null ? firstDay : null;
  const summary = usePlanSummary(storage, valid);

  useEffect(() => {
    hintRef.current?.focus();
  }, []);
  useEffect(() => {
    if (failure !== null) failureRef.current?.focus();
  }, [failure]);

  const build = async (buildMode: BuildMode) => {
    const problem = dateProblem(firstDay);
    setDateError(problem);
    if (problem !== null || foods === null) return;
    setRunning(true);
    setFailure(null);
    const outcome = await runBuild(storage, foods, {
      mode: buildMode,
      firstDay,
      current,
    });
    setRunning(false);
    if (outcome.ok) onBuilt(outcome);
    else setFailure(outcome.message);
  };

  const updating = mode === 'update' && current !== null;
  const count = (one: string, many: string, n: number) =>
    n === 1 ? one : fillTemplate(many, { count: n });

  return (
    <Card label={updating ? copy.labelUpdate : copy.labelNew}>
      {failure === null ? null : (
        <div ref={failureRef} tabIndex={-1}>
          <Notice
            tone="amber"
            role="alert"
            actions={
              failure.reload === true ? (
                <Button variant="secondary" onClick={storage.platform.reload}>
                  {privacy.backupCard.reload}
                </Button>
              ) : undefined
            }
          >
            <p>{failure.text}</p>
          </Notice>
        </div>
      )}
      <p ref={hintRef} tabIndex={-1} className="ui-step-start">
        {copy.firstDayHint}
      </p>
      <TextField
        type="date"
        label={copy.firstDay}
        min="2000-01-01"
        max="2099-12-31"
        value={firstDay}
        error={dateError ?? undefined}
        onChange={(event) => {
          setFirstDay(event.currentTarget.value);
        }}
      />
      {valid === null ? null : (
        <p>
          {fillTemplate(copy.covers, {
            from: calendarDateText(valid, today),
            to: calendarDateText(addDays(valid, 6), today),
          })}
        </p>
      )}
      {summary === undefined ? null : summary.meals === 0 ? (
        <Notice tone="info">{copy.noMeals}</Notice>
      ) : (
        <p>
          {`${count(copy.mealOne, copy.mealsMany, summary.meals)} ${count(copy.dayOne, copy.daysMany, summary.days)}`}
        </p>
      )}
      {summary !== undefined && summary.unreadable > 0 ? (
        <Notice tone="amber">
          {count(copy.unreadableOne, copy.unreadableMany, summary.unreadable)}
        </Notice>
      ) : null}
      {summary !== undefined && summary.snackDays > 0 ? (
        <p className="ui-text-muted">
          {fillTemplate(summary.snackDays === 1 ? copy.snackOne : copy.snackMany, {
            count: summary.snackDays,
            time: formatClockTime(SNACK_TIME),
          })}
        </p>
      ) : null}
      {updating ? (
        <>
          <p className="ui-text-muted">{copy.keepsYours}</p>
          <p className="ui-text-muted">{copy.asksAgain}</p>
          <p className="ui-text-muted">{copy.substitutesAgain}</p>
        </>
      ) : null}
      {running ? <Progress text={copy.working} /> : null}
      {foodsStatus === 'error' ? (
        <>
          <Notice tone="amber">{copy.foodsUnavailable}</Notice>
          <ButtonRow>
            <Button variant="quiet" onClick={onCancel}>
              {copy.cancel}
            </Button>
          </ButtonRow>
        </>
      ) : (
        <>
          {foodsStatus === 'pending' ? <p className="ui-text-muted">{copy.foodsLoading}</p> : null}
          {updating ? <p className="ui-text-muted">{copy.startNewNote}</p> : null}
          <ButtonRow>
            <Button
              variant="primary"
              disabled={running || foods === null}
              onClick={() => void build(updating ? 'update' : 'new')}
            >
              {updating ? copy.update : copy.make}
            </Button>
            {updating ? (
              <Button
                variant="secondary"
                disabled={running || foods === null}
                onClick={() => void build('new')}
              >
                {copy.startNew}
              </Button>
            ) : null}
            <Button variant="quiet" onClick={onCancel}>
              {copy.cancel}
            </Button>
          </ButtonRow>
        </>
      )}
    </Card>
  );
}
