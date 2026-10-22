/**
 * The recipe page's "What next" card (item 20 design 3.4 card 6, 3.5 and 3.6): Add to plan (item
 * 22's panel), Log as eaten (item 23's panel), Scale servings, Substitute ingredient with its panel,
 * Hide from suggestions for a seed (item 22), and for an owner's copy "Go back to the original
 * recipe". The panel offers only what core's
 * substituteOptions offers (never a food known to carry an allergen the owner listed), and the
 * repository refuses anything else. Every write is disabled while the records are closed.
 */
import {
  allergenRowPart,
  allergenSummary,
  fillTemplate,
  type RecipeView,
  type SeedRecipe,
  substituteOptions,
  type SwapOptions,
} from '@diet/core';
import { planner, privacy, recipes } from '@diet/core/copy/health';
import { ActionRow, Button, ButtonRow, Card, ChoiceList, Notice } from '@diet/ui';
import { type ReactElement, type RefObject, useEffect, useId, useRef, useState } from 'react';
import { StorageClosedError, StorageFullError, StorageRuleError } from '../../db/errors';
import type { AppStorage } from '../../db/runtime';
import { useStore } from '../../store';
import { recipeGramsText } from '../../format';
import { replaceKeepingEntry } from '../../navigation';
import { recipeHref, recipeRouteOf, routeHref } from '../../routes';
import { useLocationHash } from '../../useRoute';
import { LogAsEaten } from '../foodLog/LogAsEaten';
import { AddedNotice, type AddedToPlan, AddToPlanPanel } from '../planner/AddToPlanPanel';
import { cookingForOn, removeFailure, swapStatusStore } from './status';
import type { RecipeScreenState } from './useRecipeScreenData';

type Ready = Extract<RecipeScreenState, { status: 'ready' }>;

/** What a refused swap says (design 3.5); nothing was written. */
function swapFailure(error: unknown): string {
  if (error instanceof StorageRuleError) {
    if (error.rule === 'recipe-figures-unknown') return recipes.swap.blockedFigures;
    if (error.rule === 'recipe-swap-not-allowed') return recipes.swap.notAllowed;
    if (error.rule === 'recipe-copy-exists') return recipes.detail.copyExists;
  }
  if (error instanceof StorageFullError) return privacy.storageFull;
  if (error instanceof StorageClosedError) return privacy.backupCard.closed;
  return recipes.swap.failed;
}

/** Focuses an element once it is drawn (the panel's heading, the confirmation's heading). */
function useFocusOnMount<T extends HTMLElement>(): RefObject<T | null> {
  const ref = useRef<T>(null);
  useEffect(() => {
    ref.current?.focus();
  }, []);
  return ref;
}

interface PanelState {
  readonly lineIndex: number | null;
  readonly candidateId: string | null;
  readonly saving: boolean;
  readonly error: string | null;
}

function SwapPanel({
  storage,
  state,
  view,
  copySeed,
  cookingFor,
  writable,
  onClose,
}: {
  readonly storage: AppStorage;
  readonly state: Ready;
  readonly view: RecipeView;
  readonly copySeed: SeedRecipe | null;
  readonly cookingFor: number;
  readonly writable: boolean;
  /** 'updated': the swap was saved to this copy, and its confirmation takes focus. */
  readonly onClose: (why: 'cancel' | 'updated') => void;
}): ReactElement {
  const heading = useFocusOnMount<HTMLHeadingElement>();
  const [panel, setPanel] = useState<PanelState>({
    lineIndex: null,
    candidateId: null,
    saving: false,
    error: null,
  });
  const recipe = view.origin === 'seed' ? view.seed : (state.storedById.get(view.id) ?? null);
  const line = panel.lineIndex === null ? undefined : recipe?.lines[panel.lineIndex];
  const lineView = panel.lineIndex === null ? undefined : view.lines[panel.lineIndex];
  const options =
    line === undefined
      ? null
      : substituteOptions({
          line,
          seedLines: view.origin === 'owner' ? (copySeed?.lines ?? null) : null,
          foods: state.foods,
          profile: state.rows.profile,
          gardenIngredientIds: new Set(state.rows.gardenIngredientIds),
        });
  const chosen = options?.candidates.find((c) => c.id === panel.candidateId);
  // A copy saved elsewhere since this page opened (another tab): the refusal links to it.
  const existingCopy = state.rows.recipes.find((r) => r.derivedFromRecipeId === view.id);
  const factor = cookingFor / view.serves;
  const use = () => {
    if (panel.lineIndex === null || chosen === undefined || lineView === undefined) return;
    const from = lineView.name;
    const to = chosen.name;
    swapStatusStore.set(null);
    setPanel({ ...panel, saving: true, error: null });
    storage.repos.recipes
      .swapLine({ recipeId: view.id, lineIndex: panel.lineIndex, ingredientId: chosen.id })
      .then(
        ({ record, created }) => {
          if (created) {
            swapStatusStore.set({ recipeId: record.id, kind: 'created', from, to });
            // The copy takes this page's place, with its marks and "Cooking for".
            replaceKeepingEntry(recipeHref(record.id), cookingForOn(record.id, cookingFor));
          } else {
            swapStatusStore.set({ recipeId: view.id, kind: 'updated', from, to });
            onClose('updated');
          }
        },
        (error: unknown) => {
          setPanel({ ...panel, saving: false, error: swapFailure(error) });
        },
      );
  };
  const hiddenLines = options === null ? [] : hiddenSwapLines(options.hidden);
  return (
    <>
      <h3 ref={heading} tabIndex={-1}>
        {recipes.swap.title}
      </h3>
      <ChoiceList
        legend={recipes.swap.whichLegend}
        name="swap-line"
        options={view.lines.map((l) => ({
          value: String(l.index),
          label: l.name === '' ? recipes.ingredients.nameMissing : l.name,
          detail: recipeGramsText(l.rawG * factor),
        }))}
        value={panel.lineIndex === null ? null : String(panel.lineIndex)}
        onChange={(value) => {
          setPanel({ lineIndex: Number(value), candidateId: null, saving: false, error: null });
        }}
        disabled={panel.saving}
      />
      {options === null || lineView === undefined ? null : (
        <>
          {options.candidates.length === 0 ? (
            <p>{fillTemplate(recipes.swap.none, { ingredient: lineView.name })}</p>
          ) : (
            <ChoiceList
              legend={fillTemplate(recipes.swap.forLegend, { ingredient: lineView.name })}
              name="swap-to"
              options={options.candidates.map((c) => ({
                value: c.id,
                label: c.name,
                detail: [
                  allergenRowPart(allergenSummary(c.view)) ?? recipes.swap.candidateNone,
                  ...(c.inGarden ? [recipes.swap.candidateGarden] : []),
                ].join(' · '),
              }))}
              value={panel.candidateId}
              onChange={(value) => {
                setPanel({ ...panel, candidateId: value, error: null });
              }}
              disabled={panel.saving}
            />
          )}
          {hiddenLines.map((text) => (
            <p key={text} className="ui-text-muted">
              {text}
            </p>
          ))}
          <p className="ui-text-muted">{recipes.swap.amountNote}</p>
        </>
      )}
      {panel.error === null ? null : (
        <Notice tone="amber" role="alert">
          <p>{panel.error}</p>
          {panel.error === recipes.detail.copyExists ? (
            <ActionRow
              href={existingCopy === undefined ? routeHref('recipes') : recipeHref(existingCopy.id)}
              title={
                existingCopy === undefined ? recipes.detail.allRecipes : recipes.detail.openVersion
              }
            />
          ) : null}
        </Notice>
      )}
      {panel.saving ? (
        <p className="ui-progress" role="status">
          <span className="ui-spinner" aria-hidden="true" />
          {recipes.swap.saving}
        </p>
      ) : null}
      <ButtonRow>
        <Button
          variant="primary"
          disabled={chosen === undefined || panel.saving || !writable}
          onClick={use}
        >
          {chosen === undefined
            ? recipes.swap.chooseFirst
            : fillTemplate(recipes.swap.use, { ingredient: chosen.name })}
        </Button>
        <Button
          variant="secondary"
          disabled={panel.saving}
          onClick={() => {
            onClose('cancel');
          }}
        >
          {recipes.swap.cancel}
        </Button>
      </ButtonRow>
    </>
  );
}

function hiddenSwapLines(hidden: SwapOptions['hidden']): string[] {
  const lines: string[] = [];
  if (hidden.allergen === 1) lines.push(recipes.swap.hiddenAllergenOne);
  if (hidden.allergen > 1)
    lines.push(fillTemplate(recipes.swap.hiddenAllergenMany, { count: hidden.allergen }));
  if (hidden.glutenHousehold === 1) lines.push(recipes.swap.hiddenGlutenHouseholdOne);
  if (hidden.glutenHousehold > 1)
    lines.push(
      fillTemplate(recipes.swap.hiddenGlutenHouseholdMany, { count: hidden.glutenHousehold }),
    );
  if (hidden.dislike === 1) lines.push(recipes.swap.hiddenDislikeOne);
  if (hidden.dislike > 1)
    lines.push(fillTemplate(recipes.swap.hiddenDislikeMany, { count: hidden.dislike }));
  if (hidden.glutenFree > 0) lines.push(recipes.swap.hiddenGlutenFree);
  return lines;
}

function RemoveConfirm({
  storage,
  view,
  writable,
  cookingFor,
  onKeep,
}: {
  readonly storage: AppStorage;
  readonly view: RecipeView;
  readonly writable: boolean;
  readonly cookingFor: number;
  readonly onKeep: () => void;
}): ReactElement {
  const heading = useFocusOnMount<HTMLHeadingElement>();
  const [removing, setRemoving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const remove = () => {
    setRemoving(true);
    setError(null);
    storage.repos.recipes.removeCopy(view.id).then(
      () => {
        if (view.seed === null) {
          replaceKeepingEntry(routeHref('recipes'));
          return;
        }
        swapStatusStore.set({ recipeId: view.seed.id, kind: 'removed' });
        replaceKeepingEntry(recipeHref(view.seed.id), cookingForOn(view.seed.id, cookingFor));
      },
      (failure: unknown) => {
        setRemoving(false);
        setError(removeFailure(failure));
      },
    );
  };
  return (
    <Notice tone="amber">
      <h3 ref={heading} tabIndex={-1}>
        {recipes.remove.confirmTitle}
      </h3>
      <p>{recipes.remove.confirmBody}</p>
      {error === null ? null : (
        <p role="alert">
          <strong>{error}</strong>
        </p>
      )}
      {removing ? (
        <p className="ui-progress" role="status">
          <span className="ui-spinner" aria-hidden="true" />
          {recipes.remove.removing}
        </p>
      ) : null}
      <ButtonRow>
        <Button variant="caution" disabled={removing || !writable} onClick={remove}>
          {recipes.remove.confirm}
        </Button>
        <Button variant="secondary" disabled={removing} onClick={onKeep}>
          {recipes.remove.keep}
        </Button>
      </ButtonRow>
    </Notice>
  );
}

/**
 * The confirmation of a swap saved to this copy, where the swap was made, taking focus so it is
 * seen and announced (the page does not change).
 */
function UpdatedNotice({ from, to }: { readonly from: string; readonly to: string }): ReactElement {
  const box = useFocusOnMount<HTMLDivElement>();
  return (
    <div ref={box} tabIndex={-1} className="ui-focus-target">
      <Notice tone="info" role="status">
        <p>{fillTemplate(recipes.swap.doneUpdate, { from, to })}</p>
      </Notice>
    </div>
  );
}

export function RecipeActions({
  storage,
  state,
  view,
  copyOfSeed,
  cookingFor,
  myServes,
  writable,
}: {
  readonly storage: AppStorage;
  readonly state: Ready;
  readonly view: RecipeView;
  /** The owner's copy of this seed, when it has one: Substitute becomes a link to it (P17). */
  readonly copyOfSeed: { readonly id: string } | null;
  readonly cookingFor: number;
  /** The page's ?my= portion (item 22's Add to plan starts from it). */
  readonly myServes: number;
  readonly writable: boolean;
}): ReactElement {
  const [planOpen, setPlanOpen] = useState(false);
  const [added, setAdded] = useState<AddedToPlan | null>(null);
  const [hideFailure, setHideFailure] = useState<string | null>(null);
  const addButton = useRef<HTMLButtonElement>(null);
  const hiddenIds = state.rows.hiddenSeedIds;
  const hidden = view.origin === 'seed' && hiddenIds.includes(view.id);
  const setHidden = (hide: boolean) => {
    setHideFailure(null);
    storage.repos.settings
      .update({
        hiddenSeedIds: hide ? [...hiddenIds, view.id] : hiddenIds.filter((id) => id !== view.id),
      })
      .catch(() => {
        setHideFailure(planner.refused.failed);
      });
  };
  const plan = recipeRouteOf(useLocationHash())?.plan ?? null;
  const blockedId = useId();
  const [panelOpen, setPanelOpen] = useState(false);
  const [asking, setAsking] = useState(false);
  const removeButton = useRef<HTMLButtonElement>(null);
  const substituteButton = useRef<HTMLButtonElement>(null);
  const status = useStore(swapStatusStore);
  const updated = status?.kind === 'updated' && status.recipeId === view.id ? status : null;
  const blocked =
    view.swappable === 'figures-unknown'
      ? recipes.swap.blockedFigures
      : view.swappable === 'ingredient-missing'
        ? recipes.swap.blockedMissing
        : null;
  const substituteOff = blocked !== null || !writable;
  const press = (run: () => void) => () => {
    swapStatusStore.set(null);
    run();
  };
  return (
    <Card label={recipes.actions.label}>
      <ButtonRow>
        {/* Item 22 (V33): a seed with an owner copy links to that copy instead (D3). */}
        {copyOfSeed === null && !planOpen ? (
          <Button
            ref={addButton}
            variant="primary"
            disabled={!writable}
            onClick={press(() => {
              setAdded(null);
              setPlanOpen(true);
            })}
          >
            {recipes.actions.addToPlan}
          </Button>
        ) : null}
      </ButtonRow>
      {planOpen ? (
        <AddToPlanPanel
          storage={storage}
          view={view}
          myServes={myServes}
          onCancel={() => {
            setPlanOpen(false);
            requestAnimationFrame(() => addButton.current?.focus());
          }}
          onAdded={(next) => {
            setPlanOpen(false);
            setAdded(next);
          }}
        />
      ) : null}
      {added === null ? null : <AddedNotice added={added} />}
      {/* Item 23: log this recipe as eaten today (or today's planned meal it was opened from). */}
      <LogAsEaten
        storage={storage}
        recipeId={view.id}
        myServes={myServes}
        plan={plan}
        recipeFoods={state.foods}
        recipes={state.data}
        writable={writable}
      />
      <ButtonRow>
        <Button
          variant="secondary"
          onClick={press(() => {
            const target = document.getElementById('recipe-scale');
            target?.scrollIntoView({ block: 'center' });
            target?.focus();
          })}
        >
          {recipes.actions.scale}
        </Button>
        {copyOfSeed === null ? (
          <Button
            ref={substituteButton}
            variant="tint"
            className={substituteOff ? 'ui-button--off' : undefined}
            aria-disabled={substituteOff ? 'true' : undefined}
            aria-describedby={blocked === null ? undefined : blockedId}
            aria-expanded={panelOpen}
            onClick={press(() => {
              if (!substituteOff) setPanelOpen(true);
            })}
          >
            {recipes.actions.substitute}
          </Button>
        ) : null}
      </ButtonRow>
      {copyOfSeed === null ? null : (
        <ActionRow href={recipeHref(copyOfSeed.id)} title={recipes.detail.openVersion} />
      )}
      {blocked === null || copyOfSeed !== null ? null : (
        <p id={blockedId} className="ui-text-muted">
          {blocked}
        </p>
      )}
      {panelOpen ? (
        <SwapPanel
          storage={storage}
          state={state}
          view={view}
          copySeed={view.seed}
          cookingFor={cookingFor}
          writable={writable}
          onClose={(why) => {
            setPanelOpen(false);
            // Cancel returns focus to the button; a saved swap's confirmation takes it itself.
            if (why === 'cancel') requestAnimationFrame(() => substituteButton.current?.focus());
          }}
        />
      ) : null}
      {updated === null ? null : <UpdatedNotice from={updated.from} to={updated.to} />}
      {/* One button for both, so focus stays on it when it changes. */}
      {view.origin === 'seed' && hidden ? (
        <p className="ui-text-muted">{planner.hidden.hiddenNote}</p>
      ) : null}
      {view.origin === 'seed' ? (
        <Button
          variant="quiet"
          disabled={!writable}
          onClick={() => {
            setHidden(!hidden);
          }}
        >
          {hidden ? planner.hidden.unhide : planner.hidden.hide}
        </Button>
      ) : null}
      {hideFailure === null ? null : (
        <Notice tone="amber" role="alert">
          <p>{hideFailure}</p>
        </Notice>
      )}
      {view.origin === 'owner' ? (
        asking ? (
          <RemoveConfirm
            storage={storage}
            view={view}
            writable={writable}
            cookingFor={cookingFor}
            onKeep={() => {
              setAsking(false);
              requestAnimationFrame(() => removeButton.current?.focus());
            }}
          />
        ) : (
          <ButtonRow>
            <Button
              ref={removeButton}
              variant="caution"
              disabled={!writable}
              onClick={press(() => {
                setAsking(true);
              })}
            >
              {recipes.actions.removeVersion}
            </Button>
          </ButtonRow>
        )
      ) : null}
    </Card>
  );
}
