/**
 * The Food log, #/food-log and #/food-log/<date> (item 23 design 1.2; UX_SCREENS 3c; FL-01 to
 * FL-03): one day at a time, with Add food, Eaten, Day totals, Water and electrolytes, Steps and
 * the summary for a GP. Days before today can be viewed and filled in; a future date opens today.
 * Moving between days replaces the address without a new history entry, so Back leaves the screen
 * in one step and focus stays on the day buttons. Every figure goes through item 18's display
 * rules; every write through the food log repository.
 */
import {
  addDays,
  type FoodLogRecord,
  fillTemplate,
  type LocalDate,
  logDay,
  recipeData,
} from '@diet/core';
import { foodLog, foods, privacy, recipes as recipesCopy } from '@diet/core/copy/health';
import { ActionRow, Button, ButtonRow, Card, ChevronIcon, Notice } from '@diet/ui';
import { type ReactElement, useEffect, useMemo, useRef, useState } from 'react';
import type { AppStorage } from '../../db/runtime';
import { appStorageStore } from '../../db/runtime';
import { catalogueFrom, useFoods } from '../../foods/useFoods';
import { useFoodData } from '../../foods/FoodDataContext';
import { formatPlanDate } from '../../format';
import { useReadinessGates } from '../../onboarding/state';
import { foodLogHref, foodLogRouteOf, gpSummaryHref } from '../../routes';
import { useStore } from '../../store';
import { useLocationHash } from '../../useRoute';
import { useGateOpen } from '../backup/focus';
import { ReloadButton } from '../recipes/parts';
import { useDayTargets, useTargetsClock } from '../targets/useDayTargets';
import { StepsCard } from '../today/StepsCard';
import { AddFoodCardBody } from './AddFood';
import type { LogContext } from './logContext';
import { EatenCard, TotalsCard } from './EatenCard';
import { recipeFoodsFrom } from './recipeFigures';
import { useFoodLogDay } from './useFoodLogDay';
import { useWaterGuide } from './useWaterGuide';
import { WaterDayCard } from './WaterDayCard';
import { useLogWrite } from './useLogWrite';

const copy = foodLog;

export function FoodLogScreen(): ReactElement {
  const storage = useStore(appStorageStore);
  if (storage === null)
    return (
      <Card label={copy.routeTitles.log}>
        <p className="ui-text-muted">{privacy.backupCard.notReady}</p>
      </Card>
    );
  return <FoodLog storage={storage} />;
}

function dayTitle(date: LocalDate, today: LocalDate): string {
  if (date === today) return copy.day.today;
  if (date === addDays(today, -1)) return copy.day.yesterday;
  return formatPlanDate(date);
}

function FoodLog({ storage }: { readonly storage: AppStorage }): ReactElement {
  const clock = useTargetsClock(storage);
  const { today } = clock;
  const hash = useLocationHash();
  const route = foodLogRouteOf(hash, today);
  // A day chosen with Previous and Next, for the address it was chosen on (a new address, from a
  // link or Back, starts from its own date). Following today means a new day at midnight is shown.
  const [chosen, setChosen] = useState<{
    readonly hash: string;
    readonly date: LocalDate;
    readonly follow: boolean;
  } | null>(null);
  const pick = chosen?.hash === hash ? chosen : null;
  const date =
    pick === null ? (route.followToday ? today : route.date) : pick.follow ? today : pick.date;
  const go = (next: LocalDate) => {
    const follow = next === today;
    setChosen({ hash, date: next, follow });
    setStatus(null);
    history.replaceState(history.state, '', follow ? foodLogHref() : foodLogHref(next));
  };

  const read = useFoodLogDay(storage, date, today);
  const gates = useReadinessGates(storage);
  const targets = useDayTargets(storage, clock);
  const guide = useWaterGuide(storage, clock, date);
  const foodsState = useFoods(storage);
  const { approved } = useFoodData();
  const writable = useGateOpen(storage.gate);
  const recipes = recipeData();
  // The Add food status line: the entry logged (with Undo), or the entry Undo removed.
  const [status, setStatus] = useState<
    | { readonly kind: 'logged'; readonly entry: FoodLogRecord }
    | { readonly kind: 'undone'; readonly name: string }
    | null
  >(null);
  const [editingSteps, setEditingSteps] = useState(false);
  const statusRef = useRef<HTMLParagraphElement>(null);
  const undo = useLogWrite('change');

  const rows = read?.ok === true ? read.rows : null;
  const home = rows?.settings.homeTimeZone ?? 'Pacific/Auckland';
  const day = useMemo(
    () => (rows === null ? null : logDay(rows.entries, rows.drinks, date, home, approved)),
    [rows, date, home, approved],
  );
  // Shown only once the live rows include the new entry, so the Eaten list and the line agree.
  const shownEntry =
    status?.kind === 'logged' && rows?.entries.some((e) => e.id === status.entry.id) === true
      ? status.entry
      : null;
  const loggedShown = shownEntry !== null;
  // After Undo the button is gone, so focus stays on the status line that says what was removed.
  const undone = status?.kind === 'undone';
  useEffect(() => {
    if (loggedShown || undone) statusRef.current?.focus();
  }, [loggedShown, undone]);

  const dayCard = (
    <Card label={dayTitle(date, today)}>
      <ButtonRow>
        <Button
          variant="quiet"
          onClick={() => {
            go(addDays(date, -1));
          }}
        >
          {copy.day.previous}
        </Button>
        <Button
          variant="quiet"
          aria-disabled={date >= today}
          onClick={() => {
            if (date < today) go(addDays(date, 1));
          }}
        >
          {copy.day.next}
        </Button>
      </ButtonRow>
    </Card>
  );
  if (read === undefined || rows === null || day === null) {
    return (
      <>
        {dayCard}
        {read === undefined ? (
          <Card label={copy.routeTitles.log}>
            <p className="ui-text-muted">{privacy.backupCard.notReady}</p>
          </Card>
        ) : (
          <Notice tone="amber" role="alert">
            <p>{copy.screen.readFailed}</p>
            <ReloadButton />
          </Notice>
        )}
      </>
    );
  }
  if (rows.settings.onboardingCompletedAt === null) {
    return (
      <>
        {dayCard}
        <p className="ui-text-muted">{copy.screen.setupFirst}</p>
      </>
    );
  }

  const foodReady = foodsState.status === 'ready' && recipes.status === 'ok';
  const ctx: LogContext = {
    storage,
    date,
    today,
    now: clock.at,
    deviceZone: clock.deviceZone,
    home,
    rows,
    recipeFoods:
      foodsState.status === 'ready'
        ? recipeFoodsFrom(foodsState.data, rows.recipeRows, approved)
        : null,
    recipes: recipes.status === 'ok' ? recipes.data : null,
    approved,
    catalogue: foodsState.status === 'ready' ? catalogueFrom(foodsState) : null,
    foodData: foodsState.status === 'ready' ? foodsState.data : null,
    writable,
    alcoholLoggingAvailable: gates === undefined ? null : gates.gates.alcoholLoggingAvailable,
    proteinTargetG: targets.status === 'ready' ? targets.view.targets.protein.checkTargetG : null,
  };
  const foodsMessage = foodReady ? null : foodsState.status === 'pending' ? (
    <p className="ui-text-muted">{privacy.backupCard.notReady}</p>
  ) : (
    <Notice tone="amber" role="status">
      <p>{recipes.status === 'ok' ? foods.screen.readFailed : recipesCopy.list.dataFailed}</p>
      <ReloadButton />
    </Notice>
  );
  return (
    <>
      {dayCard}
      {writable ? null : (
        <Notice tone="amber" role="status">
          <p>{privacy.backupCard.closed}</p>
          <ReloadButton />
        </Notice>
      )}
      <Card label={copy.add.label}>
        <AddFoodCardBody
          ctx={ctx}
          foodsMessage={foodsMessage}
          onLogged={(entry) => {
            setStatus({ kind: 'logged', entry });
          }}
        />
        <p ref={statusRef} role="status" tabIndex={-1} className="ui-text-muted ui-status-line">
          {shownEntry !== null
            ? fillTemplate(copy.add.logged, { name: shownEntry.name })
            : status?.kind === 'undone'
              ? fillTemplate(copy.add.undone, { name: status.name })
              : ''}
        </p>
        {shownEntry === null ? null : (
          <Button
            variant="quiet"
            disabled={!writable}
            aria-disabled={undo.busy}
            onClick={() => {
              void undo
                .run(() => storage.repos.foodLog.remove(shownEntry.id))
                .then((done) => {
                  if (done !== null) setStatus({ kind: 'undone', name: shownEntry.name });
                });
            }}
          >
            {copy.add.undo}
          </Button>
        )}
      </Card>
      <EatenCard
        key={date}
        ctx={ctx}
        day={day}
        openEntryId={route.date === date ? route.entryId : null}
      />
      <TotalsCard ctx={ctx} day={day} alcoholShown={ctx.alcoholLoggingAvailable === true} />
      <WaterDayCard key={`water-${date}`} ctx={ctx} rows={rows.water} guide={guide} />
      <StepsCard
        key={`steps-${date}`}
        storage={storage}
        date={date}
        todayRow={rows.steps ?? null}
        repeat={null}
        editing={editingSteps}
        onEditing={setEditingSteps}
        pastDay={date !== today}
      />
      <Card label={copy.gp.linkTitle}>
        <ActionRow
          href={gpSummaryHref()}
          badge={<ChevronIcon />}
          title={copy.gp.linkTitle}
          detail={copy.gp.linkDetail}
        />
      </Card>
    </>
  );
}
