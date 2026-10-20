/**
 * The recipe page's "What next" card (item 20 design 3.4 card 6, 3.5 and 3.6): Add to plan and
 * Log as eaten as later steps, Scale servings, Substitute ingredient with its panel, and for an
 * owner's copy "Go back to the original recipe". The panel offers only what core's
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
} from '@diet/core';
import { privacy, recipes } from '@diet/core/copy/health';
import { ActionRow, Button, ButtonRow, Card, ChoiceList, Chip, Notice } from '@diet/ui';
import { type ReactElement, type RefObject, useEffect, useId, useRef, useState } from 'react';
import { StorageClosedError, StorageFullError, StorageRuleError } from '../../db/errors';
import type { AppStorage } from '../../db/runtime';
import { recipeGramsText } from '../../format';
import { recipeHref, routeHref } from '../../routes';
import { swapStatusStore } from './status';
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

function removeFailure(error: unknown): string {
  if (error instanceof StorageRuleError && error.rule === 'recipe-in-plan')
    return recipes.remove.inPlan;
  if (error instanceof StorageFullError) return privacy.storageFull;
  if (error instanceof StorageClosedError) return privacy.backupCard.closed;
  return recipes.remove.failed;
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
  readonly onClose: () => void;
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
            location.replace(recipeHref(record.id));
          } else {
            swapStatusStore.set({ recipeId: view.id, kind: 'updated', from, to });
            onClose();
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
          {fillTemplate(recipes.swap.use, { ingredient: chosen?.name ?? lineView?.name ?? '' })}
        </Button>
        <Button variant="secondary" disabled={panel.saving} onClick={onClose}>
          {recipes.swap.cancel}
        </Button>
      </ButtonRow>
    </>
  );
}

function hiddenSwapLines(hidden: {
  readonly allergen: number;
  readonly dislike: number;
  readonly glutenFree: number;
}): string[] {
  const lines: string[] = [];
  if (hidden.allergen === 1) lines.push(recipes.swap.hiddenAllergenOne);
  if (hidden.allergen > 1)
    lines.push(fillTemplate(recipes.swap.hiddenAllergenMany, { count: hidden.allergen }));
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
  onKeep,
}: {
  readonly storage: AppStorage;
  readonly view: RecipeView;
  readonly writable: boolean;
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
          location.replace(routeHref('recipes'));
          return;
        }
        swapStatusStore.set({ recipeId: view.seed.id, kind: 'removed' });
        location.replace(recipeHref(view.seed.id));
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

export function RecipeActions({
  storage,
  state,
  view,
  copyOfSeed,
  cookingFor,
  writable,
}: {
  readonly storage: AppStorage;
  readonly state: Ready;
  readonly view: RecipeView;
  /** The owner's copy of this seed, when it has one: Substitute becomes a link to it (P17). */
  readonly copyOfSeed: { readonly id: string } | null;
  readonly cookingFor: number;
  readonly writable: boolean;
}): ReactElement {
  const laterId = useId();
  const blockedId = useId();
  const [panelOpen, setPanelOpen] = useState(false);
  const [asking, setAsking] = useState(false);
  const removeButton = useRef<HTMLButtonElement>(null);
  const blocked =
    view.swappable === 'figures-unknown'
      ? recipes.swap.blockedFigures
      : view.swappable === 'ingredient-missing'
        ? recipes.swap.blockedMissing
        : null;
  const press = (run: () => void) => () => {
    swapStatusStore.set(null);
    run();
  };
  const later = (label: string) => (
    <Button variant="secondary" aria-disabled="true" aria-describedby={laterId}>
      {label} <Chip tone="neutral">{recipes.actions.later}</Chip>
    </Button>
  );
  return (
    <Card label={recipes.actions.label}>
      <ButtonRow>
        {later(recipes.actions.addToPlan)}
        {later(recipes.actions.logAsEaten)}
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
            variant="tint"
            aria-disabled={blocked !== null || !writable ? 'true' : undefined}
            aria-describedby={blocked === null ? undefined : blockedId}
            aria-expanded={panelOpen}
            onClick={press(() => {
              if (blocked === null && writable) setPanelOpen(true);
            })}
          >
            {recipes.actions.substitute}
          </Button>
        ) : null}
      </ButtonRow>
      {copyOfSeed === null ? null : (
        <ActionRow href={recipeHref(copyOfSeed.id)} title={recipes.detail.openVersion} />
      )}
      <p id={laterId} className="ui-text-muted">
        {recipes.actions.laterNote}
      </p>
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
          onClose={() => {
            setPanelOpen(false);
          }}
        />
      ) : null}
      {view.origin === 'owner' ? (
        asking ? (
          <RemoveConfirm
            storage={storage}
            view={view}
            writable={writable}
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
