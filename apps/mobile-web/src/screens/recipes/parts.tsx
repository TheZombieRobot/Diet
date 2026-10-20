/**
 * Parts both recipe screens share (item 20 design 3.3 and 3.4): the state cards, the diet-label
 * notices and the chips. A chip's word carries its meaning; colour is never the only signal.
 */
import { allergenListText, carbStyleChip, type RecipeView } from '@diet/core';
import { privacy, readiness, recipes } from '@diet/core/copy/health';
import { fillTemplate } from '@diet/core';
import { ActionRow, Button, Card, Chip, Notice } from '@diet/ui';
import type { ReactElement } from 'react';
import { routeHref } from '../../routes';
import type { RecipeLabels } from './useRecipeScreenData';

const reload = (): void => {
  location.reload();
};

export function ReloadButton(): ReactElement {
  return <Button onClick={reload}>{privacy.backupCard.reload}</Button>;
}

/** One card while a screen cannot show its recipes: still opening, unreadable, or no dataset. */
export function RecipeStateCard({
  label,
  state,
}: {
  readonly label: string;
  readonly state: 'data-error' | 'not-ready' | 'read-error';
}): ReactElement {
  return (
    <Card label={label}>
      {state === 'not-ready' ? (
        <p className="ui-text-muted" role="status">
          {privacy.backupCard.notReady}
        </p>
      ) : (
        <Notice tone="amber" role="alert">
          <p>{state === 'data-error' ? recipes.list.dataFailed : recipes.list.readFailed}</p>
          <ReloadButton />
        </Notice>
      )}
    </Card>
  );
}

/**
 * Why the carb-style labels are hidden (P13), or the prescriber notice when they show with answer
 * 3 not confirmed (HS-33). Nothing while the answers load.
 */
export function LabelNotices({ labels }: { readonly labels: RecipeLabels }): ReactElement | null {
  if (labels.carbLabels === 'off' && labels.offReasons !== null) {
    return (
      <>
        <Notice tone="info">
          <p>{fillTemplate(recipes.labels.off, { reasons: labels.offReasons })}</p>
        </Notice>
        <ActionRow href={routeHref('readiness')} title={readiness.settingsRow.title} />
      </>
    );
  }
  if (labels.carbLabels === 'failed') {
    return (
      <Notice tone="amber" role="alert">
        <p>{recipes.labels.gatesFailed}</p>
        <ReloadButton />
      </Notice>
    );
  }
  if (labels.prescriberCheck) {
    return (
      <Notice tone="info">
        <p>{recipes.labels.prescriberCheck}</p>
        <p>{readiness.confirmationHints.prescriberAgreed}</p>
        <p>
          <a className="ui-button ui-button--quiet" href={routeHref('readiness')}>
            {readiness.changeAnswersLink}
          </a>
        </p>
      </Notice>
    );
  }
  return null;
}

/** The carb chip's word (HS-39): a bare style only on complete carbs, else "Written for …". */
function carbChipText(view: RecipeView): string {
  const chip = carbStyleChip(view.carbStyle);
  switch (chip.kind) {
    case 'style':
      return recipes.chips.style[chip.style];
    case 'written':
      return recipes.chips.styleWritten[chip.style];
    case 'not-worked-out':
      return recipes.chips.carbsNotWorkedOut;
  }
}

/** Your version, the carb chip (labels shown only), and heart-smart or the saturated-fat flag. */
export function HeadChips({
  view,
  labels,
}: {
  readonly view: RecipeView;
  readonly labels: RecipeLabels;
}): ReactElement {
  return (
    <>
      {view.origin === 'owner' ? <Chip>{recipes.chips.yourVersion}</Chip> : null}
      {labels.carbLabels === 'shown' ? <Chip tone="neutral">{carbChipText(view)}</Chip> : null}
      {view.heart.kind === 'heart-smart' ? <Chip>{recipes.chips.heartSmart}</Chip> : null}
      {view.heart.kind === 'flagged' ? <Chip tone="amber">{recipes.chips.flagged}</Chip> : null}
    </>
  );
}

/** A list row's chips, in the design's order (3.3). */
export function ListChips({
  view,
  labels,
  glutenFreeHousehold,
}: {
  readonly view: RecipeView;
  readonly labels: RecipeLabels;
  readonly glutenFreeHousehold: boolean;
}): ReactElement {
  return (
    <>
      <HeadChips view={view} labels={labels} />
      {view.serving === 'conflict' ? (
        <Chip tone="amber">
          {fillTemplate(recipes.chips.allergenConflict, {
            allergens: allergenListText(view.conflicts),
          })}
        </Chip>
      ) : null}
      {/* Only for an owner who lists an allergen (P41). */}
      {view.serving === 'unknown' ? <Chip tone="neutral">{recipes.chips.checkLabels}</Chip> : null}
      {glutenFreeHousehold && view.glutenCereals.length > 0 ? (
        <Chip tone="neutral">{recipes.chips.glutenHousehold}</Chip>
      ) : null}
      {view.disliked ? <Chip tone="neutral">{recipes.chips.disliked}</Chip> : null}
      {view.hidden ? <Chip tone="neutral">{recipes.chips.hidden}</Chip> : null}
    </>
  );
}
