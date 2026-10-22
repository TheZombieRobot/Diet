/**
 * Settings' Hidden recipes card (item 22 design 2.15; UX 7; D3): the seed recipes the planner does
 * not suggest, in title order, each with "Suggest … again". Ids that are not seed recipes (a later
 * item may hide seed foods) are neither listed nor removed here.
 */
import { fillTemplate, seedRecipe } from '@diet/core';
import { planner } from '@diet/core/copy/health';
import { Button, Card, Notice } from '@diet/ui';
import { type ReactElement, useState } from 'react';
import { useLiveQuery } from '../../db/liveQuery';
import { appStorageStore, type AppStorage } from '../../db/runtime';
import { useStore } from '../../store';
import { useGateOpen } from '../backup/focus';
import { writeFailure } from './reasonText';

const readHidden = (storage: AppStorage) =>
  storage.repos.settings.get().then((s) => s.hiddenSeedIds);

export function HiddenRecipesCard(): ReactElement | null {
  const storage = useStore(appStorageStore);
  return storage === null ? null : <HiddenRecipes storage={storage} />;
}

function HiddenRecipes({ storage }: { readonly storage: AppStorage }): ReactElement {
  const ids = useLiveQuery(storage, readHidden);
  const writable = useGateOpen(storage.gate);
  const [failure, setFailure] = useState<string | null>(null);
  const hidden = (ids ?? [])
    .flatMap((id) => {
      const recipe = seedRecipe(id);
      return recipe === null ? [] : [recipe];
    })
    .sort((a, b) => a.title.localeCompare(b.title, 'en-NZ', { sensitivity: 'base' }));
  return (
    <Card label={planner.hidden.cardLabel}>
      <p className="ui-text-muted">{planner.hidden.intro}</p>
      {ids === undefined ? null : hidden.length === 0 ? (
        <p>{planner.hidden.none}</p>
      ) : (
        <ul className="ui-action-list">
          {hidden.map((recipe) => (
            <li key={recipe.id}>
              <p className="ui-text-strong">{recipe.title}</p>
              <Button
                variant="quiet"
                disabled={!writable}
                onClick={(event) => {
                  setFailure(null);
                  // Focus goes on to the next row's button, else the previous one's, else the
                  // card's heading, never to the top of the page.
                  const row = event.currentTarget.closest('li');
                  const next =
                    (row?.nextElementSibling ?? row?.previousElementSibling)?.querySelector(
                      'button',
                    ) ?? row?.closest('section')?.querySelector('h2');
                  storage.repos.settings
                    .update({ hiddenSeedIds: ids.filter((id) => id !== recipe.id) })
                    .then(
                      () => next?.focus(),
                      (error: unknown) => {
                        setFailure(writeFailure(error));
                      },
                    );
                }}
              >
                {fillTemplate(planner.hidden.showNamed, { title: recipe.title })}
              </Button>
            </li>
          ))}
        </ul>
      )}
      {failure === null ? null : (
        <Notice tone="amber" role="alert">
          <p>{failure}</p>
        </Notice>
      )}
    </Card>
  );
}
