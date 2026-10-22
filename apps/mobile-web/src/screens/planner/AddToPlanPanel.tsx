/**
 * "Add to plan" on a recipe's page (item 22 design 2.14 and 2.11; UX 3b; P41, HS-24, C43): a day
 * of the next seven and a meal its eating window has, the owner's portion and "Cooking for". A
 * recipe that contains a listed allergen asks first (the conflict confirmation, naming it and any
 * other listed allergen it is not known to be free of); one whose allergens are not fully known
 * shows the label check. Only the confirm button writes, as the owner's own meal, which the
 * repository checks again.
 */
import {
  addDays,
  allergenListText,
  allowedSlots,
  blockedAllergens,
  fillTemplate,
  labelCheckView,
  type LocalDate,
  type MealSlot,
  mealSharing,
  type PlanWriteRefusal,
  type RecipeView,
  servingFor,
} from '@diet/core';
import { planner, profile as profileCopy, recipes } from '@diet/core/copy/health';
import { ActionRow, Button, ButtonRow, ChoiceList, Notice, Stepper } from '@diet/ui';
import { type ReactElement, useEffect, useRef, useState } from 'react';
import type { AppStorage } from '../../db/runtime';
import { formatPlanDate } from '../../format';
import { planDayHref } from '../../routes';
import { writeOwnerMeal } from './actions';
import { ClosedNotice, PlannerStateCard, ReasonFollowUp } from './parts';
import { planDayView, startingServes } from './planModel';
import { reasonText, slotLabel, slotLabelLower, writeFailure } from './reasonText';
import { usePlanner } from './usePlanner';

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

export interface AddedToPlan {
  readonly date: LocalDate;
  readonly slot: MealSlot;
}

export function AddToPlanPanel({
  storage,
  view,
  myServes: pageServes,
  onCancel,
  onAdded,
}: {
  readonly storage: AppStorage;
  readonly view: RecipeView;
  /** The page's ?my= portion, when it was opened from a plan day. */
  readonly myServes: number;
  readonly onCancel: () => void;
  readonly onAdded: (added: AddedToPlan) => void;
}): ReactElement {
  const state = usePlanner(storage, null);
  const heading = useRef<HTMLHeadingElement>(null);
  const [date, setDate] = useState<LocalDate | null>(null);
  const [slot, setSlot] = useState<MealSlot | null>(null);
  const [myServes, setMyServes] = useState(clamp(pageServes, 0.5, 4));
  const [household, setHousehold] = useState<number | null>(null);
  const [asking, setAsking] = useState<'conflict' | 'labels' | null>(null);
  const [saving, setSaving] = useState(false);
  const [refusal, setRefusal] = useState<PlanWriteRefusal | null>(null);
  const [failure, setFailure] = useState<string | null>(null);
  useEffect(() => {
    heading.current?.focus();
  }, [asking]);
  if (state.status !== 'ready') {
    return <PlannerStateCard label={planner.addFromRecipe.title} state={state.status} />;
  }
  const { model, writable } = state;
  const today = model.clock.today;
  const dates = Array.from({ length: 7 }, (_, i) => addDays(today, i));
  const chosenDate = date ?? today;
  const ctx = model.dayCtx(chosenDate);
  const meals = planDayView(model, chosenDate).row?.meals ?? [];
  const slots = allowedSlots(ctx.slots).filter((s) => view.slots.includes(s));
  const chosenSlot = slot !== null && slots.includes(slot) ? slot : (slots[0] ?? null);
  const cookingFor =
    household ??
    (chosenSlot === null ? 1 : startingServes(model, chosenSlot, null).householdServes);
  const blocked = blockedAllergens(model.records.profile, mealSharing(cookingFor));
  const live = model.lookup.viewOf(view.id) ?? view;
  const serving = servingFor(blocked, live.allergens.facts);
  const unknownFacts = live.allergens.facts.allergensUnknown;
  const check = labelCheckView(live, blocked);
  const otherUnknown = unknownFacts ? blocked.filter((a) => !serving.conflicts.includes(a)) : [];

  const write = (confirmed: 'labels' | 'conflict' | null) => {
    if (chosenSlot === null) return;
    setSaving(true);
    setRefusal(null);
    setFailure(null);
    writeOwnerMeal(
      storage,
      {
        date: chosenDate,
        slot: chosenSlot,
        meal: { recipeId: view.id, myServes, householdServes: cookingFor },
      },
      confirmed === 'labels'
        ? { labelChecked: [{ recipeId: view.id, allergens: check.allergens }] }
        : confirmed === 'conflict'
          ? {
              conflictConfirmed: [
                { recipeId: view.id, allergens: unknownFacts ? blocked : serving.conflicts },
              ],
            }
          : {},
    ).then(
      (outcome) => {
        setSaving(false);
        setAsking(null);
        const refused = outcome.refused[0];
        if (refused !== undefined) setRefusal(refused.refusal);
        else onAdded({ date: chosenDate, slot: chosenSlot });
      },
      (error: unknown) => {
        setSaving(false);
        setFailure(writeFailure(error));
      },
    );
  };
  const buttons = (
    confirm: string,
    confirmVariant: 'primary' | 'caution',
    kind: 'labels' | 'conflict',
  ) => (
    <ButtonRow>
      <Button
        variant={confirmVariant}
        disabled={saving || !writable}
        onClick={() => {
          write(kind);
        }}
      >
        {confirm}
      </Button>
      <Button
        variant="secondary"
        disabled={saving}
        onClick={() => {
          setAsking(null);
        }}
      >
        {kind === 'labels' ? planner.labelCheck.cancel : planner.conflict.cancel}
      </Button>
    </ButtonRow>
  );
  const lineList = (
    <ul className="ui-plan-list">
      {check.lineNames.map((name, i) => (
        <li key={`${name}-${i}`}>{name === '' ? recipes.ingredients.nameMissing : name}</li>
      ))}
    </ul>
  );
  const reason =
    refusal === null
      ? null
      : reasonText(
          refusal,
          {
            plainFigures: model.view.display.plainFigures,
            pregnancyNote: model.view.display.pregnancyNote,
            snackFits: false,
            hasWindow: ctx.window !== null,
            where: 'owner',
          },
          model.lookup,
        );
  return (
    <div data-testid="add-to-plan">
      {writable ? null : <ClosedNotice />}
      {asking === 'conflict' ? (
        <Notice tone="amber">
          <h3 ref={heading} tabIndex={-1} className="ui-text-strong">
            {planner.conflict.title}
          </h3>
          <p>
            {fillTemplate(recipes.allergens.conflict, {
              allergens: allergenListText(serving.conflicts),
            })}
          </p>
          {otherUnknown.length === 0 ? null : (
            <>
              <p>
                {fillTemplate(recipes.allergens.unknownForYou, {
                  allergens: allergenListText(otherUnknown),
                })}
              </p>
              {lineList}
            </>
          )}
          {buttons(planner.conflict.confirm, 'caution', 'conflict')}
        </Notice>
      ) : asking === 'labels' ? (
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
          {lineList}
          <p className="ui-text-muted">{planner.labelCheck.once}</p>
          {buttons(planner.labelCheck.confirm, 'primary', 'labels')}
        </div>
      ) : (
        <>
          <h3 ref={heading} tabIndex={-1} className="ui-text-strong">
            {planner.addFromRecipe.title}
          </h3>
          <ChoiceList
            legend={planner.addFromRecipe.dayLegend}
            name="add-to-plan-day"
            options={dates.map((d, i) => ({
              value: d,
              label:
                i === 0
                  ? planner.dayNames.today
                  : i === 1
                    ? planner.dayNames.tomorrow
                    : formatPlanDate(d),
            }))}
            value={chosenDate}
            disabled={saving}
            onChange={(value) => {
              setDate(value);
              setRefusal(null);
            }}
          />
          {chosenSlot === null ? (
            <p>{planner.addFromRecipe.noMeal}</p>
          ) : (
            <ChoiceList
              legend={planner.addFromRecipe.mealLegend}
              name="add-to-plan-meal"
              options={slots.map((s) => {
                const planned = meals.find((m) => m.slot === s);
                return {
                  value: s,
                  label: slotLabel(s, ctx.window),
                  detail:
                    planned === undefined
                      ? undefined
                      : fillTemplate(planner.picker.current, {
                          title:
                            model.lookup.viewOf(planned.recipeId)?.title ??
                            planner.day.recipeMissing,
                        }),
                };
              })}
              value={chosenSlot}
              disabled={saving}
              onChange={(value) => {
                setSlot(slots.find((s) => s === value) ?? null);
                setRefusal(null);
              }}
            />
          )}
          <Stepper
            label={planner.picker.portionLabel}
            hint={planner.picker.portionHint}
            value={myServes}
            min={0.5}
            max={4}
            step={0.5}
            decreaseLabel={planner.picker.portionFewer}
            increaseLabel={planner.picker.portionMore}
            onChange={(v) => {
              setMyServes(clamp(v, 0.5, 4));
            }}
          />
          <Stepper
            label={planner.picker.cookingForLabel}
            hint={profileCopy.householdHint}
            value={cookingFor}
            min={1}
            max={20}
            decreaseLabel={profileCopy.householdFewer}
            increaseLabel={profileCopy.householdMore}
            onChange={(v) => {
              setHousehold(clamp(v, 1, 20));
            }}
          />
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
                date={chosenDate}
                snack={null}
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
            {chosenSlot === null ? null : (
              <Button
                variant="primary"
                disabled={saving || !writable}
                onClick={() => {
                  if (serving.serving === 'conflict') setAsking('conflict');
                  else if (serving.serving === 'unknown') setAsking('labels');
                  else write(null);
                }}
              >
                {recipes.actions.addToPlan}
              </Button>
            )}
            <Button variant="secondary" disabled={saving} onClick={onCancel}>
              {planner.picker.cancel}
            </Button>
          </ButtonRow>
        </>
      )}
    </div>
  );
}

/** What the page says after an add (design 2.14 step 7). */
export function AddedNotice({ added }: { readonly added: AddedToPlan }): ReactElement {
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    box.current?.focus();
  }, [added]);
  const day = formatPlanDate(added.date);
  return (
    <div ref={box} tabIndex={-1} className="ui-focus-target">
      <Notice tone="info" role="status">
        <p>
          {fillTemplate(planner.addFromRecipe.added, {
            day,
            slot: slotLabelLower(added.slot, null),
          })}
        </p>
        <ActionRow
          href={planDayHref(added.date)}
          title={fillTemplate(planner.addFromRecipe.openDay, { day })}
        />
      </Notice>
    </div>
  );
}
