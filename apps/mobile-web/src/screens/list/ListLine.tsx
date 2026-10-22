/**
 * The list's rows (item 24 design 1.6 to 1.9): to-buy lines with a tick box, Already have lines
 * with Buy anyway, the one-tap garden and pantry questions worked out from the live stock, and the
 * Options panel (price, edit an own item, remove). Row actions keep the owner's place: a success
 * is announced politely and focus stays at the row, or moves to the next row when the row leaves
 * its section (J42); a failure shows under the row. Allergen chips are worked out here and never
 * stored (J36).
 */
import {
  allergenListText,
  calendarDateText,
  type CountWord,
  fillTemplate,
  type GroceryItem,
  type Id,
  localDateOf,
  type LocalDate,
  type ProfileRecord,
  readyGardenIngredientIds,
  type StockLine,
} from '@diet/core';
import { grocery, privacy, recipes } from '@diet/core/copy/health';
import {
  displayName,
  estimateText,
  lineAmountText,
  lineConflicts,
  lineDetail,
  type ListFoods,
  lineOffers,
  type ManualLineValue,
  manualSubstituteHint,
  type Offer,
  parsePriceInput,
  priceFromInput,
  priceText,
  type StockContext,
} from '@diet/grocery';
import {
  Button,
  ButtonRow,
  Card,
  Chip,
  ChoiceList,
  IconButton,
  LeafIcon,
  MoreIcon,
  Notice,
  TextField,
  TickRow,
} from '@diet/ui';
import { type ReactElement, useId, useState } from 'react';
import type { AppStorage } from '../../db/runtime';
import type { FoodsState } from '../../foods/useFoods';
import {
  buyLineAnyway,
  editListLine,
  priceLine,
  removeListLine,
  takeOffer,
  tickLine,
} from './lineActions';
import { ManualLineForm } from './ManualLineForm';
import type { ListMessage } from './writeErrors';

/** What every row reads, from the screen. */
export interface RowContext {
  readonly storage: AppStorage;
  readonly listId: Id;
  readonly foods: ListFoods | null;
  readonly foodsState: FoodsState;
  readonly profile: ProfileRecord;
  readonly stock: readonly StockLine[];
  readonly stockCtx: StockContext;
  readonly today: LocalDate;
  readonly openLine: Id | null;
  readonly setOpenLine: (id: Id | null) => void;
  readonly announce: (text: string) => void;
  readonly optionsRef: (id: Id, element: HTMLButtonElement | null) => void;
  /** A row's action took it out of its section: move focus to the next row (design 1.13). */
  readonly leaving: (id: Id) => void;
}

const enteredOn = (ctx: RowContext, at: string): string =>
  calendarDateText(localDateOf(at, ctx.stockCtx.timeZone), ctx.today);

function RowError({
  message,
  reload,
}: {
  readonly message: ListMessage;
  readonly reload: () => void;
}): ReactElement {
  return (
    <Notice
      tone="amber"
      role="alert"
      actions={
        message.reload === true ? (
          <Button variant="secondary" onClick={reload}>
            {privacy.backupCard.reload}
          </Button>
        ) : undefined
      }
    >
      <p>{message.text}</p>
    </Notice>
  );
}

function PriceForm({
  ctx,
  line,
  onDone,
}: {
  readonly ctx: RowContext;
  readonly line: GroceryItem;
  readonly onDone: (message: ListMessage | null, announce: string) => void;
}): ReactElement {
  const copy = grocery.price;
  const name = useId();
  const [text, setText] = useState('');
  const [basis, setBasis] = useState<'line' | 'per_kg' | 'each'>('line');
  const [error, setError] = useState<string | undefined>(undefined);
  const [saving, setSaving] = useState(false);
  const save = async (price: Parameters<typeof priceLine>[3], announce: string) => {
    setSaving(true);
    const message = await priceLine(ctx.storage, ctx.listId, line.id, price);
    setSaving(false);
    onDone(message, announce);
  };
  return (
    <>
      {line.price === null ? (
        <p>{copy.none}</p>
      ) : (
        <>
          <p>{priceText(line.price, enteredOn(ctx, line.price.enteredAt))}</p>
          <Button variant="quiet" disabled={saving} onClick={() => void save(null, copy.removed)}>
            {copy.remove}
          </Button>
        </>
      )}
      <TextField
        label={copy.field}
        hint={copy.fieldHint}
        inputMode="decimal"
        autoComplete="off"
        value={text}
        error={error}
        onChange={(event) => {
          setText(event.currentTarget.value);
        }}
      />
      <ChoiceList
        legend={copy.basisLegend}
        name={`${name}-basis`}
        options={(['line', 'per_kg', 'each'] as const).map((b) => ({
          value: b,
          label: copy.basis[b],
        }))}
        value={basis}
        onChange={(value) => {
          setBasis(value as typeof basis);
        }}
      />
      <Button
        variant="primary"
        disabled={saving}
        onClick={() => {
          const parsed = parsePriceInput(text);
          if (!parsed.ok) {
            setError(copy.errors[parsed.problem]);
            return;
          }
          setError(undefined);
          void save(priceFromInput(parsed.cents, basis, ctx.storage.env.now()), copy.saved);
        }}
      >
        {copy.save}
      </Button>
    </>
  );
}

function LinePanel({
  ctx,
  line,
  onClose,
  onMessage,
}: {
  readonly ctx: RowContext;
  readonly line: GroceryItem;
  readonly onClose: () => void;
  readonly onMessage: (message: ListMessage | null) => void;
}): ReactElement {
  const copy = grocery.panel;
  const [mode, setMode] = useState<'panel' | 'edit' | 'remove'>('panel');
  const [removing, setRemoving] = useState(false);
  const item = displayName(line.text);
  if (mode === 'edit') {
    return (
      <ManualLineForm
        foods={ctx.foodsState}
        editing={line}
        onCancel={() => {
          setMode('panel');
        }}
        onSave={async (value) => {
          const full: ManualLineValue = {
            ...value,
            substituteHint:
              value.ingredientId === null || ctx.foods === null
                ? null
                : manualSubstituteHint(
                    value.ingredientId,
                    ctx.foods,
                    ctx.profile,
                    readyGardenIngredientIds(
                      { lines: ctx.stock, notCounted: [] },
                      ctx.stockCtx.now,
                    ),
                  ),
          };
          const message = await editListLine(ctx.storage, ctx.listId, line.id, full);
          if (message === null) {
            ctx.announce(fillTemplate(grocery.offers.updated, { item: displayName(value.text) }));
            onClose();
          }
          return message?.text ?? null;
        }}
      />
    );
  }
  return (
    <div
      className="ui-item-panel"
      onKeyDown={(event) => {
        if (event.key === 'Escape') onClose();
      }}
    >
      <PriceForm
        ctx={ctx}
        line={line}
        onDone={(message, announce) => {
          onMessage(message);
          if (message === null) {
            ctx.announce(announce);
            onClose();
          }
        }}
      />
      {mode === 'remove' ? (
        <>
          <p>{fillTemplate(copy.removeConfirm, { item })}</p>
          {line.origin === 'generated' ? <p className="ui-text-muted">{copy.comesBack}</p> : null}
          <ButtonRow>
            <Button
              variant="caution"
              disabled={removing}
              onClick={() => {
                setRemoving(true);
                void removeListLine(ctx.storage, ctx.listId, line.id).then((message) => {
                  setRemoving(false);
                  onMessage(message);
                  if (message === null) {
                    ctx.announce(fillTemplate(copy.removed, { item }));
                    ctx.leaving(line.id);
                  }
                });
              }}
            >
              {copy.removeYes}
            </Button>
            <Button
              variant="quiet"
              onClick={() => {
                setMode('panel');
              }}
            >
              {copy.removeNo}
            </Button>
          </ButtonRow>
        </>
      ) : (
        <ButtonRow>
          {line.origin === 'manual' ? (
            <Button
              variant="secondary"
              onClick={() => {
                setMode('edit');
              }}
            >
              {copy.edit}
            </Button>
          ) : null}
          <Button
            variant="caution"
            onClick={() => {
              setMode('remove');
            }}
          >
            {copy.remove}
          </Button>
          <Button variant="quiet" onClick={onClose}>
            {copy.close}
          </Button>
        </ButtonRow>
      )}
    </div>
  );
}

/** One row, to buy (with its tick box) or already have (with Buy anyway). */
export function ListLine({
  ctx,
  line,
}: {
  readonly ctx: RowContext;
  readonly line: GroceryItem;
}): ReactElement {
  const [error, setError] = useState<ListMessage | null>(null);
  const [writing, setWriting] = useState<string | null>(null);
  // The box shows the owner's tap at once; the stored list confirms it, or a failure springs it back.
  const [pendingTick, setPendingTick] = useState<boolean | null>(null);
  if (pendingTick !== null && pendingTick === line.ticked && writing !== 'tick')
    setPendingTick(null);
  const promptId = useId();
  const item = displayName(line.text);
  const foods = ctx.foods;
  const view =
    foods === null || line.ingredientId === null ? null : foods.resolve(line.ingredientId);
  const word: CountWord | null =
    line.ingredientId === null
      ? null
      : (foods?.data.seedById.get(line.ingredientId)?.countWord ?? null);
  const toBuy = line.section === 'to-buy';
  const open = ctx.openLine === line.id;

  const run = async (key: string, action: () => Promise<ListMessage | null>, announce: string) => {
    setWriting(key);
    const message = await action();
    setWriting(null);
    setError(message);
    if (message === null) {
      ctx.announce(announce);
      ctx.leaving(line.id);
    }
  };

  const offers: readonly Offer[] =
    foods === null || !toBuy
      ? []
      : lineOffers(
          line,
          ctx.stock.filter((s) => s.ingredientId === line.ingredientId),
          ctx.stockCtx,
          view !== null,
        );
  const conflicts = foods === null ? [] : lineConflicts(line, foods, ctx.profile);
  const detail = lineDetail(line, word);
  const price = line.price;
  const estimate = price === null ? null : estimateText(line, enteredOn(ctx, price.enteredAt));
  const details = [
    detail,
    toBuy && line.origin === 'generated' && line.quantity === null
      ? grocery.line.amountNotWorkedOut
      : null,
    line.substituteHint === null
      ? null
      : fillTemplate(grocery.line.substitute, { name: displayName(line.substituteHint) }),
    price === null ? null : priceText(price, enteredOn(ctx, price.enteredAt)),
    estimate,
  ].filter((d): d is string => d !== null);
  const showLeaf = (line.fromGardenG ?? 0) > 0 || line.gardenAmountUnknown;

  return (
    <TickRow
      name={line.text}
      amount={lineAmountText(line, word)}
      {...(toBuy
        ? {
            checked: pendingTick ?? line.ticked,
            disabled: writing === 'tick',
            onCheckedChange: (ticked: boolean) => {
              setWriting('tick');
              setPendingTick(ticked);
              void tickLine(ctx.storage, ctx.listId, line.id, ticked).then((message) => {
                setWriting(null);
                setError(message);
                if (message !== null) setPendingTick(null);
              });
            },
          }
        : {})}
      struck={toBuy && (pendingTick ?? line.ticked)}
      leaf={showLeaf ? <LeafIcon size={16} /> : undefined}
      details={
        details.length === 0 && conflicts.length === 0 ? undefined : (
          <>
            {details.map((text) => (
              <p key={text} className="ui-tick-row__detail">
                {text}
              </p>
            ))}
            {conflicts.length === 0 ? null : (
              <Chip tone="amber">
                {fillTemplate(recipes.chips.allergenConflict, {
                  allergens: allergenListText(conflicts),
                })}
              </Chip>
            )}
          </>
        )
      }
      offers={
        <>
          {offers.map((offer, i) => (
            <div
              key={`${offer.kind}-${offer.recordId ?? offer.source}`}
              className="ui-tick-row__offer"
            >
              <p id={`${promptId}-${i}`}>{offer.prompt}</p>
              <Button
                variant="tint"
                aria-label={fillTemplate(grocery.offers.actionFor, { action: offer.action, item })}
                aria-describedby={`${promptId}-${i}`}
                disabled={writing !== null}
                onClick={() => {
                  if (foods === null) return;
                  void run(
                    `offer-${i}`,
                    () => takeOffer(ctx.storage, ctx.listId, line.id, offer, foods),
                    fillTemplate(grocery.offers.updated, { item }),
                  );
                }}
              >
                {offer.action}
              </Button>
            </div>
          ))}
          {!toBuy && line.origin === 'generated' && line.quantity !== null ? (
            <div className="ui-tick-row__offer">
              <Button
                variant="tint"
                aria-label={fillTemplate(grocery.offers.actionFor, {
                  action: grocery.offers.buyAnyway,
                  item,
                })}
                disabled={writing !== null}
                onClick={() => {
                  void run(
                    'anyway',
                    () => buyLineAnyway(ctx.storage, ctx.listId, line.id, foods),
                    fillTemplate(grocery.offers.backOnList, { item }),
                  );
                }}
              >
                {grocery.offers.buyAnyway}
              </Button>
            </div>
          ) : null}
        </>
      }
      trailing={
        <IconButton
          ref={(element) => {
            ctx.optionsRef(line.id, element);
          }}
          label={fillTemplate(grocery.line.options, { item: line.text })}
          icon={<MoreIcon />}
          aria-expanded={open}
          onClick={() => {
            ctx.setOpenLine(open ? null : line.id);
          }}
        />
      }
      error={
        error === null ? undefined : (
          <RowError message={error} reload={ctx.storage.platform.reload} />
        )
      }
    >
      {open ? (
        <LinePanel
          ctx={ctx}
          line={line}
          onMessage={setError}
          onClose={() => {
            ctx.setOpenLine(null);
          }}
        />
      ) : null}
    </TickRow>
  );
}

/** The cards of to-buy lines, one per aisle in aisle order (GL-04). */
export function AisleCard({
  ctx,
  aisle,
  lines,
}: {
  readonly ctx: RowContext;
  readonly aisle: string;
  readonly lines: readonly GroceryItem[];
}): ReactElement {
  return (
    <Card label={aisle}>
      <ul className="ui-divider-rows">
        {lines.map((line) => (
          <ListLine key={line.id} ctx={ctx} line={line} />
        ))}
      </ul>
    </Card>
  );
}

export function AlreadyHaveSection({
  ctx,
  lines,
}: {
  readonly ctx: RowContext;
  readonly lines: readonly GroceryItem[];
}): ReactElement {
  return (
    <Card
      dashed
      label={grocery.alreadyHave.label}
      aside={
        <span className="ui-chip">
          {fillTemplate(grocery.alreadyHave.count, { count: lines.length })}
        </span>
      }
    >
      <ul className="ui-divider-rows">
        {lines.map((line) => (
          <ListLine key={line.id} ctx={ctx} line={line} />
        ))}
      </ul>
    </Card>
  );
}
