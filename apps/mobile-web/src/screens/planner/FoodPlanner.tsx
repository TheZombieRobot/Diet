/**
 * The planner on the Food tab (item 22 design 2.2 to 2.8; UX 3a): the diet-mode banner, the
 * planner side of the reminders, the Meal plan card with its Fill and Copy previews, and the
 * Budget card. Everything is worked out by core's planner functions over one live read; nothing is
 * written until the owner presses a button that says so, and the repository checks it again.
 */
import {
  addDays,
  allergenListText,
  blockedAllergens,
  budgetFacts,
  expandUserAllergens,
  fillTemplate,
  type LocalDate,
  MEAL_SLOTS,
  mealSharing,
  parseBudgetNote,
  plannerEnergyAim,
  planWeekDates,
  planWeekNav,
  servingFor,
  sourcesInUse,
  weekStartOf,
} from '@diet/core';
import {
  planner,
  profile as profileCopy,
  recipes,
  targets as targetsCopy,
} from '@diet/core/copy/health';
import {
  ActionRow,
  Button,
  ButtonRow,
  Card,
  ChevronIcon,
  Chip,
  LinkList,
  LinkRow,
  Notice,
  TextField,
} from '@diet/ui';
import { type ReactElement, type ReactNode, useEffect, useId, useRef, useState } from 'react';
import type { AppStorage } from '../../db/runtime';
import { formatDayLongMonth, formatPlanDate } from '../../format';
import { GateNotice } from '../../onboarding/GateNotice';
import { planDayHref, routeHref } from '../../routes';
import { useStore } from '../../store';
import { DietModeCard } from '../targets/DietModeCard';
import { RemindersCard } from '../today/RemindersCard';
import { writeProposal } from './actions';
import { ClosedNotice, PlannerStateCard, ReasonFollowUp } from './parts';
import {
  copyProposal,
  fillProposal,
  type PlanModel,
  planDayView,
  plannerReminders,
  rowOf,
} from './planModel';
import { portionWords, reasonText, skipText, slotLabel, writeFailure } from './reasonText';
import { planWeekStore } from './stores';
import { usePlanner } from './usePlanner';

/** The two previews of the Meal plan card. */
type Preview = 'fillWeek' | 'copyWeek';

/** The week shown: the stored week, or the current one (V52); never after next week. */
function useShownWeek(today: LocalDate): LocalDate {
  const stored = useStore(planWeekStore);
  const current = weekStartOf(today);
  return stored === null || stored > addDays(current, 7) ? current : stored;
}

export function FoodPlanner({ storage }: { readonly storage: AppStorage }): ReactElement {
  const state = usePlanner(storage, null);
  if (state.status !== 'ready') {
    return <PlannerStateCard label={planner.week.label} state={state.status} />;
  }
  const { model, writable } = state;
  const items = plannerReminders(model);
  return (
    <>
      <DietModeCard
        storage={storage}
        view={model.view}
        stored={model.records.profile.dietMode}
        disabled={!writable}
        collapsed
      />
      {items.length === 0 ? null : (
        <RemindersCard storage={storage} items={items} prominent={false} />
      )}
      <PlanWeekCard storage={storage} model={model} writable={writable} />
      <BudgetCard storage={storage} model={model} writable={writable} />
    </>
  );
}

function weekChips(model: PlanModel, date: LocalDate): ReactNode[] {
  const view = planDayView(model, date);
  const chips: ReactNode[] = [];
  const past = view.ctx.state === 'past';
  if (view.snackAdded && !past)
    chips.push(
      <Chip key="snack" tone="neutral">
        {planner.week.chips.snackAdded}
      </Chip>,
    );
  const servings = (view.row?.meals ?? []).map((m) => {
    const facts = model.lookup.viewOf(m.recipeId)?.allergens.facts;
    return facts === undefined
      ? { serving: 'ok' as const, conflicts: [] }
      : servingFor(blockedAllergens(model.records.profile, mealSharing(m.householdServes)), facts);
  });
  const conflicts = [...new Set(servings.flatMap((s) => s.conflicts))];
  if (conflicts.length > 0)
    chips.push(
      <Chip key="conflict" tone="amber">
        {fillTemplate(recipes.chips.allergenConflict, { allergens: allergenListText(conflicts) })}
      </Chip>,
    );
  if (servings.some((s) => s.serving === 'unknown'))
    chips.push(
      <Chip key="labels" tone="neutral">
        {recipes.chips.checkLabels}
      </Chip>,
    );
  const floor = view.display.floorNote;
  if (floor?.kind === 'below-floor')
    chips.push(
      <Chip key="floor" tone="amber">
        {planner.week.chips.underFloor}
      </Chip>,
    );
  if (floor?.kind === 'energy-not-known')
    chips.push(
      <Chip key="energy" tone="neutral">
        {planner.week.chips.energyNotKnown}
      </Chip>,
    );
  const outside = view.day.outside.length;
  if (!past && outside > 0)
    chips.push(
      <Chip key="outside" tone="amber">
        {outside === 1
          ? planner.week.chips.notCountedOne
          : fillTemplate(planner.week.chips.notCountedMany, { count: outside })}
      </Chip>,
    );
  return chips;
}

function mealSummary(model: PlanModel, date: LocalDate): string {
  const view = planDayView(model, date);
  const meals = view.row?.meals ?? [];
  if (meals.length === 0) return planner.week.nothingPlanned;
  return MEAL_SLOTS.flatMap((slot) => meals.filter((m) => m.slot === slot))
    .map((m) =>
      fillTemplate(planner.week.mealSummary, {
        slot: slotLabel(m.slot, view.ctx.window),
        title: model.lookup.viewOf(m.recipeId)?.title ?? planner.day.recipeMissing,
      }),
    )
    .join(' · ');
}

function PlanWeekCard({
  storage,
  model,
  writable,
}: {
  readonly storage: AppStorage;
  readonly model: PlanModel;
  readonly writable: boolean;
}): ReactElement {
  const today = model.clock.today;
  const weekStart = useShownWeek(today);
  const nav = planWeekNav(weekStart, today);
  const dates = planWeekDates(weekStart);
  const heading = useRef<HTMLHeadingElement>(null);
  const [panel, setPanel] = useState<Preview | null>(null);
  const [done, setDone] = useState<{ readonly text: string; readonly changed: string[] } | null>(
    null,
  );
  const reasonId = useId();
  const { view } = model;
  const profile = model.records.profile;
  const hasMeals = dates.some((d) => (rowOf(model, d)?.meals.length ?? 0) > 0);
  const past = dates[6] !== undefined && dates[6] < today;
  const aim = plannerEnergyAim(view.targets.energy);
  const noAim = aim.kind === 'none' ? aim.reason : null;
  const canFill = dates.some((d) => d >= today);
  const canCopy = hasMeals && weekStart <= nav.current;
  const move = (week: LocalDate | null) => {
    planWeekStore.set(week === nav.current ? null : week);
    setPanel(null);
    setDone(null);
  };
  const openPanel = (which: Preview) => {
    if (noAim !== null || !writable) return;
    setDone(null);
    setPanel(which);
  };
  return (
    <Card label={planner.week.label}>
      <h3 ref={heading} tabIndex={-1} className="ui-text-strong" data-testid="plan-week-heading">
        {fillTemplate(planner.week.heading, { date: formatDayLongMonth(weekStart) })}
      </h3>
      <ButtonRow>
        <Button
          variant="quiet"
          onClick={() => {
            move(nav.previous);
          }}
        >
          {planner.week.previous}
        </Button>
        {nav.isCurrent ? null : (
          <Button
            variant="quiet"
            onClick={() => {
              move(null);
            }}
          >
            {planner.week.thisWeek}
          </Button>
        )}
        {nav.next === null ? null : (
          <Button
            variant="quiet"
            onClick={() => {
              move(nav.next);
            }}
          >
            {planner.week.next}
          </Button>
        )}
      </ButtonRow>
      {!hasMeals && !past ? <p className="ui-text-muted">{planner.week.intro}</p> : null}
      {profile.householdSize > 1 ? (
        <p className="ui-text-muted">
          {fillTemplate(planner.household.banner, { count: profile.householdSize })}
        </p>
      ) : (
        <>
          <p className="ui-text-muted">{planner.household.solo}</p>
          <ActionRow
            href={routeHref('profile')}
            title={profileCopy.settingsRow.title}
            badge={<ChevronIcon />}
          />
        </>
      )}
      {view.display.plainFigures ? (
        <Notice tone="info" role="status">
          <p>{targetsCopy.today.plainNote}</p>
        </Notice>
      ) : null}
      {view.display.pregnancyNote ? (
        <Notice tone="info" role="status">
          <p>{targetsCopy.energy.pregnancyNote}</p>
        </Notice>
      ) : null}
      {view.gates.fastingGated ? (
        <GateNotice feature="fasting" link linkWhen="actionable" gates={view.gates} />
      ) : null}
      {writable ? null : <ClosedNotice />}
      <LinkList>
        {dates.map((date) => {
          const chips = weekChips(model, date);
          return (
            <LinkRow
              key={date}
              href={planDayHref(date)}
              current={date === today}
              overline={
                date === today ? planner.week.today : date < today ? planner.week.past : undefined
              }
              title={formatPlanDate(date)}
              detail={mealSummary(model, date)}
              chips={chips.length === 0 ? undefined : chips}
            />
          );
        })}
      </LinkList>
      {done === null ? null : (
        <Notice tone="info" role="status">
          <p>{done.text}</p>
          {done.changed.length === 0 ? null : (
            <ul className="ui-plan-list">
              {done.changed.map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
          )}
        </Notice>
      )}
      {panel === null ? (
        <>
          <ButtonRow>
            {past ? null : canFill ? (
              <Button
                variant="secondary"
                aria-disabled={noAim !== null || !writable ? 'true' : undefined}
                className={noAim !== null || !writable ? 'ui-button--off' : undefined}
                aria-describedby={noAim === null ? undefined : reasonId}
                onClick={() => {
                  openPanel('fillWeek');
                }}
              >
                {planner.week.fill}
              </Button>
            ) : null}
            {canCopy ? (
              <Button
                variant="secondary"
                aria-disabled={noAim !== null || !writable ? 'true' : undefined}
                className={noAim !== null || !writable ? 'ui-button--off' : undefined}
                aria-describedby={noAim === null ? undefined : reasonId}
                onClick={() => {
                  openPanel('copyWeek');
                }}
              >
                {planner.week.copy}
              </Button>
            ) : null}
          </ButtonRow>
          {past ? <p className="ui-text-muted">{planner.week.readOnly}</p> : null}
          {noAim === null || (!canFill && !canCopy) ? null : (
            <div id={reasonId}>
              {noAim === 'needs-guide' ? (
                <>
                  <p className="ui-text-muted">{targetsCopy.plannerFloor.noGuide}</p>
                  <ActionRow href={routeHref('targets')} title={targetsCopy.settingsRow.title} />
                </>
              ) : (
                <p className="ui-text-muted">{planner.week.noFillNoEstimate}</p>
              )}
            </div>
          )}
          {canFill || canCopy ? <NoFillLines model={model} /> : null}
        </>
      ) : (
        <PreviewPanel
          storage={storage}
          model={model}
          kind={panel}
          weekStart={weekStart}
          writable={writable}
          onClose={(result) => {
            setPanel(null);
            setDone(result);
            requestAnimationFrame(() => heading.current?.focus());
          }}
        />
      )}
    </Card>
  );
}

function NoFillLines({ model }: { readonly model: PlanModel }): ReactElement {
  const profile = model.records.profile;
  return (
    <>
      {sourcesInUse(model.data.foods).length === 0 ? (
        <p className="ui-text-muted">{planner.week.noFillFigures}</p>
      ) : null}
      {expandUserAllergens(profile.allergens).length > 0 ? (
        <p className="ui-text-muted">{planner.week.noFillLabels}</p>
      ) : profile.glutenFreeHousehold && profile.householdSize > 1 ? (
        <p className="ui-text-muted">{planner.week.noFillLabelsGluten}</p>
      ) : null}
    </>
  );
}

/** The Fill and Copy previews (design 2.6, 2.7): nothing is written until the owner says so. */
function PreviewPanel({
  storage,
  model,
  kind,
  weekStart,
  writable,
  onClose,
}: {
  readonly storage: AppStorage;
  readonly model: PlanModel;
  readonly kind: Preview;
  readonly weekStart: LocalDate;
  readonly writable: boolean;
  readonly onClose: (done: { readonly text: string; readonly changed: string[] } | null) => void;
}): ReactElement {
  const copy = kind === 'fillWeek' ? planner.fill : planner.copy;
  const title = useRef<HTMLHeadingElement>(null);
  const [saving, setSaving] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  useEffect(() => {
    title.current?.focus();
  }, []);
  const { display } = model.view;
  const days =
    kind === 'fillWeek' ? fillProposal(model, weekStart) : copyProposal(model, weekStart);
  const proposed = days.flatMap((d) => (d.status === 'proposed' ? [d] : []));
  const refused = days.flatMap((d) => (d.status === 'refused' ? [d] : []));
  const mealText = (
    date: LocalDate,
    meals: readonly {
      slot: (typeof MEAL_SLOTS)[number];
      recipeId: string;
      myServes: number;
      householdServes: number;
    }[],
  ) =>
    meals
      .map((m) =>
        fillTemplate(planner.fill.meal, {
          slot: slotLabel(m.slot, model.dayCtx(date).window),
          title: model.lookup.viewOf(m.recipeId)?.title ?? planner.day.recipeMissing,
          portion: portionWords(m.myServes, m.householdServes),
        }),
      )
      .join('; ');
  const reasonFor = (date: LocalDate, refusal: Parameters<typeof reasonText>[0]) => {
    const day = planDayView(model, date);
    return reasonText(
      refusal,
      {
        plainFigures: display.plainFigures,
        pregnancyNote: display.pregnancyNote,
        snackFits: day.snack !== null,
        hasWindow: day.ctx.window !== null,
        where: 'preview',
      },
      model.lookup,
    );
  };
  const use = () => {
    setSaving(true);
    setFailure(null);
    writeProposal(storage, kind, proposed).then(
      (outcome) => {
        const count = outcome.written.length;
        onClose({
          text: count === 1 ? copy.doneOne : fillTemplate(copy.doneMany, { count }),
          changed:
            outcome.refused.length === 0
              ? []
              : [
                  copy.changed,
                  ...outcome.refused.map((r) =>
                    fillTemplate(copy.dayRefused, {
                      day: formatPlanDate(r.date),
                      reason: reasonFor(r.date, r.refusal).text,
                    }),
                  ),
                ],
        });
      },
      (error: unknown) => {
        setSaving(false);
        setFailure(writeFailure(error));
      },
    );
  };
  return (
    <div data-testid={`plan-${kind}-panel`}>
      <h3 ref={title} tabIndex={-1} className="ui-text-strong">
        {copy.title}
      </h3>
      <p>{copy.intro}</p>
      {proposed.length === 0 ? null : (
        <>
          <h4>{copy.proposedHeading}</h4>
          <ul className="ui-plan-list">
            {proposed.map((d) => (
              <li key={d.date}>
                {fillTemplate(copy.dayProposed, {
                  day: formatPlanDate(d.date),
                  meals: mealText(d.date, d.meals),
                })}
                {'skipped' in d
                  ? d.skipped.map((skip) => (
                      <p key={`${skip.slot}-${skip.recipeId}`} className="ui-text-muted">
                        {skipText(skip, model.dayCtx(d.date).window, model.lookup)}
                      </p>
                    ))
                  : null}
              </li>
            ))}
          </ul>
        </>
      )}
      {refused.length === 0 ? null : (
        <>
          <h4>{copy.refusedHeading}</h4>
          <ul className="ui-plan-list">
            {refused.map((d) => {
              const reason = reasonFor(d.date, d.refusal);
              return (
                <li key={d.date}>
                  {fillTemplate(copy.dayRefused, {
                    day: formatPlanDate(d.date),
                    reason: reason.text,
                  })}
                  <ReasonFollowUp
                    reason={reason}
                    storage={storage}
                    date={d.date}
                    snack={planDayView(model, d.date).snack}
                    pharmacist={model.view.gates.pharmacistReminder}
                    writable={writable && !saving}
                  />
                </li>
              );
            })}
          </ul>
        </>
      )}
      {proposed.length === 0 ? <p>{copy.nothing}</p> : null}
      {saving ? (
        <p className="ui-progress" role="status">
          {copy.saving}
        </p>
      ) : null}
      {failure === null ? null : (
        <Notice tone="amber" role="alert">
          <p>{failure}</p>
        </Notice>
      )}
      <ButtonRow>
        <Button
          variant="primary"
          disabled={proposed.length === 0 || saving || !writable}
          onClick={use}
        >
          {copy.use}
        </Button>
        <Button
          variant="secondary"
          disabled={saving}
          onClick={() => {
            onClose(null);
          }}
        >
          {copy.cancel}
        </Button>
      </ButtonRow>
    </div>
  );
}

/** The Budget card (design 2.8; HS-16, NN-05): the owner's own note, and no prices. */
function BudgetCard({
  storage,
  model,
  writable,
}: {
  readonly storage: AppStorage;
  readonly model: PlanModel;
  readonly writable: boolean;
}): ReactElement {
  const stored = model.records.profile.budgetNote;
  const [text, setText] = useState(stored ?? '');
  const [error, setError] = useState<string | undefined>(undefined);
  const [saved, setSaved] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const weekStart = useShownWeek(model.clock.today);
  const facts = budgetFacts({
    meals: planWeekDates(weekStart).flatMap((d) => rowOf(model, d)?.meals ?? []),
    view: model.lookup.viewOf,
    ready: model.stock.ready,
  });
  const save = (value: string | null) => {
    setFailure(null);
    setSaved(false);
    storage.repos.profile.update({ budgetNote: value }).then(
      () => {
        setSaved(true);
        setText(value ?? '');
      },
      (e: unknown) => {
        setFailure(writeFailure(e));
      },
    );
  };
  return (
    <Card label={planner.budget.label}>
      {stored === null ? (
        <p className="ui-text-muted">{planner.budget.empty}</p>
      ) : (
        <p data-owner-text>{fillTemplate(planner.budget.yourNote, { note: stored })}</p>
      )}
      {facts.gardenMeals > 0 || facts.leftoverMeals > 0 ? (
        <p className="ui-text-muted">
          {fillTemplate(planner.week.heading, { date: formatDayLongMonth(weekStart) })}
        </p>
      ) : null}
      {facts.gardenMeals > 0 ? (
        <p>
          {facts.gardenMeals === 1
            ? planner.budget.gardenMealsOne
            : fillTemplate(planner.budget.gardenMealsMany, { count: facts.gardenMeals })}
        </p>
      ) : null}
      {facts.leftoverMeals > 0 ? (
        <p>
          {facts.leftoverMeals === 1
            ? planner.budget.leftoverMealsOne
            : fillTemplate(planner.budget.leftoverMealsMany, { count: facts.leftoverMeals })}
        </p>
      ) : null}
      <p className="ui-text-muted">{planner.budget.noPrices}</p>
      <TextField
        label={planner.budget.noteLabel}
        hint={planner.budget.noteHint}
        maxLength={200}
        autoComplete="off"
        // The owner's own words (HS-16): the rendered-text sweep leaves them out.
        data-owner-text
        value={text}
        error={error}
        disabled={!writable}
        onChange={(e) => {
          setText(e.target.value);
          setError(undefined);
          setSaved(false);
        }}
      />
      <ButtonRow>
        <Button
          variant="primary"
          disabled={!writable || text === (stored ?? '')}
          onClick={() => {
            const parsed = parseBudgetNote(text);
            if (!parsed.ok) {
              setError(planner.budget.tooLong);
              return;
            }
            save(parsed.value);
          }}
        >
          {planner.budget.save}
        </Button>
        {stored === null ? null : (
          <Button
            variant="quiet"
            disabled={!writable}
            onClick={() => {
              save(null);
            }}
          >
            {planner.budget.clear}
          </Button>
        )}
      </ButtonRow>
      {saved ? (
        <Notice tone="info" role="status">
          <p>{planner.budget.saved}</p>
        </Notice>
      ) : null}
      {failure === null ? null : (
        <Notice tone="amber" role="alert">
          <p>{failure}</p>
        </Notice>
      )}
    </Card>
  );
}
