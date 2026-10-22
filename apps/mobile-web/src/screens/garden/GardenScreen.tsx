import { localDateOf } from '@diet/core';
import { gardenScreen, privacy } from '@diet/core/copy/health';
import { Button, Card, Notice } from '@diet/ui';
import { type ReactElement, useEffect, useRef, useState } from 'react';
import { useLiveQueryState } from '../../db/liveQuery';
import { type AppStorage, appStorageStore } from '../../db/runtime';
import { useFoodCatalogue } from '../../foods/useFoods';
import { usePhotoIds } from '../../garden/photoStore';
import { browserPhotoPlatform, type PhotoPlatform } from '../../garden/preparePhoto';
import { replaceKeepingEntry } from '../../navigation';
import { routeDetail, routeHref } from '../../routes';
import { useStore } from '../../store';
import { useNow } from '../../useNow';
import { useRouteDetail } from '../../useRoute';
import { GardenCard } from './GardenCard';
import {
  type CardId,
  type FocusTarget,
  type InventoryActions,
  type InventoryContext,
  type OpenerButton,
  type OpenForm,
  sameForm,
  useGateClosed,
  type WriteProblem,
} from './inventory';
import { PantryCard } from './PantryCard';

const copy = gardenScreen;

interface CardMessages {
  readonly status: string;
  readonly alert: string | null;
}
type Messages = Readonly<Record<CardId, CardMessages>>;
const NO_MESSAGES: Messages = {
  garden: { status: '', alert: null },
  pantry: { status: '', alert: null },
};

const cardOf = (form: OpenForm): CardId => (form.kind === 'pantry' ? 'pantry' : 'garden');

const alertText = (problem: WriteProblem): string | null =>
  problem === 'closed'
    ? null
    : problem === 'full'
      ? privacy.storageFull
      : problem === 'gone'
        ? copy.gone
        : copy.errors.saveFailed;

/** Leaves #/garden/harvest for #/garden in the same history entry, once the harvest panel closes. */
function leaveHarvestLink(): void {
  if (routeDetail(window.location.hash) === 'harvest') replaceKeepingEntry(routeHref('garden'));
}

/** The first field of the open form (G30: the form with unsaved typing keeps the owner there). */
function focusOpenForm(): void {
  document
    .querySelector<HTMLElement>('.ui-item-panel input:not([hidden]), .ui-item-panel button')
    ?.focus();
}

const readRows = (storage: AppStorage) => storage.repos.stock.rows();

/**
 * Garden and pantry (UX_SCREENS 3d; checklist item 19; design 1.4): the Garden card, then the
 * Pantry card. Reached from Food (its link card) and from Today's Add harvest (#/garden/harvest,
 * which opens the harvest panel once the crops arrive). Every action writes to the phone, so the
 * screen works the same offline. Photos stay on this phone (garden/photoStore.ts).
 */
export function GardenScreen({
  photoPlatform = browserPhotoPlatform,
}: {
  readonly photoPlatform?: PhotoPlatform;
}): ReactElement {
  const storage = useStore(appStorageStore);
  if (storage === null) {
    return (
      <>
        <Card label={copy.gardenCard}>
          <p className="ui-text-muted">{copy.loading}</p>
        </Card>
        <Card label={copy.pantryCard}>
          <p className="ui-text-muted">{copy.loading}</p>
        </Card>
      </>
    );
  }
  return <GardenWithRecords storage={storage} photoPlatform={photoPlatform} />;
}

function GardenWithRecords({
  storage,
  photoPlatform,
}: {
  readonly storage: AppStorage;
  readonly photoPlatform: PhotoPlatform;
}): ReactElement {
  // Re-read on visibilitychange and focus, so days left are right after midnight (G34).
  const now = useNow(storage.env);
  const zone = storage.env.timeZone();
  // The one place the screen reads the link catalogue: every seed and the owner's own foods once
  // the dataset is read, only silverbeet before that (item 18 design 1.6).
  const catalogue = useFoodCatalogue(storage);
  const closed = useGateClosed(storage.gate);
  const read = useLiveQueryState(storage, readRows);
  const photoIds = usePhotoIds(storage);
  const detail = useRouteDetail();
  const [open, setOpen] = useState<OpenForm | null>(null);
  const [dirty, setDirty] = useState(false);
  const [messages, setMessages] = useState<Messages>(NO_MESSAGES);
  // The #/garden/harvest arrival the screen has acted on: the panel opens once, when the crops arrive.
  const [arrived, setArrived] = useState(false);
  const rowButtons = useRef(new Map<string, HTMLButtonElement>());
  const openers = useRef(new Map<OpenerButton, HTMLButtonElement>());
  const harvestFirst = useRef<HTMLInputElement>(null);
  const pendingFocus = useRef<FocusTarget | 'harvest' | null>(null);

  const rows = read.status === 'ready' ? read.value : null;
  // A row removed in the meantime (another tab) takes its open form with it: the form closes and
  // the card says so, so the screen never waits on a form it no longer shows (design 1.4, "gone").
  if (rows !== null && open !== null && open.kind !== 'harvest' && open.id !== null) {
    const openId = open.id;
    const listed = open.kind === 'crop' ? rows.garden : rows.pantry;
    if (!listed.some((r) => r.id === openId)) {
      setOpen(null);
      setDirty(false);
      setMessages({ ...NO_MESSAGES, [cardOf(open)]: { status: '', alert: copy.gone } });
    }
  }
  if (detail === 'harvest' && rows !== null && !arrived) {
    setArrived(true);
    setOpen({ kind: 'harvest' });
    setDirty(false);
  }
  if (detail !== 'harvest' && arrived) setArrived(false);

  // On arrival from the quick action the panel is scrolled into view; focus stays on the heading,
  // where the shell puts it after a route change.
  useEffect(() => {
    if (!arrived) return;
    const opener = openers.current.get('add-harvest');
    if (opener !== undefined && typeof opener.scrollIntoView === 'function') {
      opener.scrollIntoView({ block: 'start' });
    }
  }, [arrived]);

  // Focus asked for by the last action, once its element is drawn (a new row arrives in a later read).
  useEffect(() => {
    const target = pendingFocus.current;
    if (target === null) return;
    const element =
      target === 'harvest'
        ? harvestFirst.current
        : 'row' in target
          ? rowButtons.current.get(target.row)
          : openers.current.get(target.button);
    if (element === null || element === undefined) return;
    pendingFocus.current = null;
    element.focus();
    if (target === 'harvest' && typeof element.scrollIntoView === 'function') {
      element.scrollIntoView({ block: 'center' });
    }
  }, [open, read]);

  const show = (next: OpenForm | null) => {
    if (open?.kind === 'harvest' && next?.kind !== 'harvest') leaveHarvestLink();
    setOpen(next);
    setDirty(false);
  };
  const actions: InventoryActions = {
    request: (next) => {
      if (open !== null && dirty && !sameForm(open, next)) {
        const card = cardOf(open);
        setMessages((m) => ({ ...m, [card]: { status: copy.saveOrCancelFirst, alert: null } }));
        focusOpenForm();
        return;
      }
      setMessages(NO_MESSAGES);
      if (next?.kind === 'harvest') pendingFocus.current = 'harvest';
      else if (next === null && open !== null) {
        pendingFocus.current =
          'id' in open && open.id !== null
            ? { row: open.id }
            : {
                button:
                  open.kind === 'harvest'
                    ? 'add-harvest'
                    : open.kind === 'crop'
                      ? 'add-crop'
                      : 'add-pantry',
              };
      }
      show(next);
    },
    markDirty: () => {
      setDirty(true);
    },
    finish: (card, status, focus) => {
      setMessages({ ...NO_MESSAGES, [card]: { status: status ?? '', alert: null } });
      pendingFocus.current = focus;
      show(null);
    },
    switchTo: (form, focus) => {
      setMessages(NO_MESSAGES);
      pendingFocus.current = focus;
      show(form);
    },
    say: (card, text) => {
      setMessages((m) => ({ ...m, [card]: { status: text, alert: null } }));
    },
    alert: (card, problem) => {
      if (problem === 'gone') show(null);
      setMessages((m) => ({ ...m, [card]: { status: '', alert: alertText(problem) } }));
    },
    rowRef: (id) => (element) => {
      if (element === null) rowButtons.current.delete(id);
      else rowButtons.current.set(id, element);
    },
    openerRef: (button) => (element) => {
      if (element === null) openers.current.delete(button);
      else openers.current.set(button, element);
    },
  };

  if (read.status === 'error') {
    return (
      <Notice
        role="alert"
        actions={
          <Button variant="primary" onClick={storage.platform.reload}>
            {copy.reload}
          </Button>
        }
      >
        <p>{copy.readFailed}</p>
      </Notice>
    );
  }
  const ctx: InventoryContext = {
    storage,
    today: localDateOf(now, zone),
    zone,
    catalogue,
    closed,
  };
  return (
    <>
      {closed ? (
        <Notice
          role="status"
          actions={
            <Button variant="primary" onClick={storage.platform.reload}>
              {copy.reload}
            </Button>
          }
        >
          <p>{copy.closed}</p>
        </Notice>
      ) : null}
      <GardenCard
        ctx={ctx}
        rows={rows?.garden ?? null}
        photoIds={photoIds}
        open={open}
        dirty={dirty}
        status={messages.garden.status}
        alert={messages.garden.alert}
        photoPlatform={photoPlatform}
        actions={actions}
        harvestFirstRef={harvestFirst}
      />
      <PantryCard
        ctx={ctx}
        rows={rows?.pantry ?? null}
        open={open}
        status={messages.pantry.status}
        alert={messages.pantry.alert}
        actions={actions}
      />
    </>
  );
}
