/**
 * The food log's "Add food" card (item 23 design 1.3): from the plan, from a recipe, from a new
 * label, or a label food entered before. Every write goes through the food log repository, which
 * runs the same core rules again; the screen runs them first so the owner sees each problem on
 * its field. A planned meal is logged once: the panels see what is already in the day's log, and
 * logging the same meal again needs the owner's confirmation (HS-23, HS-R23).
 */
import {
  type AmountField,
  amountChecks,
  type AmountProblem,
  type DatabaseSource,
  entryBadge,
  fillTemplate,
  type FoodLogRecord,
  formatNumber,
  type Id,
  type IngredientRecord,
  ingredientMissingLines,
  type Instant,
  type LabelAmount,
  labelEntry,
  labelFoodLoggable,
  type LabelField,
  type LabelFormCheck,
  labelFormFrom,
  labelIngredient,
  type LabelFormInput,
  listRecipes,
  LOG_SERVES,
  matchKey,
  type MealSlot,
  nextServes,
  parseAmount,
  parseLabelForm,
  planMealsToLog,
  recentLabelFoodIds,
  recentRecipeIds,
  recipeEntry,
  sameRecipeLogged,
  totalRows,
} from '@diet/core';
import { foodLog, planner, privacy } from '@diet/core/copy/health';
import {
  Button,
  ButtonRow,
  Chip,
  ExpandableRow,
  Notice,
  NutrientTable,
  Stepper,
  TextField,
} from '@diet/ui';
import { type ReactElement, type Ref, useEffect, useRef, useState } from 'react';
import { StorageRuleError } from '../../db/errors';
import { formatLocalTime } from '../../format';
import { AmountChecks, AmountFields, LabelChecks, LabelFields } from './LabelForm';
import {
  EMPTY_AMOUNT,
  EMPTY_LABEL_FORM,
  type AmountInput,
  type LogContext,
  timeOf,
} from './logContext';
import { findRecipe, portionOf } from './recipeFigures';
import { badgeTag, type LabelFieldErrors, labelProblemText, servesValue } from './text';
import { type LogWrite, useLogWrite } from './useLogWrite';

const copy = foodLog;

export function TimeField({
  ctx,
  value,
  onChange,
  error,
  label = copy.amount.time,
  hint,
  fieldRef,
}: {
  readonly ctx: Pick<LogContext, 'date' | 'today'>;
  readonly value: string;
  readonly onChange: (v: string) => void;
  readonly error: string | null;
  readonly label?: string;
  /** Left out: the hints for food eaten; null: none (water today). */
  readonly hint?: string | null;
  readonly fieldRef?: Ref<HTMLInputElement>;
}): ReactElement {
  return (
    <TextField
      ref={fieldRef}
      type="time"
      label={label}
      hint={
        hint === null
          ? undefined
          : (hint ??
            (ctx.date === ctx.today ? copy.amount.timeHintToday : copy.amount.timeHintPast))
      }
      autoComplete="off"
      value={value}
      error={error ?? undefined}
      onChange={(e) => {
        onChange(e.currentTarget.value);
      }}
    />
  );
}

/** The serves Stepper: quarter serves; an off-grid planned portion is kept until moved. */
export function ServesStepper({
  value,
  onChange,
}: {
  readonly value: number;
  readonly onChange: (n: number) => void;
}): ReactElement {
  return (
    <Stepper
      label={copy.recipe.serves}
      decreaseLabel={copy.recipe.fewer}
      increaseLabel={copy.recipe.more}
      hint={copy.recipe.servesHint}
      min={LOG_SERVES.min}
      max={LOG_SERVES.max}
      step={LOG_SERVES.step}
      value={value}
      formatValue={servesValue}
      onChange={(next) => {
        onChange(nextServes(value, next > value ? 1 : -1));
      }}
    />
  );
}

/** The figures an entry will have, through item 18's totalRows; its badge through entryBadge. */
export function EntryPreview({
  entry,
  approved,
  missingLines = [],
}: {
  readonly entry: Pick<FoodLogRecord, 'nutrients' | 'unknownNutrients' | 'confidence'>;
  readonly approved: readonly DatabaseSource[];
  readonly missingLines?: readonly string[];
}): ReactElement {
  const tag = badgeTag(entryBadge(entry, approved));
  return (
    <>
      <NutrientTable
        caption={copy.recipe.previewCaption}
        rows={totalRows(entry.nutrients, entry.unknownNutrients)}
      />
      {tag === null ? null : (
        <p>
          <Chip tone={tag.tone}>{tag.text}</Chip>
        </p>
      )}
      {missingLines.map((line) => (
        <p key={line} className="ui-text-muted">
          {line}
        </p>
      ))}
    </>
  );
}

function WriteNotice({ write }: { readonly write: LogWrite }): ReactElement | null {
  return write.error === null ? null : (
    <Notice role="alert">
      <p>{write.error}</p>
    </Notice>
  );
}

const atPart = (at: Instant | undefined) => (at === undefined ? {} : { at });

// ---- From a recipe (also the recipe page's "Log as eaten") ----

export function LogRecipePanel({
  ctx,
  recipeId: presetId,
  initialServes = 1,
  plannedSlot = null,
  onLogged,
  onCancel,
}: {
  readonly ctx: LogContext;
  /** The recipe page's recipe; none on the log, where the owner picks one. */
  readonly recipeId?: string;
  readonly initialServes?: number;
  /** Today's planned meal the recipe page was opened from (cross-item ruling 22). */
  readonly plannedSlot?: MealSlot | null;
  readonly onLogged: (entry: FoodLogRecord) => void;
  readonly onCancel: () => void;
}): ReactElement {
  const [picked, setPicked] = useState<string | null>(presetId ?? null);
  const [search, setSearch] = useState('');
  const [serves, setServes] = useState(initialServes);
  const [time, setTime] = useState('');
  const [timeError, setTimeError] = useState<string | null>(null);
  const [confirmAgain, setConfirmAgain] = useState(false);
  const write = useLogWrite(plannedSlot === null ? 'recipe' : 'plan');
  const owner = ctx.rows.recipeRows.recipes;
  const recipe = picked === null ? null : findRecipe(picked, ctx.recipes, owner);
  const already =
    plannedSlot === null && recipe !== null
      ? sameRecipeLogged(ctx.rows.entries, ctx.rows.planDay, ctx.date, recipe.id, ctx.home)
      : null;
  const refusedAsLogged =
    write.failure instanceof StorageRuleError && write.failure.rule === 'already-logged';
  const asking = (confirmAgain && already !== null) || refusedAsLogged;
  // The confirmation takes focus when it replaces Log it, and gives it back when cancelled (review).
  const againRef = useRef<HTMLButtonElement>(null);
  const logItRef = useRef<HTMLButtonElement>(null);
  const wasAsking = useRef(false);
  useEffect(() => {
    if (asking !== wasAsking.current) (asking ? againRef : logItRef).current?.focus();
    wasAsking.current = asking;
  }, [asking]);

  if (recipe === null) {
    const key = matchKey(search);
    const recent = recentRecipeIds(ctx.rows.recent, ctx.rows.recentPlans, 5).flatMap((id) => {
      const r = findRecipe(id, ctx.recipes, owner);
      return r === null ? [] : [r];
    });
    const matches =
      key.length < 2 || ctx.recipes === null
        ? []
        : listRecipes(ctx.recipes, owner)
            .filter((e) => matchKey(e.recipe.title).includes(key))
            .slice(0, 8)
            .map((e) => e.recipe);
    const list = key.length < 2 ? recent : matches;
    return (
      <>
        <TextField
          label={copy.recipe.search}
          hint={copy.recipe.searchHint}
          autoComplete="off"
          value={search}
          onChange={(e) => {
            setSearch(e.currentTarget.value);
          }}
        />
        {list.length === 0 ? (
          key.length < 2 ? null : (
            <p className="ui-text-muted">{copy.recipe.noMatch}</p>
          )
        ) : (
          <>
            <p className="ui-text-muted">
              {key.length < 2 ? copy.recipe.recent : copy.recipe.matches}
            </p>
            {list.map((r) => (
              <Button
                key={r.id}
                variant="secondary"
                block
                onClick={() => {
                  setPicked(r.id);
                }}
              >
                {r.title}
              </Button>
            ))}
          </>
        )}
        <Button variant="quiet" onClick={onCancel}>
          {copy.add.cancel}
        </Button>
      </>
    );
  }

  const preview = ctx.recipeFoods === null ? null : portionOf(recipe, ctx.recipeFoods);
  const draft = preview === null ? null : recipeEntry(preview.figures, serves);

  const log = (logAgain: boolean) => {
    const at = timeOf(ctx, time);
    if (!at.ok) {
      setTimeError(at.error);
      return;
    }
    setTimeError(null);
    if (already !== null && !logAgain) {
      setConfirmAgain(true);
      return;
    }
    void write
      .run(() =>
        plannedSlot !== null
          ? ctx.storage.repos.foodLog.logPlan({
              date: ctx.date,
              slot: plannedSlot,
              serves,
              ...atPart(at.at),
            })
          : ctx.storage.repos.foodLog.logRecipe({
              recipeId: recipe.id,
              serves,
              logAgain,
              ...atPart(at.at),
            }),
      )
      .then((done) => {
        if (done !== null) onLogged(done.value);
      });
  };
  return (
    <>
      <h3>{recipe.title}</h3>
      {plannedSlot === null ? null : (
        <p className="ui-text-muted">
          {fillTemplate(copy.recipe.plannedToday, { slot: planner.slotsLower[plannedSlot] })}
        </p>
      )}
      <ServesStepper value={serves} onChange={setServes} />
      {draft === null || !draft.ok ? null : (
        <EntryPreview
          entry={draft.draft}
          approved={ctx.approved}
          missingLines={preview === null ? [] : ingredientMissingLines(preview.nutrition.lines)}
        />
      )}
      <TimeField ctx={ctx} value={time} onChange={setTime} error={timeError} />
      {asking ? (
        <Notice
          tone="amber"
          role="status"
          actions={
            <ButtonRow>
              <Button
                ref={againRef}
                variant="primary"
                disabled={!ctx.writable}
                aria-disabled={write.busy}
                onClick={() => {
                  log(true);
                }}
              >
                {copy.plan.logAgain}
              </Button>
              <Button
                variant="quiet"
                onClick={() => {
                  setConfirmAgain(false);
                  write.clear();
                }}
              >
                {copy.add.cancel}
              </Button>
            </ButtonRow>
          }
        >
          <p>
            {fillTemplate(copy.recipe.alreadyLogged, {
              title: recipe.title,
              time: already === null ? '' : formatLocalTime(already.at, already.timeZone),
            })}
          </p>
        </Notice>
      ) : (
        <ButtonRow>
          <Button
            ref={logItRef}
            variant="primary"
            disabled={!ctx.writable}
            aria-disabled={write.busy}
            onClick={() => {
              log(false);
            }}
          >
            {copy.add.logIt}
          </Button>
          <Button variant="quiet" onClick={onCancel}>
            {copy.add.cancel}
          </Button>
        </ButtonRow>
      )}
      {refusedAsLogged ? null : <WriteNotice write={write} />}
    </>
  );
}

// ---- From your plan ----

function PlanPanel({
  ctx,
  onLogged,
  onCancel,
}: {
  readonly ctx: LogContext;
  readonly onLogged: (entry: FoodLogRecord) => void;
  readonly onCancel: () => void;
}): ReactElement {
  const write = useLogWrite('plan');
  const [timeFor, setTimeFor] = useState<MealSlot | null>(null);
  const [confirmFor, setConfirmFor] = useState<MealSlot | null>(null);
  const [time, setTime] = useState('');
  const [timeError, setTimeError] = useState<string | null>(null);
  const meals = planMealsToLog(ctx.rows.planDay, ctx.rows.entries, ctx.date, ctx.home);
  const owner = ctx.rows.recipeRows.recipes;
  const pastDay = ctx.date !== ctx.today;
  // Focus follows what replaces a button: the time field, the confirmation, and back (review).
  const timeRef = useRef<HTMLInputElement>(null);
  const againRef = useRef<HTMLButtonElement>(null);
  const askRef = useRef<HTMLButtonElement>(null);
  const lastConfirm = useRef<MealSlot | null>(null);
  useEffect(() => {
    if (timeFor !== null) timeRef.current?.focus();
  }, [timeFor]);
  useEffect(() => {
    if (confirmFor !== lastConfirm.current)
      (confirmFor === null ? askRef : againRef).current?.focus();
    lastConfirm.current = confirmFor;
  }, [confirmFor]);

  const log = (slot: MealSlot, logAgain: boolean) => {
    const at = timeOf(ctx, time);
    if (!at.ok) {
      setTimeError(at.error);
      return;
    }
    setTimeError(null);
    void write
      .run(() =>
        ctx.storage.repos.foodLog.logPlan({ date: ctx.date, slot, logAgain, ...atPart(at.at) }),
      )
      .then((done) => {
        if (done === null) return;
        setTimeFor(null);
        setConfirmFor(null);
        onLogged(done.value);
      });
  };

  if (meals.length === 0)
    return (
      <>
        <p className="ui-text-muted">{copy.plan.none}</p>
        <Button variant="quiet" onClick={onCancel}>
          {copy.add.cancel}
        </Button>
      </>
    );
  return (
    <>
      {meals.every((m) => m.logged !== null) ? (
        <p className="ui-text-muted">{copy.plan.allLogged}</p>
      ) : null}
      <ul className="ui-divider-rows">
        {meals.map((meal) => {
          const recipe = findRecipe(meal.recipeId, ctx.recipes, owner);
          const slotName = planner.slots[meal.slot];
          if (recipe === null)
            return (
              <li key={meal.slot}>
                <p>{slotName}</p>
                <p className="ui-text-muted">{copy.plan.recipeMissing}</p>
              </li>
            );
          const portion =
            meal.myServes === 1
              ? copy.plan.portionOne
              : fillTemplate(copy.plan.portion, { serves: formatNumber(meal.myServes) });
          const figures = ctx.recipeFoods === null ? null : portionOf(recipe, ctx.recipeFoods);
          const draft = figures === null ? null : recipeEntry(figures.figures, meal.myServes);
          const tag =
            draft === null || !draft.ok ? null : badgeTag(entryBadge(draft.draft, ctx.approved));
          return (
            <li key={meal.slot} className="ui-stack">
              <p>
                <strong>
                  {fillTemplate(copy.plan.row, { slot: slotName, title: recipe.title })}
                </strong>
              </p>
              <p className="ui-text-muted">
                {portion} {tag === null ? null : <Chip tone={tag.tone}>{tag.text}</Chip>}
              </p>
              {meal.logged?.by === 'plan' ? (
                <p className="ui-text-muted">
                  {meal.logged.name === recipe.title
                    ? copy.plan.inLog
                    : fillTemplate(copy.plan.inLogAs, { name: meal.logged.name })}
                </p>
              ) : meal.logged?.by === 'recipe' ? (
                <>
                  <p className="ui-text-muted">
                    {fillTemplate(copy.plan.inLogFromRecipe, {
                      time: formatLocalTime(meal.logged.at, ctx.deviceZone),
                    })}
                  </p>
                  {confirmFor === meal.slot ? (
                    <Notice
                      tone="amber"
                      role="status"
                      actions={
                        <ButtonRow>
                          <Button
                            ref={againRef}
                            variant="primary"
                            disabled={!ctx.writable}
                            aria-disabled={write.busy}
                            onClick={() => {
                              log(meal.slot, true);
                            }}
                          >
                            {copy.plan.logAgain}
                          </Button>
                          <Button
                            variant="quiet"
                            onClick={() => {
                              setConfirmFor(null);
                            }}
                          >
                            {copy.add.cancel}
                          </Button>
                        </ButtonRow>
                      }
                    >
                      <p>{fillTemplate(copy.plan.logAgainConfirm, { title: recipe.title })}</p>
                    </Notice>
                  ) : (
                    <Button
                      ref={askRef}
                      variant="quiet"
                      onClick={() => {
                        setConfirmFor(meal.slot);
                      }}
                    >
                      {copy.plan.logAgain}
                    </Button>
                  )}
                </>
              ) : pastDay && timeFor === meal.slot ? (
                <>
                  <TimeField
                    ctx={ctx}
                    value={time}
                    onChange={setTime}
                    error={timeError}
                    hint={copy.plan.pastDayTime}
                    fieldRef={timeRef}
                  />
                  <Button
                    variant="primary"
                    disabled={!ctx.writable}
                    aria-disabled={write.busy}
                    onClick={() => {
                      log(meal.slot, false);
                    }}
                  >
                    {copy.add.logIt}
                  </Button>
                </>
              ) : (
                <Button
                  variant="secondary"
                  disabled={!ctx.writable}
                  aria-disabled={write.busy}
                  onClick={() => {
                    // Today: one tap (UX 3c). A past day asks for the time first.
                    if (pastDay) setTimeFor(meal.slot);
                    else log(meal.slot, false);
                  }}
                >
                  {copy.add.logIt}
                </Button>
              )}
            </li>
          );
        })}
      </ul>
      <WriteNotice write={write} />
      <Button variant="quiet" onClick={onCancel}>
        {copy.add.cancel}
      </Button>
    </>
  );
}

// ---- A label food: the amount step, and a new label ----

function labelErrors(problems: Readonly<Partial<Record<LabelField, string>>>): LabelFieldErrors {
  return problems;
}

/** The amount step for a label food (design 1.3.5), with its preview and checks. */
function useAmountStep(ctx: LogContext) {
  const [amount, setAmount] = useState<AmountInput>(EMPTY_AMOUNT);
  const [problems, setProblems] = useState<Readonly<Partial<Record<AmountField, AmountProblem>>>>(
    {},
  );
  const [ticked, setTicked] = useState(false);
  const [showErrors, setShowErrors] = useState(false);
  const [time, setTime] = useState('');
  const [timeError, setTimeError] = useState<string | null>(null);
  return {
    amount,
    setAmount: (next: AmountInput) => {
      setAmount(next);
      setTicked(false);
    },
    problems,
    ticked,
    setTicked,
    showErrors,
    time,
    setTime,
    timeError,
    /** The parsed amount, the instant and the checks; problems are set on the fields. */
    check(
      food: Parameters<typeof labelEntry>[0] | null,
      basis: IngredientRecord['nutrientBasis'] | null,
    ):
      | { readonly ok: true; readonly amount: LabelAmount; readonly at: Instant | undefined }
      | { readonly ok: false } {
      setShowErrors(true);
      const parsed = parseAmount(amount, basis ?? 'as-sold');
      setProblems(parsed.ok ? {} : parsed.problems);
      const at = timeOf(ctx, time);
      setTimeError(at.ok ? null : at.error);
      if (!parsed.ok || !at.ok || basis === null) return { ok: false };
      if (food !== null) {
        const draft = labelEntry(food, parsed.amount);
        if (draft.ok) {
          const checks = amountChecks({
            amount: parsed.amount,
            draft: draft.draft,
            proteinTargetG: ctx.proteinTargetG,
          });
          if (checks.length > 0 && !ticked) return { ok: false };
        }
      }
      return { ok: true, amount: parsed.amount, at: at.at };
    },
  };
}

function AmountStep({
  ctx,
  step,
  food,
  basis,
  servingSizeG,
}: {
  readonly ctx: LogContext;
  readonly step: ReturnType<typeof useAmountStep>;
  /** For the preview and checks; null while the label figures do not parse yet. */
  readonly food: Parameters<typeof labelEntry>[0] | null;
  readonly basis: IngredientRecord['nutrientBasis'] | null;
  readonly servingSizeG: number | null;
}): ReactElement {
  const parsed = basis === null ? null : parseAmount(step.amount, basis);
  const draft =
    food === null || parsed === null || !parsed.ok ? null : labelEntry(food, parsed.amount);
  const checks =
    draft === null || !draft.ok || parsed === null || !parsed.ok
      ? []
      : amountChecks({
          amount: parsed.amount,
          draft: draft.draft,
          proteinTargetG: ctx.proteinTargetG,
        });
  return (
    <>
      <h3>{copy.amount.label}</h3>
      <AmountFields
        value={step.amount}
        onChange={step.setAmount}
        basis={basis}
        servingSizeG={servingSizeG}
        problems={step.showErrors ? step.problems : {}}
        disabled={false}
      />
      {draft === null || !draft.ok ? null : (
        <EntryPreview entry={draft.draft} approved={ctx.approved} />
      )}
      <AmountChecks
        checks={checks}
        ticked={step.ticked}
        onTick={step.setTicked}
        showError={step.showErrors}
      />
      <TimeField ctx={ctx} value={step.time} onChange={step.setTime} error={step.timeError} />
    </>
  );
}

/** The id of the preview's label food, which is never stored. */
const PREVIEW_ID = '00000000-0000-4000-8000-000000000000';

/** The label form's figures as a food the amount step can preview, when they parse. */
function previewFood(form: LabelFormInput, ctx: LogContext) {
  const parsed = parseLabelForm(
    {
      ...form,
      confirmed: [
        'energy-mismatch',
        'sat-fat-over-fat',
        'sugars-over-carbs',
        'sounds-like-alcohol',
        'same-name',
      ],
    },
    {
      alcoholLoggingAvailable: ctx.alcoholLoggingAvailable ?? false,
      otherLabelFoods: [],
      editingId: null,
    },
  );
  // Not stored: the label food as the repository would build it, for the amount step's preview.
  return parsed.ok ? labelIngredient(parsed.food, PREVIEW_ID, ctx.now) : null;
}

function ownLabelFoods(ctx: LogContext): IngredientRecord[] {
  return ctx.rows.recipeRows.own.filter((i) => i.source === 'label');
}

/**
 * The label foods that may be logged now: a drink-like name is left out while alcohol logging is
 * off or the gates are not read yet (HS-32, HS-40; the repository refuses it too).
 */
function loggableLabelFoods(ctx: LogContext): IngredientRecord[] {
  return ownLabelFoods(ctx).filter((f) =>
    labelFoodLoggable(f, ctx.alcoholLoggingAvailable === true),
  );
}

function NewLabelPanel({
  ctx,
  onLogged,
  onCancel,
  onUseEarlier,
}: {
  readonly ctx: LogContext;
  readonly onLogged: (entry: FoodLogRecord) => void;
  readonly onCancel: () => void;
  readonly onUseEarlier: (id: Id) => void;
}): ReactElement {
  const [form, setForm] = useState<LabelFormInput>(EMPTY_LABEL_FORM);
  const [errors, setErrors] = useState<LabelFieldErrors>({});
  const [checks, setChecks] = useState<readonly LabelFormCheck[]>([]);
  const [showChecks, setShowChecks] = useState(false);
  const step = useAmountStep(ctx);
  const write = useLogWrite('label');
  const panelRef = useRef<HTMLDivElement>(null);
  // Item 13's gates decide the drink-name rule, so the form waits for them.
  if (ctx.alcoholLoggingAvailable === null)
    return <p className="ui-text-muted">{privacy.backupCard.notReady}</p>;
  const food = previewFood(form, ctx);

  const submit = () => {
    const result = parseLabelForm(form, {
      alcoholLoggingAvailable: ctx.alcoholLoggingAvailable ?? false,
      otherLabelFoods: ownLabelFoods(ctx),
      editingId: null,
    });
    const fieldErrors: LabelFieldErrors = result.ok
      ? {}
      : Object.fromEntries(
          Object.entries(result.problems).map(([field, problem]) => [
            field,
            labelProblemText(problem),
          ]),
        );
    setErrors(labelErrors(fieldErrors));
    setChecks(result.ok ? [] : result.checks);
    setShowChecks(true);
    const amount = step.check(food, form.describes);
    if (!result.ok || !amount.ok) {
      requestAnimationFrame(() => {
        panelRef.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus();
      });
      return;
    }
    void write
      .run(() =>
        ctx.storage.repos.foodLog.logNewLabelFood({
          form,
          amount: amount.amount,
          ...atPart(amount.at),
        }),
      )
      .then((done) => {
        if (done !== null) onLogged(done.value.entry);
      });
  };
  return (
    <div ref={panelRef} className="ui-stack">
      <form
        noValidate
        className="ui-stack"
        onSubmit={(event) => {
          event.preventDefault();
          submit();
        }}
      >
        <h3>{copy.label.newTitle}</h3>
        <LabelFields
          value={form}
          onChange={(next) => {
            setForm(next);
            setChecks([]);
          }}
          errors={errors}
          changeForm={false}
          catalogue={ctx.catalogue}
          data={ctx.foodData}
          disabled={false}
        />
        <AmountStep
          ctx={ctx}
          step={step}
          food={food}
          basis={form.describes}
          servingSizeG={food?.servingSizeG ?? null}
        />
        <LabelChecks
          checks={checks}
          confirmed={form.confirmed}
          showErrors={showChecks}
          onConfirm={(kinds, on) => {
            setForm({
              ...form,
              confirmed: on
                ? [...new Set([...form.confirmed, ...kinds])]
                : form.confirmed.filter((k) => !kinds.includes(k)),
            });
          }}
          onUseEarlier={onUseEarlier}
        />
        <ButtonRow>
          <Button
            type="submit"
            variant="primary"
            disabled={!ctx.writable}
            aria-disabled={write.busy}
          >
            {copy.add.logIt}
          </Button>
          <Button variant="quiet" onClick={onCancel}>
            {copy.add.cancel}
          </Button>
        </ButtonRow>
        <WriteNotice write={write} />
      </form>
    </div>
  );
}

// ---- Your label foods ----

function LabelFoodsPanel({
  ctx,
  startWith,
  onLogged,
  onCancel,
}: {
  readonly ctx: LogContext;
  readonly startWith: Id | null;
  readonly onLogged: (entry: FoodLogRecord) => void;
  readonly onCancel: () => void;
}): ReactElement {
  const [chosen, setChosen] = useState<Id | null>(startWith);
  const [changing, setChanging] = useState(false);
  const [search, setSearch] = useState('');
  const own = loggableLabelFoods(ctx);
  const food = own.find((f) => f.id === chosen) ?? null;
  if (food === null) {
    const recent = recentLabelFoodIds(ctx.rows.recent, 5).flatMap((id) => {
      const f = own.find((o) => o.id === id);
      return f === undefined ? [] : [f];
    });
    const key = matchKey(search);
    // Every other label food by name: one button per food (the recent ones are listed above).
    const all = own
      .filter((f) => !recent.includes(f))
      .sort((a, b) => a.name.localeCompare(b.name, 'en-NZ'))
      .filter((f) => key.length < 2 || matchKey(f.name).includes(key));
    const row = (f: IngredientRecord) => (
      <Button
        key={f.id}
        variant="secondary"
        block
        onClick={() => {
          setChosen(f.id);
        }}
      >
        {f.name}
      </Button>
    );
    return (
      <>
        {own.length > 8 ? (
          <TextField
            label={copy.label.name}
            autoComplete="off"
            value={search}
            onChange={(e) => {
              setSearch(e.currentTarget.value);
            }}
          />
        ) : null}
        {recent.length === 0 ? null : (
          <>
            <p className="ui-text-muted">{copy.recipe.recent}</p>
            {recent.map(row)}
          </>
        )}
        {all.map(row)}
        <Button variant="quiet" onClick={onCancel}>
          {copy.add.cancel}
        </Button>
      </>
    );
  }
  return changing ? (
    <ChangeLabelFood
      ctx={ctx}
      food={food}
      onDone={() => {
        setChanging(false);
      }}
    />
  ) : (
    <LogLabelFood
      ctx={ctx}
      food={food}
      onChange={() => {
        setChanging(true);
      }}
      onLogged={onLogged}
      onCancel={onCancel}
    />
  );
}

function LogLabelFood({
  ctx,
  food,
  onChange,
  onLogged,
  onCancel,
}: {
  readonly ctx: LogContext;
  readonly food: IngredientRecord;
  readonly onChange: () => void;
  readonly onLogged: (entry: FoodLogRecord) => void;
  readonly onCancel: () => void;
}): ReactElement {
  const step = useAmountStep(ctx);
  const write = useLogWrite('label');
  return (
    <form
      noValidate
      className="ui-stack"
      onSubmit={(event) => {
        event.preventDefault();
        const amount = step.check(food, food.nutrientBasis);
        if (!amount.ok) return;
        void write
          .run(() =>
            ctx.storage.repos.foodLog.logLabel({
              foodId: food.id,
              amount: amount.amount,
              ...atPart(amount.at),
            }),
          )
          .then((done) => {
            if (done !== null) onLogged(done.value);
          });
      }}
    >
      <h3>{food.name}</h3>
      <p className="ui-text-muted">{copy.amount.states[food.nutrientBasis]}</p>
      <Button variant="quiet" onClick={onChange}>
        {copy.label.changeTitle}
      </Button>
      <AmountStep
        ctx={ctx}
        step={step}
        food={food}
        basis={food.nutrientBasis}
        servingSizeG={food.servingSizeG}
      />
      <ButtonRow>
        <Button type="submit" variant="primary" disabled={!ctx.writable} aria-disabled={write.busy}>
          {copy.add.logIt}
        </Button>
        <Button variant="quiet" onClick={onCancel}>
          {copy.add.cancel}
        </Button>
      </ButtonRow>
      <WriteNotice write={write} />
    </form>
  );
}

/** The change form (design 1.3.4): per 100 g in kJ; switching Per or the unit clears the figures. */
function ChangeLabelFood({
  ctx,
  food,
  onDone,
}: {
  readonly ctx: LogContext;
  readonly food: IngredientRecord;
  readonly onDone: () => void;
}): ReactElement {
  const [form, setForm] = useState<LabelFormInput>(() => labelFormFrom(food));
  const [errors, setErrors] = useState<LabelFieldErrors>({});
  const [checks, setChecks] = useState<readonly LabelFormCheck[]>([]);
  const [showChecks, setShowChecks] = useState(false);
  const write = useLogWrite('change');
  return (
    <form
      noValidate
      className="ui-stack"
      onSubmit={(event) => {
        event.preventDefault();
        const result = parseLabelForm(form, {
          alcoholLoggingAvailable: ctx.alcoholLoggingAvailable ?? false,
          otherLabelFoods: ownLabelFoods(ctx),
          editingId: food.id,
        });
        setShowChecks(true);
        if (!result.ok) {
          setErrors(
            Object.fromEntries(
              Object.entries(result.problems).map(([f, p]) => [f, labelProblemText(p)]),
            ),
          );
          setChecks(result.checks);
          return;
        }
        setErrors({});
        setChecks([]);
        void write
          .run(() => ctx.storage.repos.foodLog.saveLabelFood({ id: food.id, form }))
          .then((done) => {
            if (done !== null) onDone();
          });
      }}
    >
      <h3>{copy.label.changeTitle}</h3>
      <LabelFields
        value={form}
        onChange={(next) => {
          setForm(next);
          setChecks([]);
        }}
        errors={errors}
        changeForm
        catalogue={null}
        data={null}
        disabled={false}
      />
      <LabelChecks
        checks={checks}
        confirmed={form.confirmed}
        showErrors={showChecks}
        onConfirm={(kinds, on) => {
          setForm({
            ...form,
            confirmed: on
              ? [...new Set([...form.confirmed, ...kinds])]
              : form.confirmed.filter((k) => !kinds.includes(k)),
          });
        }}
        onUseEarlier={() => undefined}
      />
      <p className="ui-text-muted">{copy.label.changeNote}</p>
      <ButtonRow>
        <Button type="submit" variant="primary" disabled={!ctx.writable} aria-disabled={write.busy}>
          {copy.entries.change}
        </Button>
        <Button variant="quiet" onClick={onDone}>
          {copy.add.cancel}
        </Button>
      </ButtonRow>
      <WriteNotice write={write} />
    </form>
  );
}

// ---- The card ----

type Row = 'plan' | 'recipe' | 'label' | 'again';

export function AddFoodCardBody({
  ctx,
  foodsMessage,
  onLogged,
}: {
  readonly ctx: LogContext;
  /** What the plan and recipe panels hold while the food data loads or failed; null when ready. */
  readonly foodsMessage: ReactElement | null;
  readonly onLogged: (entry: FoodLogRecord) => void;
}): ReactElement {
  const [open, setOpen] = useState<Row | null>(null);
  const [againWith, setAgainWith] = useState<Id | null>(null);
  const toggles = useRef<Partial<Record<Row, HTMLButtonElement | null>>>({});
  const meals = planMealsToLog(ctx.rows.planDay, ctx.rows.entries, ctx.date, ctx.home);
  const notLogged = meals.filter((m) => m.logged === null).length;
  const hasLabelFoods = loggableLabelFoods(ctx).length > 0;
  const close = (row: Row) => () => {
    setOpen(null);
    requestAnimationFrame(() => toggles.current[row]?.focus());
  };
  const logged = (entry: FoodLogRecord) => {
    setOpen(null);
    setAgainWith(null);
    onLogged(entry);
  };
  const item = (row: Row, title: string, detail: string, panel: () => ReactElement) => (
    <ExpandableRow
      key={row}
      title={title}
      detail={detail}
      expanded={open === row}
      toggleRef={(el) => {
        toggles.current[row] = el;
      }}
      onToggle={() => {
        setOpen(open === row ? null : row);
      }}
    >
      {open === row ? panel() : null}
    </ExpandableRow>
  );
  return (
    <ul className="ui-divider-rows">
      {meals.length === 0
        ? null
        : item(
            'plan',
            copy.add.fromPlan,
            notLogged === 0
              ? copy.add.fromPlanDetailNone
              : notLogged === 1
                ? copy.add.fromPlanDetailOne
                : fillTemplate(copy.add.fromPlanDetailMany, { count: notLogged }),
            () =>
              foodsMessage ?? <PlanPanel ctx={ctx} onLogged={logged} onCancel={close('plan')} />,
          )}
      {item(
        'recipe',
        copy.add.fromRecipe,
        copy.add.fromRecipeDetail,
        () =>
          foodsMessage ?? <LogRecipePanel ctx={ctx} onLogged={logged} onCancel={close('recipe')} />,
      )}
      {item('label', copy.add.fromLabel, copy.add.fromLabelDetail, () => (
        <NewLabelPanel
          ctx={ctx}
          onLogged={logged}
          onCancel={close('label')}
          onUseEarlier={(id) => {
            setAgainWith(id);
            setOpen('again');
          }}
        />
      ))}
      {hasLabelFoods
        ? item('again', copy.add.again, copy.add.againDetail, () => (
            <LabelFoodsPanel
              ctx={ctx}
              startWith={againWith}
              onLogged={logged}
              onCancel={close('again')}
            />
          ))
        : null}
    </ul>
  );
}
