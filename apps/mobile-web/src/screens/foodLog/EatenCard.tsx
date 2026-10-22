/**
 * The day's entries and their totals (item 23 design 1.4 and 1.5; HS-R18, C11, NU-09). Every
 * figure goes through item 18's totalRows; an entry's badge is entryBadge (none when every figure
 * reads "not known"); "No nutrition figures" shows only for an entry with no badge. A changed
 * amount is rebuilt from the current figures by the repository; a time alone changes nothing else.
 */
import {
  type AmountField,
  amountChecks,
  type AmountProblem,
  entryBadge,
  entryInstant,
  fillTemplate,
  type FoodLogRecord,
  footerForEntries,
  type LabelAmount,
  labelEntry,
  localWallClockOf,
  type LogDay,
  nutritionFooter,
  parseAmount,
  planRefOf,
  planRowRebuildable,
  resolveZone,
  totalRows,
} from '@diet/core';
import { alcohol, foodLog, foods, planner, targets } from '@diet/core/copy/health';
import { Button, ButtonRow, Card, Chip, ExpandableRow, Notice, NutrientTable } from '@diet/ui';
import { type ReactElement, useEffect, useRef, useState } from 'react';
import { formatLocalTime, formatWhole } from '../../format';
import { ServesStepper, TimeField } from './AddFood';
import { AmountChecks, AmountFields } from './LabelForm';
import type { AmountInput, LogContext } from './logContext';
import { findRecipe } from './recipeFigures';
import { badgeTag, entryAmountText, timeProblemText } from './text';
import { useLogWrite } from './useLogWrite';

const copy = foodLog;

/** "18:30", the entry's stored time in its own zone, for the time field. */
function clockText(entry: FoodLogRecord, home: string): string {
  const zone = resolveZone(entry.timeZone, home).timeZone;
  const { minutes } = localWallClockOf(entry.at, zone);
  return `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;
}

function ChangePanel({
  ctx,
  entry,
  onDone,
  onCancel,
}: {
  readonly ctx: LogContext;
  readonly entry: FoodLogRecord;
  readonly onDone: () => void;
  readonly onCancel: () => void;
}): ReactElement {
  const owner = ctx.rows.recipeRows.recipes;
  const titleOf = (id: string) => findRecipe(id, ctx.recipes, owner)?.title ?? null;
  const labelFood =
    entry.sourceKind === 'label'
      ? (ctx.rows.recipeRows.own.find((i) => i.id === entry.refId && i.source === 'label') ?? null)
      : null;
  const servesRebuildable =
    ctx.recipeFoods !== null &&
    (entry.sourceKind === 'recipe'
      ? entry.refId !== null && titleOf(entry.refId) !== null
      : entry.sourceKind === 'plan' &&
        planRowRebuildable(entry, ctx.rows.planDay, titleOf) !== null);
  const [serves, setServes] = useState(entry.servings ?? 1);
  // The stored weight and state; the weight before cooking is asked again (it is not stored).
  const [amount, setAmount] = useState<AmountInput>({
    by: entry.servings !== null && entry.sourceKind === 'label' ? 'serves' : 'grams',
    grams: entry.grams === null ? '' : String(entry.grams),
    weighed: entry.weightBasis,
    before: '',
    serves: entry.servings === null ? '' : String(entry.servings),
  });
  const [problems, setProblems] = useState<Readonly<Partial<Record<AmountField, AmountProblem>>>>(
    {},
  );
  // A changed amount gets the same checks as a new entry (design 1.4); the stored one is not asked
  // again for a time change.
  const [amountChanged, setAmountChanged] = useState(false);
  const [ticked, setTicked] = useState(false);
  const [showChecks, setShowChecks] = useState(false);
  const parsedAmount = labelFood === null ? null : parseAmount(amount, labelFood.nutrientBasis);
  const draft =
    labelFood === null || parsedAmount === null || !parsedAmount.ok
      ? null
      : labelEntry(labelFood, parsedAmount.amount);
  const checks =
    !amountChanged || draft === null || !draft.ok || parsedAmount === null || !parsedAmount.ok
      ? []
      : amountChecks({
          amount: parsedAmount.amount,
          draft: draft.draft,
          proteinTargetG: ctx.proteinTargetG,
        });
  const stored = clockText(entry, ctx.home);
  const [time, setTime] = useState(stored);
  const [timeError, setTimeError] = useState<string | null>(null);
  const write = useLogWrite('change');
  const save = () => {
    let at: string | undefined;
    if (time !== stored) {
      const r = entryInstant(ctx.date, time, ctx.deviceZone, ctx.now);
      if (!r.ok) {
        setTimeError(timeProblemText(r.problem));
        return;
      }
      at = r.at;
    }
    setTimeError(null);
    let parsed: LabelAmount | undefined;
    if (parsedAmount !== null) {
      setProblems(parsedAmount.ok ? {} : parsedAmount.problems);
      setShowChecks(true);
      if (!parsedAmount.ok || (checks.length > 0 && !ticked)) return;
      parsed = parsedAmount.amount;
    }
    const servesChanged = servesRebuildable && serves !== entry.servings;
    void write
      .run(() =>
        ctx.storage.repos.foodLog.changeEntry(entry.id, {
          ...(at === undefined ? {} : { at }),
          ...(parsed === undefined ? {} : { amount: parsed }),
          ...(servesChanged ? { serves } : {}),
        }),
      )
      .then((done) => {
        if (done !== null) onDone();
      });
  };
  return (
    <div className="ui-stack">
      {labelFood !== null ? (
        <>
          <AmountFields
            value={amount}
            onChange={(next) => {
              setAmount(next);
              setAmountChanged(true);
              setTicked(false);
            }}
            basis={labelFood.nutrientBasis}
            servingSizeG={labelFood.servingSizeG}
            problems={problems}
            disabled={false}
          />
          <AmountChecks checks={checks} ticked={ticked} onTick={setTicked} showError={showChecks} />
        </>
      ) : servesRebuildable ? (
        <ServesStepper value={serves} onChange={setServes} />
      ) : (
        <p className="ui-text-muted">{copy.entries.cannotRebuild}</p>
      )}
      <TimeField
        ctx={{ date: ctx.date, today: '' }}
        value={time}
        onChange={setTime}
        error={timeError}
      />
      <ButtonRow>
        <Button
          variant="primary"
          disabled={!ctx.writable}
          aria-disabled={write.busy}
          onClick={save}
        >
          {copy.entries.change}
        </Button>
        <Button variant="quiet" onClick={onCancel}>
          {copy.add.cancel}
        </Button>
      </ButtonRow>
      {write.error === null ? null : (
        <Notice role="alert">
          <p>{write.error}</p>
        </Notice>
      )}
    </div>
  );
}

export function EatenCard({
  ctx,
  day,
  openEntryId,
}: {
  readonly ctx: LogContext;
  readonly day: LogDay;
  /** Opened from Today's Nutrition card (?entry=). */
  readonly openEntryId: string | null;
}): ReactElement {
  const [open, setOpen] = useState<string | null>(openEntryId);
  const [mode, setMode] = useState<'view' | 'change' | 'remove'>('view');
  const [status, setStatus] = useState('');
  const toggles = useRef(new Map<string, HTMLButtonElement | null>());
  const emptyRef = useRef<HTMLParagraphElement>(null);
  const focusAfter = useRef<string | null>(null);
  const write = useLogWrite('change');
  useEffect(() => {
    if (openEntryId !== null) toggles.current.get(openEntryId)?.focus();
  }, [openEntryId]);
  useEffect(() => {
    const target = focusAfter.current;
    if (target === null) return;
    // The live read may still hold the removed entry: wait until the target is rendered (review).
    const element = target === 'empty' ? emptyRef.current : (toggles.current.get(target) ?? null);
    if (element === null) return;
    focusAfter.current = null;
    element.focus();
  });
  const { entries } = day;
  const remove = (entry: FoodLogRecord) => {
    const i = entries.findIndex((e) => e.id === entry.id);
    const next = entries[i + 1] ?? entries[i - 1];
    void write
      .run(() => ctx.storage.repos.foodLog.remove(entry.id))
      .then((done) => {
        if (done === null) return;
        setOpen(null);
        setMode('view');
        setStatus(fillTemplate(copy.entries.removed, { name: entry.name }));
        focusAfter.current = next?.id ?? 'empty';
      });
  };
  return (
    <Card label={copy.entries.label}>
      {entries.length === 0 ? (
        <p ref={emptyRef} tabIndex={-1} className="ui-text-muted">
          {ctx.date === ctx.today ? copy.entries.noneToday : copy.entries.none}
        </p>
      ) : (
        <ul className="ui-divider-rows">
          {entries.map((entry) => {
            const badge = entryBadge(entry, ctx.approved);
            const tag = badgeTag(badge);
            const ref = entry.sourceKind === 'plan' ? planRefOf(entry.refId) : null;
            const expanded = open === entry.id;
            return (
              <ExpandableRow
                key={entry.id}
                title={entry.name}
                detail={fillTemplate(copy.entries.rowDetail, {
                  time: formatLocalTime(entry.at, entry.timeZone),
                  amount: entryAmountText(entry),
                })}
                aside={tag === null ? undefined : <Chip tone={tag.tone}>{tag.text}</Chip>}
                expanded={expanded}
                toggleRef={(el) => {
                  toggles.current.set(entry.id, el);
                }}
                onToggle={() => {
                  setOpen(expanded ? null : entry.id);
                  setMode('view');
                }}
              >
                <p className="ui-text-muted">
                  {entry.sourceKind === 'plan'
                    ? fillTemplate(copy.entries.kind.plan, {
                        slot: ref === null ? '' : planner.slots[ref.slot],
                      })
                    : copy.entries.kind[entry.sourceKind]}
                </p>
                <NutrientTable
                  caption={copy.entries.figuresCaption}
                  rows={totalRows(entry.nutrients, entry.unknownNutrients)}
                />
                {entry.sourceKind === 'recipe' || entry.sourceKind === 'plan' ? (
                  <p className="ui-text-muted">{copy.entries.snapshotNote}</p>
                ) : null}
                {badge === null ? <p className="ui-text-muted">{copy.entries.noFigures}</p> : null}
                {mode === 'change' ? (
                  <ChangePanel
                    ctx={ctx}
                    entry={entry}
                    onDone={() => {
                      setMode('view');
                      setOpen(null);
                      setStatus(copy.entries.saved);
                      focusAfter.current = entry.id;
                    }}
                    onCancel={() => {
                      setMode('view');
                    }}
                  />
                ) : mode === 'remove' ? (
                  <Notice
                    tone="amber"
                    role="status"
                    actions={
                      <ButtonRow>
                        <Button
                          variant="caution"
                          disabled={!ctx.writable}
                          aria-disabled={write.busy}
                          onClick={() => {
                            remove(entry);
                          }}
                        >
                          {copy.entries.removeYes}
                        </Button>
                        <Button
                          variant="quiet"
                          onClick={() => {
                            setMode('view');
                          }}
                        >
                          {copy.entries.removeNo}
                        </Button>
                      </ButtonRow>
                    }
                  >
                    <p>{fillTemplate(copy.entries.removeConfirm, { name: entry.name })}</p>
                  </Notice>
                ) : (
                  <ButtonRow>
                    <Button
                      variant="secondary"
                      disabled={!ctx.writable}
                      onClick={() => {
                        setMode('change');
                      }}
                    >
                      {copy.entries.change}
                    </Button>
                    <Button
                      variant="caution"
                      disabled={!ctx.writable}
                      onClick={() => {
                        setMode('remove');
                      }}
                    >
                      {copy.entries.remove}
                    </Button>
                  </ButtonRow>
                )}
              </ExpandableRow>
            );
          })}
        </ul>
      )}
      <p role="status" className="ui-text-muted ui-status-line">
        {status}
      </p>
      {write.error === null ? null : (
        <Notice role="alert">
          <p>{write.error}</p>
        </Notice>
      )}
    </Card>
  );
}

/** The order the missing-figure lines are listed in (item 21's). */
const MISSING_ORDER = [
  'energyKj',
  'proteinG',
  'carbsG',
  'saturatedFatG',
  'fibreG',
  'fatG',
  'sugarsG',
  'sodiumMg',
] as const;

/** The day's food totals (design 1.5): food only; drinks only in their own lines (C11). */
export function TotalsCard({
  ctx,
  day,
  alcoholShown,
}: {
  readonly ctx: LogContext;
  readonly day: LogDay;
  /** Item 13's alcoholLoggingAvailable. */
  readonly alcoholShown: boolean;
}): ReactElement | null {
  if (day.entries.length === 0) return null;
  const { intake } = day;
  const lines = day.noneKnown
    ? [copy.totals.noneKnown]
    : MISSING_ORDER.flatMap((key) => {
        const count = intake.unknownCounts[key];
        if (count === 0) return [];
        const nutrient = foods.nutrientNamesLower[key];
        return [
          count === 1
            ? fillTemplate(targets.today.missingOne, { nutrient })
            : fillTemplate(targets.today.missingMany, { count, nutrient }),
        ];
      });
  const drinks = intake.alcohol;
  return (
    <Card label={copy.totals.label}>
      <NutrientTable caption={copy.totals.caption} rows={totalRows(intake.food, day.unknownKeys)} />
      {lines.map((line) => (
        <p key={line} className="ui-text-muted">
          {line}
        </p>
      ))}
      {alcoholShown && drinks.count > 0 ? (
        <>
          <p className="ui-text-muted" data-part="alcohol">
            {drinks.unknownCount === drinks.count
              ? alcohol.dayEnergy.segmentUnknown
              : fillTemplate(
                  drinks.unknownCount === 0
                    ? alcohol.dayEnergy.segment
                    : copy.totals.alcoholAtLeast,
                  { kj: formatWhole(drinks.knownKj) },
                )}
          </p>
          {drinks.unknownCount === 0 ? null : (
            // Item 21's line: the day's total is incomplete (HS-37).
            <p className="ui-text-muted" data-part="alcohol">
              {drinks.unknownCount === 1
                ? alcohol.dayEnergy.unknownOne
                : fillTemplate(alcohol.dayEnergy.unknownMany, { count: drinks.unknownCount })}
            </p>
          )}
          <p className="ui-text-muted" data-part="alcohol">
            {copy.totals.alcoholApart}
          </p>
        </>
      ) : null}
      <p className="ui-text-small">
        {nutritionFooter(footerForEntries(day.entries, ctx.approved))}
      </p>
    </Card>
  );
}
