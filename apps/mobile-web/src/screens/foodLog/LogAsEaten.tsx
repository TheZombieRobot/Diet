/**
 * The recipe page's "Log as eaten" (item 23 design 1.9): the recipe panel for today, with serves
 * from the page's ?my=. Reached from today's planned meal that is not in the log yet (cross-item
 * ruling 22: the link carries the plan date and slot), it logs that planned meal as the plan row,
 * so the plan and the meal check see it as logged; otherwise it logs the recipe, asking first when
 * the same recipe is already in today's log. Past days are logged from the Food log.
 */
import {
  type FoodLogRecord,
  fillTemplate,
  type MealSlot,
  planMealsToLog,
  type RecipeData,
  type RecipeFoods,
  type RefId,
} from '@diet/core';
import { foodLog, recipes as recipesCopy } from '@diet/core/copy/health';
import { ActionRow, Button, ButtonRow, FoodIcon } from '@diet/ui';
import { type ReactElement, useEffect, useRef, useState } from 'react';
import type { AppStorage } from '../../db/runtime';
import { useFoodData } from '../../foods/FoodDataContext';
import { foodLogHref } from '../../routes';
import { useTargetsClock } from '../targets/useDayTargets';
import { LogRecipePanel } from './AddFood';
import type { LogContext } from './logContext';
import { useFoodLogDay } from './useFoodLogDay';
import { useLogWrite } from './useLogWrite';

export function LogAsEaten({
  storage,
  recipeId,
  myServes,
  plan,
  recipeFoods,
  recipes,
  writable,
}: {
  readonly storage: AppStorage;
  readonly recipeId: RefId;
  readonly myServes: number;
  /** The planned meal the page was opened from, if any. */
  readonly plan: { readonly date: string; readonly slot: MealSlot } | null;
  readonly recipeFoods: RecipeFoods;
  readonly recipes: RecipeData;
  readonly writable: boolean;
}): ReactElement {
  const clock = useTargetsClock(storage);
  const { today } = clock;
  const read = useFoodLogDay(storage, today, today);
  const { approved } = useFoodData();
  const [open, setOpen] = useState(false);
  const [logged, setLogged] = useState<FoodLogRecord | null>(null);
  const [undone, setUndone] = useState(false);
  const button = useRef<HTMLButtonElement>(null);
  const statusRef = useRef<HTMLParagraphElement>(null);
  const undo = useLogWrite('change');
  const rows = read?.ok === true ? read.rows : null;
  const home = rows?.settings.homeTimeZone ?? 'Pacific/Auckland';
  const plannedSlot =
    rows === null || plan === null || plan.date !== today
      ? null
      : (planMealsToLog(rows.planDay, rows.entries, today, home).find(
          (m) => m.slot === plan.slot && m.recipeId === recipeId && m.logged === null,
        )?.slot ?? null);
  const shown = logged !== null && rows?.entries.some((e) => e.id === logged.id) === true;
  // The panel that held focus is gone: the status line says what happened (review).
  useEffect(() => {
    if (shown || undone) statusRef.current?.focus();
  }, [shown, undone]);
  const ctx: LogContext | null =
    rows === null
      ? null
      : {
          storage,
          date: today,
          today,
          now: clock.at,
          deviceZone: clock.deviceZone,
          home,
          rows,
          recipeFoods,
          recipes,
          approved,
          catalogue: null,
          foodData: null,
          writable,
          alcoholLoggingAvailable: null,
          proteinTargetG: null,
        };
  return (
    <>
      {open ? null : (
        <ButtonRow>
          <Button
            ref={button}
            variant="secondary"
            disabled={!writable || ctx === null}
            onClick={() => {
              setLogged(null);
              setUndone(false);
              setOpen(true);
            }}
          >
            {recipesCopy.actions.logAsEaten}
          </Button>
        </ButtonRow>
      )}
      {open && ctx !== null ? (
        <LogRecipePanel
          ctx={ctx}
          recipeId={recipeId}
          initialServes={myServes}
          plannedSlot={plannedSlot}
          onLogged={(entry) => {
            setOpen(false);
            setLogged(entry);
          }}
          onCancel={() => {
            setOpen(false);
            requestAnimationFrame(() => button.current?.focus());
          }}
        />
      ) : null}
      <p ref={statusRef} role="status" tabIndex={-1} className="ui-text-muted ui-status-line">
        {shown
          ? fillTemplate(foodLog.add.logged, { name: logged.name })
          : undone && logged !== null
            ? fillTemplate(foodLog.add.undone, { name: logged.name })
            : ''}
      </p>
      {shown ? (
        <>
          <ActionRow
            href={foodLogHref()}
            badge={<FoodIcon size={22} />}
            title={foodLog.routeTitles.log}
          />
          <Button
            variant="quiet"
            aria-disabled={undo.busy}
            onClick={() => {
              void undo
                .run(() => storage.repos.foodLog.remove(logged.id))
                .then((done) => {
                  if (done !== null) setUndone(true);
                });
            }}
          >
            {foodLog.add.undo}
          </Button>
        </>
      ) : null}
    </>
  );
}
