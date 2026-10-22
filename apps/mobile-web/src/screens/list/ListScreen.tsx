/**
 * The List tab (UX_SCREENS 6a; checklist item 24; design section 1): the store header, the build
 * panel, the to-buy lines by aisle, Already have, and item 31's Send and export. Everything is
 * written to and read from the phone, so the screen works the same offline (HS-14). Prices are
 * shown only when the owner typed them, with their date (HS-16, NN-05); no stock level or cart
 * state exists to show. No readiness gate touches the list (J21): nothing on it is a health
 * feature, and a closed gate must not hide food the plan needs.
 */
import {
  calendarDateText,
  daysBetween,
  fillTemplate,
  type GroceryItem,
  type GroceryListRecord,
  type Id,
  localDateOf,
  type LocalDate,
  type ProfileRecord,
  readyGardenIngredientIds,
} from '@diet/core';
import { foods as foodsCopy, grocery, privacy } from '@diet/core/copy/health';
import {
  aisleGroups,
  displayName,
  labelReminderShown,
  type ListFoods,
  manualSubstituteHint,
  MAX_LIST_ITEMS,
  previousListAt,
} from '@diet/grocery';
import { Button, ButtonRow, Card, Notice } from '@diet/ui';
import { type ReactElement, useEffect, useRef, useState } from 'react';
import { type AppStorage, appStorageStore } from '../../db/runtime';
import { useFoodData } from '../../foods/FoodDataContext';
import { useFoods } from '../../foods/useFoods';
import { routeHref } from '../../routes';
import { useStore } from '../../store';
import { useNow } from '../../useNow';
import { BuildPanel } from './BuildPanel';
import type { BuildMode } from './buildList';
import { addListLine } from './lineActions';
import { AisleCard, AlreadyHaveSection, type RowContext } from './ListLine';
import { ManualLineForm } from './ManualLineForm';
import { SendAndExport } from './SendAndExport';
import { listSessionStore } from './session';
import { useListScreen } from './useListScreen';
import { listWriteMessage, type ListMessage } from './writeErrors';

const copy = grocery;
/** A list made more than this many days ago offers "Start a new list" first (J27). */
const OLD_LIST_DAYS = 3;

type Panel =
  | { readonly kind: 'build'; readonly mode: BuildMode; readonly listId: Id | null }
  | { readonly kind: 'manual' };

/** The button that opened a panel, where Cancel returns focus (design 1.13). */
type Opener = 'fromPlan' | 'startNew' | 'add' | 'update';
const openerOf = (panel: Panel): Opener =>
  panel.kind === 'manual'
    ? 'add'
    : panel.mode === 'update'
      ? 'update'
      : panel.listId === null
        ? 'fromPlan'
        : 'startNew';

function ListHeader({
  storeName,
  list,
  today,
  zone,
}: {
  readonly storeName: string;
  readonly list: GroceryListRecord | null;
  readonly today: LocalDate;
  readonly zone: string;
}): ReactElement {
  const toBuy = list?.items.filter((line) => line.section === 'to-buy') ?? [];
  const ticked = toBuy.filter((line) => line.ticked).length;
  return (
    <Card
      label={copy.header.label}
      aside={
        <a className="ui-link-button" href={routeHref('store')} aria-label={copy.header.changeName}>
          {copy.header.change}
        </a>
      }
    >
      <p className="ui-store-name">{storeName}</p>
      {list === null ? null : (
        <p className="ui-text-muted">
          {fillTemplate(copy.header.madeOn, {
            date: calendarDateText(localDateOf(list.createdAt, zone), today),
          })}
        </p>
      )}
      <p className="ui-text-muted">{copy.header.prices}</p>
      {list === null ? null : toBuy.length === 0 ? (
        <p className="ui-text-strong">{copy.header.nothingToBuy}</p>
      ) : (
        <>
          <div className="ui-tick-meter" aria-hidden="true">
            <div
              className="ui-tick-meter__fill"
              style={{ width: `${(ticked / toBuy.length) * 100}%` }}
            />
          </div>
          <p className="ui-text-strong">
            {fillTemplate(copy.header.progress, { ticked, total: toBuy.length })}
          </p>
        </>
      )}
    </Card>
  );
}

function ListNotices({
  list,
  profile,
  hintsClearedAt,
}: {
  readonly list: GroceryListRecord;
  readonly profile: ProfileRecord;
  readonly hintsClearedAt: string | null;
}): ReactElement {
  const session = useStore(listSessionStore);
  const skipped = session !== null && session.listId === list.id ? session.count : 0;
  return (
    <>
      {skipped === 0 ? null : (
        <Notice
          tone="amber"
          actions={
            <Button
              variant="quiet"
              onClick={() => {
                listSessionStore.set(null);
              }}
            >
              {copy.build.dismiss}
            </Button>
          }
        >
          <p>
            {skipped === 1
              ? copy.build.skippedOne
              : fillTemplate(copy.build.skippedMany, { count: skipped })}
          </p>
        </Notice>
      )}
      {hintsClearedAt !== null && hintsClearedAt === list.updatedAt ? (
        <Notice tone="info">{copy.substitutes.cleared}</Notice>
      ) : null}
      {labelReminderShown(profile, list) ? (
        <Notice tone="info">{foodsCopy.screen.rowCheckLabel}</Notice>
      ) : null}
    </>
  );
}

/** The lines of one section in screen order: to buy by aisle, or Already have. */
const sectionLines = (items: readonly GroceryItem[], section: GroceryItem['section']) =>
  section === 'to-buy'
    ? aisleGroups(items).flatMap((group) => group.lines)
    : items.filter((line) => line.section === 'already-have');

export function ListScreen(): ReactElement {
  const storage = useStore(appStorageStore);
  if (storage === null) return <p className="ui-text-muted">{copy.loading}</p>;
  return <ListWithRecords storage={storage} />;
}

function ListWithRecords({ storage }: { readonly storage: AppStorage }): ReactElement {
  const read = useListScreen(storage);
  const foodsState = useFoods(storage);
  const { approved } = useFoodData();
  const now = useNow(storage.env);
  const zone = storage.env.timeZone();
  const today = localDateOf(now, zone);
  const [panel, setPanel] = useState<Panel | null>(null);
  const [status, setStatus] = useState<ListMessage | null>(null);
  const [announcement, setAnnouncement] = useState('');
  const [openLine, setOpenLine] = useState<Id | null>(null);
  const [starting, setStarting] = useState(false);
  const statusRef = useRef<HTMLParagraphElement>(null);
  const options = useRef(new Map<Id, HTMLButtonElement>());
  const openers = useRef(new Map<Opener, HTMLButtonElement>());
  const pendingFocus = useRef<
    | { readonly kind: 'status' }
    | { readonly kind: 'row'; readonly id: Id }
    | { readonly kind: 'opener'; readonly opener: Opener }
    | {
        readonly kind: 'leave';
        readonly id: Id;
        readonly section: GroceryItem['section'];
        readonly index: number;
        /** The list's version when the row left: focus moves once the stored list has changed. */
        readonly version: number;
      }
    | null
  >(null);

  const value = read.status === 'ready' ? read.value : null;
  const list = value?.list ?? null;

  // Another tab made a new list while an update panel was open (design 1.5).
  if (panel?.kind === 'build' && panel.mode === 'update' && list?.id !== panel.listId) {
    setPanel(null);
    setStatus({ text: copy.build.replaced, tone: 'status' });
  }
  // A line removed elsewhere takes its open panel with it (design 1.9).
  if (openLine !== null && list !== null && !list.items.some((line) => line.id === openLine)) {
    setOpenLine(null);
    setAnnouncement(copy.panel.gone);
  }

  useEffect(() => {
    const target = pendingFocus.current;
    if (target === null) return;
    if (target.kind === 'status') {
      pendingFocus.current = null;
      statusRef.current?.focus();
      return;
    }
    if (target.kind === 'row') {
      // A new row's button arrives with a later read.
      const element = options.current.get(target.id);
      if (element === undefined) return;
      pendingFocus.current = null;
      element.focus();
      return;
    }
    if (target.kind === 'opener') {
      pendingFocus.current = null;
      (openers.current.get(target.opener) ?? statusRef.current)?.focus();
      return;
    }
    if (list === null || list.version === target.version) return;
    pendingFocus.current = null;
    const items = list.items;
    const same = items.find((line) => line.id === target.id && line.section === target.section);
    const lines = sectionLines(items, target.section);
    const next = same ?? lines[target.index] ?? lines[target.index - 1];
    const element = next === undefined ? statusRef.current : options.current.get(next.id);
    element?.focus();
    // Also after a change that leaves the records as they were (a failure, a closed panel).
  }, [read, list, status, openLine, announcement, panel]);

  if (read.status === 'pending') return <p className="ui-text-muted">{copy.loading}</p>;
  if (read.status === 'error' || value === null) {
    return (
      <Notice
        tone="amber"
        role="alert"
        actions={
          <Button variant="secondary" onClick={storage.platform.reload}>
            {copy.reload}
          </Button>
        }
      >
        <p>{copy.readFailed}</p>
      </Notice>
    );
  }

  const { profile, stock, hintsClearedAt } = value;
  const foods: ListFoods | null =
    foodsState.status === 'ready'
      ? {
          resolve: foodsState.resolve,
          seedById: foodsState.data.seedById,
          approved,
          data: foodsState.data,
        }
      : null;
  const showStatus = (message: ListMessage) => {
    setStatus(message);
    pendingFocus.current = { kind: 'status' };
  };

  const startEmpty = async () => {
    setStarting(true);
    try {
      await storage.repos.groceryBuild.create(
        { storeName: profile.storeName, items: [] },
        [],
        list === null ? null : { id: list.id, version: list.version },
      );
      showStatus({ text: copy.empty.started, tone: 'status' });
    } catch (error) {
      showStatus(listWriteMessage(error, 'build'));
    }
    setStarting(false);
  };

  const ctx: RowContext = {
    storage,
    listId: list?.id ?? '',
    foods,
    foodsState,
    profile,
    stock: stock.lines,
    stockCtx: { now, today, timeZone: zone, previousListAt: previousListAt(list) },
    today,
    openLine,
    setOpenLine: (id) => {
      if (id === null && openLine !== null) pendingFocus.current = { kind: 'row', id: openLine };
      setOpenLine(id);
    },
    announce: setAnnouncement,
    optionsRef: (id, element) => {
      if (element === null) options.current.delete(id);
      else options.current.set(id, element);
    },
    leaving: (id) => {
      const items = list?.items ?? [];
      const line = items.find((item) => item.id === id);
      if (line === undefined) return;
      const index = sectionLines(items, line.section).findIndex((l) => l.id === id);
      pendingFocus.current = {
        kind: 'leave',
        id,
        section: line.section,
        index,
        version: list?.version ?? 0,
      };
      if (openLine === id) setOpenLine(null);
    },
  };

  const keepOpener = (key: Opener, element: HTMLButtonElement | null) => {
    if (element === null) openers.current.delete(key);
    else openers.current.set(key, element);
  };
  const cancelPanel = () => {
    if (panel !== null) pendingFocus.current = { kind: 'opener', opener: openerOf(panel) };
    setPanel(null);
  };

  const old =
    list !== null && daysBetween(localDateOf(list.createdAt, zone), today) > OLD_LIST_DAYS;
  const buildPanel =
    panel?.kind === 'build' ? (
      <BuildPanel
        storage={storage}
        foods={foods}
        foodsStatus={foodsState.status}
        mode={panel.mode}
        current={list}
        today={today}
        onCancel={cancelPanel}
        onBuilt={(outcome) => {
          setPanel(null);
          listSessionStore.set(
            outcome.skipped > 0 ? { listId: outcome.listId, count: outcome.skipped } : null,
          );
          showStatus({ text: outcome.text, tone: 'status' });
        }}
      />
    ) : null;

  return (
    <>
      <ListHeader
        storeName={list?.storeName ?? profile.storeName}
        list={list}
        today={today}
        zone={zone}
      />
      <p ref={statusRef} className="ui-status-line ui-step-start" role="status" tabIndex={-1}>
        {status?.text ?? ''}
      </p>
      {status?.reload === true ? (
        <Button variant="secondary" onClick={storage.platform.reload}>
          {privacy.backupCard.reload}
        </Button>
      ) : null}
      {list === null ? (
        panel === null ? (
          <Card label={copy.empty.label}>
            <p>{copy.empty.body}</p>
            <ButtonRow stacked>
              <Button
                ref={(element) => {
                  keepOpener('fromPlan', element);
                }}
                variant="primary"
                block
                onClick={() => {
                  setPanel({ kind: 'build', mode: 'new', listId: null });
                }}
              >
                {copy.empty.fromPlan}
              </Button>
              <Button
                variant="secondary"
                block
                disabled={starting}
                onClick={() => void startEmpty()}
              >
                {copy.empty.emptyList}
              </Button>
            </ButtonRow>
          </Card>
        ) : (
          buildPanel
        )
      ) : (
        <>
          {panel === null ? (
            <>
              {old ? (
                <p className="ui-text-muted">
                  {fillTemplate(copy.actions.oldList, {
                    date: calendarDateText(localDateOf(list.createdAt, zone), today),
                  })}
                </p>
              ) : null}
              <ButtonRow>
                {old ? (
                  <Button
                    ref={(element) => {
                      keepOpener('startNew', element);
                    }}
                    variant="primary"
                    onClick={() => {
                      setPanel({ kind: 'build', mode: 'new', listId: list.id });
                    }}
                  >
                    {copy.actions.startNew}
                  </Button>
                ) : null}
                <Button
                  ref={(element) => {
                    keepOpener('add', element);
                  }}
                  variant="tint"
                  onClick={() => {
                    setPanel({ kind: 'manual' });
                  }}
                >
                  {copy.actions.add}
                </Button>
                <Button
                  ref={(element) => {
                    keepOpener('update', element);
                  }}
                  variant="secondary"
                  onClick={() => {
                    setPanel({ kind: 'build', mode: 'update', listId: list.id });
                  }}
                >
                  {copy.actions.update}
                </Button>
              </ButtonRow>
            </>
          ) : panel.kind === 'build' ? (
            buildPanel
          ) : (
            <ManualLineForm
              foods={foodsState}
              editing={null}
              onCancel={cancelPanel}
              onSave={async (draft) => {
                if (list.items.length >= MAX_LIST_ITEMS) {
                  return fillTemplate(copy.manual.errors.full, { max: MAX_LIST_ITEMS });
                }
                const id = storage.env.randomId();
                const substituteHint =
                  draft.ingredientId === null || foods === null
                    ? null
                    : manualSubstituteHint(
                        draft.ingredientId,
                        foods,
                        profile,
                        readyGardenIngredientIds(stock, now),
                      );
                const message = await addListLine(
                  storage,
                  list.id,
                  { ...draft, substituteHint },
                  id,
                );
                if (message !== null) return message.text;
                setPanel(null);
                setAnnouncement(fillTemplate(copy.manual.added, { item: displayName(draft.text) }));
                pendingFocus.current = { kind: 'row', id };
                return null;
              }}
            />
          )}
          <ListNotices list={list} profile={profile} hintsClearedAt={hintsClearedAt} />
          {aisleGroups(list.items).map((group) => (
            <AisleCard key={group.aisle} ctx={ctx} aisle={group.aisle} lines={group.lines} />
          ))}
          {list.items.some((line) => line.section === 'already-have') ? (
            <AlreadyHaveSection ctx={ctx} lines={sectionLines(list.items, 'already-have')} />
          ) : null}
          <SendAndExport listId={list.id} />
        </>
      )}
      <p className="ui-visually-hidden" role="status">
        {announcement}
      </p>
    </>
  );
}
