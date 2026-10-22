/**
 * The meal picker and the label check (item 22 design 2.10, 2.11; NU-07, P41, HS-R20, HS-23, C107,
 * FL-07). Suggestions are core's suggestionsFor for the date, the slot and the "Cooking for"
 * stepper's sharing: safe recipes ranked garden first, and apart from them the recipes whose
 * allergens are not fully known. Nothing is pre-selected unless it is the planned recipe and plainly
 * 'ok'. Picking a "check labels" recipe shows the label check first; only its confirm button
 * writes, for this one meal. Every write is an owner write of one meal, checked again by the
 * repository against the records as they are then.
 */
import {
  allergenListText,
  blockedAllergens,
  fillTemplate,
  gardenFirstNote,
  labelCheckView,
  type LocalDate,
  type MealSlot,
  mealSharing,
  type PlannedMealRecord,
  type PlanWriteRefusal,
  type RecipeView,
  servingFor,
} from '@diet/core';
import { planner, profile as profileCopy, recipes } from '@diet/core/copy/health';
import { ActionRow, Button, ButtonRow, ChoiceList, Notice, Stepper } from '@diet/ui';
import { type ReactElement, useEffect, useRef, useState } from 'react';
import type { AppStorage } from '../../db/runtime';
import { formatPlanDate } from '../../format';
import { routeHref } from '../../routes';
import { writeOwnerMeal } from './actions';
import { ReasonFollowUp } from './parts';
import {
  gardenFoods,
  type PlanModel,
  planDayView,
  startingServes,
  suggestionsAt,
} from './planModel';
import { portionWords, reasonText, slotLabelLower, writeFailure } from './reasonText';

const SHOWN = 10;
const PORTION = { min: 0.5, max: 4, step: 0.5 } as const;
const HOUSEHOLD = { min: 1, max: 20 } as const;

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

export interface PickerResult {
  readonly status: 'added' | 'saved';
  readonly title: string;
}

export function MealPicker({
  storage,
  model,
  date,
  slot,
  current,
  writable,
  onCancel,
  onSaved,
}: {
  readonly storage: AppStorage;
  readonly model: PlanModel;
  readonly date: LocalDate;
  readonly slot: MealSlot;
  readonly current: PlannedMealRecord | null;
  readonly writable: boolean;
  readonly onCancel: () => void;
  readonly onSaved: (result: PickerResult) => void;
}): ReactElement {
  const heading = useRef<HTMLHeadingElement>(null);
  const start = startingServes(model, slot, current);
  const [myServes, setMyServes] = useState(start.myServes);
  const [household, setHousehold] = useState(start.householdServes);
  const [picked, setPicked] = useState<string | null>(null);
  const [showAll, setShowAll] = useState(false);
  const [showAllLabels, setShowAllLabels] = useState(false);
  const [checking, setChecking] = useState(false);
  const [saving, setSaving] = useState(false);
  const [refusal, setRefusal] = useState<PlanWriteRefusal | null>(null);
  const [failure, setFailure] = useState<string | null>(null);
  const ctx = model.dayCtx(date);
  const suggestions = suggestionsAt(model, date, slot, household);
  const okIds = suggestions.ok.map((c) => c.view.id);
  const labelIds = suggestions.checkLabels.map((c) => c.view.id);
  // The planned recipe is pre-selected only when it is plainly 'ok' (P41 rule 1).
  const currentOk = current !== null && okIds.includes(current.recipeId);
  const choice = picked ?? (currentOk ? current.recipeId : null);
  const pickedView = choice === null ? null : model.lookup.viewOf(choice);
  // A pick that is no longer listed (a "Cooking for" change made it a conflict) is cleared; one
  // that moved to "check labels" is listed there unselected.
  const inOk = choice !== null && okIds.includes(choice);
  const inLabels = picked !== null && labelIds.includes(picked) && !inOk;
  const effective = inOk || inLabels ? choice : null;
  useEffect(() => {
    heading.current?.focus();
  }, [checking]);

  const blocked = blockedAllergens(model.records.profile, mealSharing(household));
  const servingNow =
    pickedView === null ? null : servingFor(blocked, pickedView.allergens.facts).serving;
  const changed =
    effective !== null &&
    (current === null ||
      effective !== current.recipeId ||
      myServes !== current.myServes ||
      household !== current.householdServes);
  const day = formatPlanDate(date);
  const slotWord = slotLabelLower(slot, ctx.window);

  const write = (labelChecked: boolean) => {
    if (effective === null || pickedView === null) return;
    setSaving(true);
    setRefusal(null);
    setFailure(null);
    writeOwnerMeal(
      storage,
      { date, slot, meal: { recipeId: effective, myServes, householdServes: household } },
      labelChecked
        ? {
            labelChecked: [
              { recipeId: effective, allergens: labelCheckView(pickedView, blocked).allergens },
            ],
          }
        : {},
    ).then(
      (outcome) => {
        setSaving(false);
        setChecking(false);
        const refused = outcome.refused[0];
        if (refused !== undefined) {
          setRefusal(refused.refusal);
          return;
        }
        onSaved({ status: current === null ? 'added' : 'saved', title: pickedView.title });
      },
      (error: unknown) => {
        setSaving(false);
        setFailure(writeFailure(error));
      },
    );
  };

  if (checking && pickedView !== null) {
    const check = labelCheckView(pickedView, blocked);
    return (
      <div data-testid="label-check">
        <h3 ref={heading} tabIndex={-1} className="ui-text-strong">
          {planner.labelCheck.title}
        </h3>
        <p>
          {fillTemplate(recipes.allergens.unknownForYou, {
            allergens: allergenListText(check.allergens),
          })}
        </p>
        <p>
          {fillTemplate(planner.labelCheck.listIntro, {
            allergens: allergenListText(check.allergens),
          })}
        </p>
        <ul className="ui-plan-list">
          {check.lineNames.map((name, i) => (
            <li key={`${name}-${i}`}>{name === '' ? recipes.ingredients.nameMissing : name}</li>
          ))}
        </ul>
        <p className="ui-text-muted">{planner.labelCheck.once}</p>
        {saving ? (
          <p className="ui-progress" role="status">
            {planner.picker.saving}
          </p>
        ) : null}
        <ButtonRow>
          <Button
            variant="primary"
            disabled={saving || !writable}
            onClick={() => {
              write(true);
            }}
          >
            {planner.labelCheck.confirm}
          </Button>
          <Button
            variant="secondary"
            disabled={saving}
            onClick={() => {
              setChecking(false);
            }}
          >
            {planner.labelCheck.cancel}
          </Button>
        </ButtonRow>
      </div>
    );
  }

  const option = (view: RecipeView, chip?: string) => {
    const garden = gardenFoods(model, view);
    return {
      value: view.id,
      label: view.title,
      detail:
        garden !== null
          ? fillTemplate(planner.day.usesGarden, { foods: garden })
          : view.timeMinutes === null
            ? fillTemplate(recipes.list.serves, { serves: view.serves })
            : fillTemplate(recipes.list.servesTime, {
                serves: view.serves,
                minutes: view.timeMinutes,
              }),
      chip: chip ?? (view.heart.kind === 'heart-smart' ? recipes.chips.heartSmart : undefined),
    };
  };
  const okViews = suggestions.ok.map((c) => c.view);
  const shownOk = showAll ? okViews : okViews.slice(0, SHOWN);
  const currentBeyond =
    !showAll && current !== null
      ? okViews.slice(SHOWN).find((v) => v.id === current.recipeId)
      : undefined;
  // The "check labels" group is shortened the same way (with an allergen listed, every recipe whose
  // allergens are not fully known is in it); a pick beyond the first ten stays listed.
  const labelViews = suggestions.checkLabels.map((c) => c.view);
  const shownLabels = showAllLabels ? labelViews : labelViews.slice(0, SHOWN);
  const pickedBeyond =
    !showAllLabels && picked !== null
      ? labelViews.slice(SHOWN).find((v) => v.id === picked)
      : undefined;
  const ns = suggestions.notShown;
  const notShown: [number, string, string][] = [
    [ns.allergen, planner.picker.notShown.allergenOne, planner.picker.notShown.allergenMany],
    [
      ns.householdGluten,
      planner.picker.notShown.householdGlutenOne,
      planner.picker.notShown.householdGlutenMany,
    ],
    [ns.dislike, planner.picker.notShown.dislikeOne, planner.picker.notShown.dislikeMany],
    [ns.hidden, planner.picker.notShown.hiddenOne, planner.picker.notShown.hiddenMany],
    [ns.oneMeal, planner.picker.notShown.oneMealOne, planner.picker.notShown.oneMealMany],
    [ns.ceiling, planner.picker.notShown.ceilingOne, planner.picker.notShown.ceilingMany],
  ];
  const garden = gardenFirstNote(suggestions);
  const currentTitle =
    current === null
      ? null
      : (model.lookup.viewOf(current.recipeId)?.title ?? planner.day.recipeMissing);
  const reason =
    refusal === null
      ? null
      : reasonText(
          refusal,
          {
            plainFigures: model.view.display.plainFigures,
            pregnancyNote: model.view.display.pregnancyNote,
            snackFits: false,
            stopSignPause: model.ps.stopSignPause,
            hasWindow: ctx.window !== null,
            where: 'owner',
          },
          model.lookup,
        );
  return (
    <div data-testid="meal-picker">
      <h3 ref={heading} tabIndex={-1} className="ui-text-strong">
        {fillTemplate(current === null ? planner.picker.titleChoose : planner.picker.titleChange, {
          slot: slotWord,
          day,
        })}
      </h3>
      {current !== null && !currentOk ? (
        <p className="ui-text-muted">
          {fillTemplate(planner.picker.current, { title: currentTitle ?? '' })}
        </p>
      ) : null}
      {garden === null ? null : (
        <p className="ui-text-muted">
          {garden === 'two' ? planner.picker.gardenFirst : planner.picker.gardenFirstOne}
        </p>
      )}
      {okViews.length === 0 ? null : (
        <ChoiceList
          legend={planner.picker.suggestions}
          name={`pick-${date}-${slot}`}
          options={[...shownOk, ...(currentBeyond === undefined ? [] : [currentBeyond])].map((v) =>
            option(v),
          )}
          value={inOk ? effective : null}
          disabled={saving}
          onChange={(value) => {
            setPicked(value);
            setRefusal(null);
          }}
        />
      )}
      {!showAll && okViews.length > SHOWN ? (
        <Button
          variant="quiet"
          onClick={() => {
            setShowAll(true);
          }}
        >
          {fillTemplate(planner.picker.showAll, { count: okViews.length })}
        </Button>
      ) : null}
      {suggestions.checkLabels.length === 0 ? null : (
        <ChoiceList
          legend={planner.picker.checkLabelsLegend}
          name={`pick-labels-${date}-${slot}`}
          hint={planner.picker.checkLabelsNote}
          options={[...shownLabels, ...(pickedBeyond === undefined ? [] : [pickedBeyond])].map(
            (v) => option(v, recipes.chips.checkLabels),
          )}
          value={inLabels ? effective : null}
          disabled={saving}
          onChange={(value) => {
            setPicked(value);
            setRefusal(null);
          }}
        />
      )}
      {!showAllLabels && labelViews.length > SHOWN ? (
        <Button
          variant="quiet"
          onClick={() => {
            setShowAllLabels(true);
          }}
        >
          {fillTemplate(planner.picker.showAll, { count: labelViews.length })}
        </Button>
      ) : null}
      {notShown.map(([count, one, many]) =>
        count === 0 ? null : (
          <p key={one} className="ui-text-muted">
            {count === 1 ? one : fillTemplate(many, { count })}
          </p>
        ),
      )}
      {okViews.length === 0 && suggestions.checkLabels.length === 0 ? (
        <>
          <p>{planner.picker.none}</p>
          <ActionRow href={routeHref('recipes')} title={planner.picker.recipesLink} />
        </>
      ) : null}
      <Stepper
        label={planner.picker.portionLabel}
        hint={planner.picker.portionHint}
        value={myServes}
        min={PORTION.min}
        max={PORTION.max}
        step={PORTION.step}
        formatValue={(v) => portionWords(v, 1)}
        decreaseLabel={planner.picker.portionFewer}
        increaseLabel={planner.picker.portionMore}
        onChange={(v) => {
          setMyServes(clamp(v, PORTION.min, PORTION.max));
        }}
      />
      <Stepper
        label={planner.picker.cookingForLabel}
        hint={profileCopy.householdHint}
        value={household}
        min={HOUSEHOLD.min}
        max={HOUSEHOLD.max}
        decreaseLabel={profileCopy.householdFewer}
        increaseLabel={profileCopy.householdMore}
        onChange={(v) => {
          setHousehold(clamp(v, HOUSEHOLD.min, HOUSEHOLD.max));
        }}
      />
      {current !== null && effective !== null && effective !== current.recipeId ? (
        <p className="ui-text-muted">
          {fillTemplate(planner.picker.replaces, { title: currentTitle ?? '' })}
        </p>
      ) : null}
      {saving ? (
        <p className="ui-progress" role="status">
          {planner.picker.saving}
        </p>
      ) : null}
      {reason === null ? null : (
        <Notice tone="amber" role="alert">
          <p>{reason.text}</p>
          <ReasonFollowUp
            reason={reason}
            storage={storage}
            date={date}
            snack={planDayView(model, date).snack}
            pharmacist={model.view.gates.pharmacistReminder}
            writable={writable}
          />
        </Notice>
      )}
      {failure === null ? null : (
        <Notice tone="amber" role="alert">
          <p>{failure}</p>
        </Notice>
      )}
      <ButtonRow>
        <Button
          variant="primary"
          disabled={!changed || saving || !writable}
          onClick={() => {
            // A 'conflict' recipe is never listed; 'unknown' asks for the label check first.
            if (servingNow === 'unknown') setChecking(true);
            else write(false);
          }}
        >
          {current === null ? fillTemplate(planner.picker.add, { day }) : planner.picker.save}
        </Button>
        <Button variant="secondary" disabled={saving} onClick={onCancel}>
          {planner.picker.cancel}
        </Button>
      </ButtonRow>
    </div>
  );
}
