import { foods, privacy } from '@diet/core/copy/health';
import { Button, Card, Notice } from '@diet/ui';
import { type ReactElement, useMemo, useState } from 'react';
import { appStorageStore, type AppStorage } from '../../db/runtime';
import { useFoodData } from '../../foods/FoodDataContext';
import { type FoodsState, useFoods } from '../../foods/useFoods';
import { useStore } from '../../store';
import { foodsModel } from './foodsModel';
import { FoodsView } from './FoodsView';

/** The first card while the list cannot be shown: still opening, or it could not be read. */
function FindCard({
  storage,
  failed,
}: {
  readonly storage: AppStorage | null;
  readonly failed: boolean;
}): ReactElement {
  return (
    <Card label={foods.screen.findLabel}>
      <p className="ui-text-muted">{foods.screen.intro}</p>
      {failed ? (
        <Notice role="alert">
          <p>{foods.screen.readFailed}</p>
          <Button
            variant="primary"
            onClick={() => {
              if (storage === null) window.location.reload();
              else storage.platform.reload();
            }}
          >
            {privacy.backupCard.reload}
          </Button>
        </Notice>
      ) : (
        <p role="status">{privacy.backupCard.notReady}</p>
      )}
    </Card>
  );
}

function ReadyFoods({
  storage,
  state,
}: {
  readonly storage: AppStorage;
  readonly state: Extract<FoodsState, { status: 'ready' }>;
}): ReactElement {
  const { approved, attributions } = useFoodData();
  // The query and the open food are this visit's only: never stored (item 18 design 1.3).
  const [query, setQuery] = useState('');
  const [openId, setOpenId] = useState<string | null>(null);
  const timeZone = storage.env.timeZone();
  const model = useMemo(
    () =>
      foodsModel({
        data: state.data,
        approved,
        attributions,
        views: state.views,
        resolve: state.resolve,
        profile: state.profile,
        query,
        openId,
        timeZone,
      }),
    [state, approved, attributions, query, openId, timeZone],
  );
  // A search that hides the open food closes it; focus stays in the search field.
  if (openId !== null && model.openId === null) setOpenId(null);
  return (
    <FoodsView
      model={model}
      query={query}
      onQuery={setQuery}
      onToggle={(id) => {
        setOpenId(openId === id ? null : id);
      }}
    />
  );
}

/**
 * "Foods in the app" (item 18; UX 7a), opened from About, Data sources. Read-only: the catalogue
 * as the owner's corrections leave it, searched by name or another name, each food's details on a
 * tap. The list waits for the owner's allergens and gluten-free setting, so it is never shown
 * without them (N21).
 */
export function FoodsScreen(): ReactElement {
  const storage = useStore(appStorageStore);
  const state = useFoods(storage);
  if (storage === null || state.status === 'pending')
    return <FindCard storage={storage} failed={false} />;
  if (state.status === 'error') return <FindCard storage={storage} failed />;
  return <ReadyFoods storage={storage} state={state} />;
}
