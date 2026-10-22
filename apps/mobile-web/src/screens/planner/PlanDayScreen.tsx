/**
 * One planned day, #/plan/<date> and #/plan/today (item 22 design 2.9 to 2.13; UX 3a): the eating
 * window and its meal slots, the picker and the label check, the single-sitting meal check with the
 * 5 pm snack or the widen line (item 15's rules and actions), and the day's planned figures for the
 * owner's own portion. A past date and a date after the planning range open read-only. During a
 * Kickstart stop-sign pause no line names an eating-window time, and neither the snack nor a reflux
 * option that moves the window is offered (F20; item 15's suppression).
 */
import {
  allergenListText,
  blockedAllergens,
  cardHidden,
  cardTrigger,
  dayWindowChangeAllowed,
  fillTemplate,
  footerForViews,
  formatClockRange,
  type LocalDate,
  MEAL_SLOTS,
  type MealSlot,
  mealSharing,
  nutritionFooter,
  type PlannedMealRecord,
  servingFor,
  type SittingHeadline,
} from '@diet/core';
import { fasting, planner, recipes } from '@diet/core/copy/health';
import {
  ActionRow,
  BowlIcon,
  Button,
  ButtonRow,
  Card,
  Chip,
  MeterBar,
  MeterPair,
  Notice,
} from '@diet/ui';
import { type ReactElement, useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { AppStorage } from '../../db/runtime';
import { formatPlanDate } from '../../format';
import { GateNotice } from '../../onboarding/GateNotice';
import { fastingHref, planDayRouteOf, recipeHref, ROUTE_TITLES, routeHref } from '../../routes';
import { screenTitleStore } from '../../screenTitle';
import { useStore } from '../../store';
import { useHash } from '../../useRoute';
import { appStorageStore } from '../../db/runtime';
import { clearDayWindow, dismissSnack } from '../fasting/actions';
import { useTargetsClock } from '../targets/useDayTargets';
import { writeOwnerMeal } from './actions';
import { plannedFoodView } from './figuresView';
import { MealPicker } from './MealPicker';
import { AddSnackButton, ClosedNotice, PlannerStateCard, StatusNotice } from './parts';
import { gardenFoods, type PlanDayView, type PlanModel, planDayView } from './planModel';
import { portionWords, removeFailedText, slotLabel, writeFailure } from './reasonText';
import { usePlanner } from './usePlanner';

function useScreenTitle(title: string | null, hash: string): void {
  useLayoutEffect(() => {
    if (title === null) return undefined;
    screenTitleStore.set({ hash, title });
    return () => {
      if (screenTitleStore.get()?.hash === hash) screenTitleStore.set(null);
    };
  }, [title, hash]);
}

export function PlanDayScreen(): ReactElement {
  const storage = useStore(appStorageStore);
  return storage === null ? (
    <PlannerStateCard label={planner.routeTitle} state="not-ready" />
  ) : (
    <PlanDayRoute storage={storage} />
  );
}

function PlanDayRoute({ storage }: { readonly storage: AppStorage }): ReactElement {
  const hash = useHash();
  const { today } = useTargetsClock(storage);
  const route = planDayRouteOf(hash, today);
  useScreenTitle(route === null ? null : formatPlanDate(route.date), hash);
  if (route === null) {
    return (
      <Card label={planner.routeTitle}>
        <p>{planner.day.notFound}</p>
        <ActionRow href={routeHref('food')} title={planner.week.label} />
      </Card>
    );
  }
  return <PlanDay key={route.date} storage={storage} date={route.date} />;
}

function PlanDay({
  storage,
  date,
}: {
  readonly storage: AppStorage;
  readonly date: LocalDate;
}): ReactElement {
  const state = usePlanner(storage, date);
  if (state.status !== 'ready') {
    return <PlannerStateCard label={formatPlanDate(date)} state={state.status} />;
  }
  const { model, writable } = state;
  const view = planDayView(model, date);
  return (
    <>
      {writable ? null : <ClosedNotice />}
      <WindowCard storage={storage} model={model} view={view} writable={writable} />
      <MealsCard storage={storage} model={model} view={view} writable={writable} />
      <PlannedFoodCard model={model} view={view} />
      <Card label={planner.week.label}>
        <ActionRow
          href={routeHref('food')}
          title={planner.week.label}
          detail={planner.day.weekLinkDetail}
        />
      </Card>
    </>
  );
}

function headlineText(h: SittingHeadline): string {
  const s = planner.day.sitting;
  const [plain, atLeast, unknown] = h.dinnerOnly
    ? [s.dinner, s.dinnerAtLeast, s.dinnerUnknown]
    : [s.meal, s.mealAtLeast, s.mealUnknown];
  if (h.unknown) return unknown;
  return fillTemplate(h.atLeast ? atLeast : plain, { protein: h.proteinG });
}

/** Card 1: the eating window, the single-sitting check and the 5 pm snack (2.9, 2.13). */
function WindowCard({
  storage,
  model,
  view,
  writable,
}: {
  readonly storage: AppStorage;
  readonly model: PlanModel;
  readonly view: PlanDayView;
  readonly writable: boolean;
}): ReactElement | null {
  const { ctx } = view;
  const { gates } = model.view;
  const pause = model.ps.stopSignPause;
  const window = ctx.window;
  const editable = ctx.state === 'editable';
  const [failure, setFailure] = useState<string | null>(null);
  const range = window === null ? '' : formatClockRange(window.start, window.end);
  // A past date shows only a per-day window stored on its row (V3): with none there is no card,
  // rather than an empty one.
  if (window === null && ctx.state === 'past') return null;
  if (window === null) {
    return (
      <Card label={planner.day.windowLabel}>
        {gates.fastingGated ? (
          <>
            <p>{planner.day.fastingOff}</p>
            <GateNotice feature="fasting" link linkWhen="actionable" gates={gates} />
          </>
        ) : (
          <>
            <p>{planner.day.noFastingPlan}</p>
            <ActionRow
              href={routeHref('eating-schedule')}
              title={ROUTE_TITLES['eating-schedule']}
            />
          </>
        )}
      </Card>
    );
  }
  const snackSlotTaken = (view.row?.meals ?? []).some((m) => m.slot === 'snack');
  const sitting = view.sitting;
  const dismissed = cardHidden({
    now: model.clock.at,
    row: model.inputs.cards.snack.get(ctx.date),
    dismissal: cardTrigger('single-meal-snack', `date:${ctx.date}`)?.dismissal ?? { kind: 'final' },
    drinkingDayCutoverMinutes: 0,
  });
  const snack = view.snack;
  const offerShown = sitting?.kind === 'short-before' && !dismissed && snack !== null;
  const run = (work: () => Promise<{ ok: boolean; failure?: { message: string } }>) => {
    setFailure(null);
    void work().then((r) => {
      if (!r.ok) setFailure(r.failure?.message ?? removeFailedText);
    });
  };
  return (
    <Card label={planner.day.windowLabel}>
      {pause ? (
        <p>{fasting.card.stopSignPause}</p>
      ) : (
        <p>{fillTemplate(planner.day.window, { range })}</p>
      )}
      {gates.pharmacistReminder ? <p className="ui-text-muted">{fasting.pharmacist}</p> : null}
      {editable && ctx.slots.pattern === 'one-meal' && !pause ? (
        <p>{fillTemplate(planner.day.oneMeal, { protein: ctx.targets.protein.checkTargetG })}</p>
      ) : null}
      {sitting === null || sitting.kind === 'unavailable' ? null : sitting.kind === 'ok' ? (
        sitting.sitting === null ? null : (
          <p data-testid="plan-sitting">{headlineText(sitting.sitting)}</p>
        )
      ) : sitting.kind === 'short-before' && !dismissed ? (
        <Notice
          tone="amber"
          icon={<BowlIcon />}
          actions={
            snack === null ? (
              <ActionRow
                href={routeHref('eating-schedule')}
                title={ROUTE_TITLES['eating-schedule']}
              />
            ) : (
              <ButtonRow>
                <AddSnackButton
                  storage={storage}
                  date={ctx.date}
                  snack={snack}
                  writable={writable}
                  variant="on-amber"
                />
                <Button
                  variant="on-amber-outline"
                  disabled={!writable}
                  onClick={() => {
                    run(() => dismissSnack(storage, ctx.date));
                  }}
                >
                  {fasting.mealCheck.notNow}
                </Button>
              </ButtonRow>
            )
          }
        >
          {sitting.sitting === null ? null : (
            <p className="ui-text-strong" data-testid="plan-sitting">
              {headlineText(sitting.sitting)}
            </p>
          )}
          {sitting.reasons.map((reason) => (
            <p key={reason}>
              {reason === 'protein'
                ? fillTemplate(fasting.mealCheck.proteinShort, {
                    target: ctx.targets.protein.checkTargetG,
                  })
                : reason === 'energy'
                  ? fasting.mealCheck.energyShort
                  : reason === 'energy-not-known'
                    ? fasting.mealCheck.energyNotKnown
                    : reason === 'energy-unknown'
                      ? fasting.mealCheck.energyUnavailable
                      : fasting.mealCheck.portionLarge}
            </p>
          ))}
          {snack !== null ? (
            <p>{fasting.mealCheck.offerSnack}</p>
          ) : (
            <>
              <p>{fasting.mealCheck.widen}</p>
              <p>{fasting.mealCheck.widenDetail}</p>
            </>
          )}
        </Notice>
      ) : sitting.kind === 'short-before' ? (
        <>
          <p className="ui-text-muted">{fasting.mealCheck.widen}</p>
          {snack !== null ? (
            <AddSnackButton storage={storage} date={ctx.date} snack={snack} writable={writable} />
          ) : null}
        </>
      ) : null}
      {editable && ctx.slots.pattern === 'one-meal' && snack !== null && !offerShown ? (
        <AddSnackButton
          storage={storage}
          date={ctx.date}
          snack={snack}
          writable={writable}
          label={planner.day.addSnack}
        />
      ) : null}
      {view.snackAdded ? (
        <>
          <p>
            {pause
              ? planner.day.snackAddedNoRange
              : fillTemplate(planner.day.snackAdded, { range })}
          </p>
          {!editable ? null : snackSlotTaken ? (
            <p className="ui-text-muted">{planner.day.removeSnackFirst}</p>
          ) : dayWindowChangeAllowed(
              model.ps.schedule,
              [{ date: ctx.date, window: null }],
              model.clock.deviceZone,
            ) ? (
            <Button
              variant="quiet"
              disabled={!writable}
              onClick={() => {
                run(() => clearDayWindow(storage, ctx.date));
              }}
            >
              {planner.day.removeSnack}
            </Button>
          ) : null}
        </>
      ) : null}
      {ctx.refluxDay && editable && !pause ? (
        <>
          <p className="ui-text-muted">{planner.day.refluxNote}</p>
          <ActionRow href={fastingHref('reflux')} title={fasting.pattern.refluxLink} />
        </>
      ) : null}
      {failure === null ? null : (
        <Notice tone="amber" role="alert">
          <p>{failure}</p>
        </Notice>
      )}
    </Card>
  );
}

type SlotAction =
  | { readonly kind: 'pick'; readonly slot: MealSlot }
  | { readonly kind: 'remove'; readonly slot: MealSlot };

/** Card 2: the day's meals, slot by slot, and those not counted (2.9). */
function MealsCard({
  storage,
  model,
  view,
  writable,
}: {
  readonly storage: AppStorage;
  readonly model: PlanModel;
  readonly view: PlanDayView;
  readonly writable: boolean;
}): ReactElement {
  const { ctx } = view;
  const [action, setAction] = useState<SlotAction | null>(null);
  const [status, setStatus] = useState<{ readonly slot: MealSlot; readonly text: string } | null>(
    null,
  );
  const meals = view.row?.meals ?? [];
  const editable = ctx.state === 'editable';
  const slots: readonly MealSlot[] =
    ctx.state === 'past'
      ? MEAL_SLOTS.filter((s) => meals.some((m) => m.slot === s))
      : MEAL_SLOTS.filter((s) => ctx.slots.slots.includes(s) || ctx.slots.optional.includes(s));
  const outside = editable ? view.day.outside : [];
  return (
    <Card label={planner.day.mealsLabel}>
      {ctx.state === 'past' ? <p className="ui-text-muted">{planner.day.past}</p> : null}
      {ctx.state === 'too-far' ? <p className="ui-text-muted">{planner.day.tooFar}</p> : null}
      {slots.map((slot) => (
        <SlotBlock
          key={slot}
          storage={storage}
          model={model}
          view={view}
          slot={slot}
          meal={meals.find((m) => m.slot === slot) ?? null}
          optional={ctx.slots.optional.includes(slot)}
          editable={editable}
          writable={writable}
          action={action?.slot === slot ? action : null}
          status={status?.slot === slot ? status.text : null}
          onAction={(next) => {
            setStatus(null);
            setAction(next);
          }}
          onDone={(text) => {
            setAction(null);
            setStatus({ slot, text });
          }}
        />
      ))}
      {outside.length === 0 ? null : (
        <>
          <h3 className="ui-text-strong">{planner.day.outsideLabel}</h3>
          <p className="ui-text-muted">{planner.day.outsideNote}</p>
          {outside.map((meal) => (
            <SlotBlock
              key={`outside-${meal.slot}`}
              storage={storage}
              model={model}
              view={view}
              slot={meal.slot}
              meal={meal}
              optional={false}
              editable={editable}
              writable={writable}
              outside
              action={action?.slot === meal.slot ? action : null}
              status={status?.slot === meal.slot ? status.text : null}
              onAction={(next) => {
                setStatus(null);
                setAction(next);
              }}
              onDone={(text) => {
                setAction(null);
                setStatus({ slot: meal.slot, text });
              }}
            />
          ))}
        </>
      )}
    </Card>
  );
}

/** The Remove question, which takes focus when it opens (2.9). */
function RemoveQuestion({ text }: { readonly text: string }): ReactElement {
  const line = useRef<HTMLParagraphElement>(null);
  useEffect(() => {
    line.current?.focus();
  }, []);
  return (
    <p ref={line} tabIndex={-1} className="ui-focus-target">
      {text}
    </p>
  );
}

function SlotBlock({
  storage,
  model,
  view,
  slot,
  meal,
  optional,
  editable,
  writable,
  outside = false,
  action,
  status,
  onAction,
  onDone,
}: {
  readonly storage: AppStorage;
  readonly model: PlanModel;
  readonly view: PlanDayView;
  readonly slot: MealSlot;
  readonly meal: PlannedMealRecord | null;
  readonly optional: boolean;
  readonly editable: boolean;
  readonly writable: boolean;
  readonly outside?: boolean;
  readonly action: SlotAction | null;
  readonly status: string | null;
  readonly onAction: (next: SlotAction | null) => void;
  readonly onDone: (status: string) => void;
}): ReactElement {
  const { ctx } = view;
  const date = ctx.date;
  const recipe = meal === null ? null : model.lookup.viewOf(meal.recipeId);
  const title = recipe?.title ?? planner.day.recipeMissing;
  const [removing, setRemoving] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const block = useRef<HTMLDivElement>(null);
  // Keep it or Cancel: focus goes back to the block's first button (Change or Choose).
  const close = () => {
    onAction(null);
    requestAnimationFrame(() => block.current?.querySelector<HTMLElement>('button')?.focus());
  };
  const remove = () => {
    setRemoving(true);
    setFailure(null);
    writeOwnerMeal(storage, { date, slot, meal: null }).then(
      (outcome) => {
        setRemoving(false);
        if (outcome.refused.length > 0) {
          setFailure(removeFailedText);
          return;
        }
        onDone(fillTemplate(planner.day.removed, { title }));
      },
      (error: unknown) => {
        setRemoving(false);
        setFailure(writeFailure(error));
      },
    );
  };
  const serving =
    meal === null || recipe === null
      ? null
      : servingFor(
          blockedAllergens(model.records.profile, mealSharing(meal.householdServes)),
          recipe.allergens.facts,
        );
  const garden = recipe === null ? null : gardenFoods(model, recipe);
  return (
    <div
      ref={block}
      className="ui-plan-slot"
      data-testid={`slot-${slot}${outside ? '-outside' : ''}`}
    >
      <h3 className="ui-text-strong">{slotLabel(slot, ctx.window)}</h3>
      {meal === null ? null : (
        <>
          {recipe === null ? (
            <p>{planner.day.recipeMissing}</p>
          ) : (
            <a
              className="ui-plan-meal__title"
              href={recipeHref(meal.recipeId, { myServes: meal.myServes, plan: { date, slot } })}
            >
              {title}
            </a>
          )}
          <p className="ui-text-muted">{portionWords(meal.myServes, meal.householdServes)}</p>
          {garden === null ? null : (
            <p className="ui-text-muted">
              {fillTemplate(planner.day.usesGarden, { foods: garden })}
            </p>
          )}
          {recipe === null || recipe.usesLeftoversFrom === null ? null : (
            <p className="ui-text-muted">
              {fillTemplate(planner.day.usesLeftovers, { title: recipe.usesLeftoversFrom.title })}
            </p>
          )}
          <span className="ui-chip-row">
            {recipe?.heart.kind === 'heart-smart' ? <Chip>{recipes.chips.heartSmart}</Chip> : null}
            {recipe?.heart.kind === 'flagged' ? (
              <Chip tone="amber">{recipes.chips.flagged}</Chip>
            ) : null}
            {serving?.serving === 'conflict' ? (
              <Chip tone="amber">
                {fillTemplate(recipes.chips.allergenConflict, {
                  allergens: allergenListText(serving.conflicts),
                })}
              </Chip>
            ) : null}
            {serving?.serving === 'unknown' ? (
              <Chip tone="neutral">{recipes.chips.checkLabels}</Chip>
            ) : null}
          </span>
        </>
      )}
      {meal === null && !optional ? (
        <p className="ui-text-muted">{planner.day.nothingPlanned}</p>
      ) : null}
      {!editable ? null : action?.kind === 'pick' ? (
        <MealPicker
          storage={storage}
          model={model}
          date={date}
          slot={slot}
          current={meal}
          writable={writable}
          onCancel={close}
          onSaved={(result) => {
            onDone(
              result.status === 'added'
                ? fillTemplate(planner.day.added, { title: result.title })
                : planner.day.saved,
            );
          }}
        />
      ) : action?.kind === 'remove' && meal !== null ? (
        <>
          <RemoveQuestion
            text={fillTemplate(planner.day.removeConfirm, { title, day: formatPlanDate(date) })}
          />
          {removing ? (
            <p className="ui-progress" role="status">
              {planner.day.removing}
            </p>
          ) : null}
          <ButtonRow>
            <Button variant="caution" disabled={removing || !writable} onClick={remove}>
              {planner.day.removeYes}
            </Button>
            <Button variant="secondary" disabled={removing} onClick={close}>
              {planner.day.removeNo}
            </Button>
          </ButtonRow>
        </>
      ) : meal !== null ? (
        <ButtonRow>
          {outside ? null : (
            <Button
              variant="secondary"
              disabled={!writable}
              onClick={() => {
                onAction({ kind: 'pick', slot });
              }}
            >
              {planner.day.change}
            </Button>
          )}
          <Button
            variant="quiet"
            disabled={!writable}
            onClick={() => {
              onAction({ kind: 'remove', slot });
            }}
          >
            {planner.day.remove}
          </Button>
        </ButtonRow>
      ) : (
        <Button
          variant={optional ? 'quiet' : 'tint'}
          disabled={!writable}
          onClick={() => {
            onAction({ kind: 'pick', slot });
          }}
        >
          {optional ? planner.day.addSnackMeal : planner.day.choose}
        </Button>
      )}
      {status === null ? null : <StatusNotice text={status} />}
      {failure === null ? null : (
        <Notice tone="amber" role="alert">
          <p>{failure}</p>
        </Notice>
      )}
    </div>
  );
}

/** Card 3: the day's figures for the owner's own portions (2.12; NU-05, HS-23, HS-R18). */
function PlannedFoodCard({
  model,
  view,
}: {
  readonly model: PlanModel;
  readonly view: PlanDayView;
}): ReactElement {
  const { display } = model.view;
  const counted = view.day.counted;
  if (counted.length === 0) {
    return (
      <Card label={planner.figures.label}>
        <p className="ui-text-muted">{planner.figures.intro}</p>
        <p>{view.ctx.state === 'past' ? planner.figures.nonePast : planner.figures.none}</p>
      </Card>
    );
  }
  const rows = plannedFoodView(view.display, {
    plainFigures: display.plainFigures,
    pregnancyNote: display.pregnancyNote,
    foods: model.data.foods,
  });
  const lineViews = counted.flatMap((m) =>
    (model.lookup.viewOf(m.recipeId)?.lines ?? []).flatMap((line) => {
      const resolved = model.lookup.resolve(line.ingredientId);
      return resolved === null ? [] : [resolved];
    }),
  );
  return (
    <Card label={planner.figures.label}>
      <p className="ui-text-muted">{planner.figures.intro}</p>
      <MeterBar {...rows.energy} />
      <MeterBar {...rows.protein} />
      <MeterPair>
        <MeterBar {...rows.netCarbs} />
        <MeterBar {...rows.satFat} />
      </MeterPair>
      {rows.notes.map((note) => (
        <p key={note} className="ui-text-muted">
          {note}
        </p>
      ))}
      <p className="ui-text-small">
        {nutritionFooter(footerForViews(lineViews, model.data.approved), model.data.attributions)}
      </p>
    </Card>
  );
}
