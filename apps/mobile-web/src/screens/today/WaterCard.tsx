import {
  electrolyteToggle,
  fillTemplate,
  type Id,
  type LocalDate,
  type TimeZone,
  WATER_TAP_ML,
  type WaterDay,
  type WaterRecord,
} from '@diet/core';
import { today as copy } from '@diet/core/copy/health';
import { Button, Card, Switch } from '@diet/ui';
import { type ReactElement, useEffect, useRef, useState } from 'react';
import type { AppStorage } from '../../db/runtime';
import { formatWaterMl, formatWaterText } from '../../format';
import { useTodayWrite } from './useWrite';
import { WriteError } from './WriteError';

const water = copy.water;

/** The last tap made on this screen: added (Undo can remove it), or removed by Undo. */
type LastTap = { readonly kind: 'added' | 'removed'; readonly id: Id } | null;

/**
 * Water and the electrolyte tick (UX_SCREENS section 2, card 4; design section 1.6). Each tap of
 * "Add 250 mL" is one glass; Undo removes only the last tap made here. The status line waits for
 * the stored row, and takes its total from the same render as the figure, so the two always agree
 * (T26). No water target is shown until item 23 wires the water guide (T7). Keyed by the date, so
 * the Undo target is forgotten at midnight.
 */
export function WaterCard({
  storage,
  date,
  homeTimeZone,
  rows,
  day,
}: {
  readonly storage: AppStorage;
  readonly date: LocalDate;
  readonly homeTimeZone: TimeZone;
  readonly rows: readonly WaterRecord[];
  readonly day: WaterDay;
}): ReactElement {
  const write = useTodayWrite();
  const [last, setLast] = useState<LastTap>(null);
  const addRef = useRef<HTMLButtonElement>(null);
  /** After Undo, focus goes to Add 250 mL once Undo has gone. */
  const focusAdd = useRef(false);
  useEffect(() => {
    const add = addRef.current;
    if (!focusAdd.current || add === null) return;
    focusAdd.current = false;
    add.focus();
  });
  const stored = (id: Id) => rows.some((row) => row.id === id);
  // The switch shows what was asked for while its writes run, then the stored truth: once it
  // matches, or once a read made after the writes finished arrives (another tab may have changed
  // it). A failure puts it back at once.
  const latestRows = useRef(rows);
  useEffect(() => {
    latestRows.current = rows;
  });
  const [requested, setRequested] = useState<{
    readonly on: boolean;
    /** The rows on screen when the writes finished; a newer read is the stored truth. */
    readonly settledRows: readonly WaterRecord[] | null;
  } | null>(null);
  if (
    requested !== null &&
    !write.busy &&
    (day.electrolyte === requested.on ||
      (requested.settledRows !== null && rows !== requested.settledRows))
  ) {
    setRequested(null);
  }

  let status = '';
  if (last?.kind === 'added' && stored(last.id)) {
    status = fillTemplate(water.added, { total: formatWaterText(day.totalMl) });
  } else if (last?.kind === 'removed' && !stored(last.id)) {
    status =
      day.totalMl === 0
        ? water.undoneEmpty
        : fillTemplate(water.undone, { total: formatWaterText(day.totalMl) });
  }
  const canUndo = last?.kind === 'added' && stored(last.id);
  const figure = formatWaterMl(day.totalMl);

  const add = () => {
    void write
      .run(() => storage.repos.water.create({ ml: WATER_TAP_ML, electrolyte: false }))
      .then((done) => {
        if (done !== null) setLast({ kind: 'added', id: done.value.id });
      });
  };
  const undo = (id: Id) => {
    void write
      .run(() => storage.repos.water.remove(id))
      .then((done) => {
        if (done === null) return;
        focusAdd.current = true;
        setLast({ kind: 'removed', id });
      });
  };
  const setElectrolyte = (on: boolean) => {
    const change = electrolyteToggle(rows, date, homeTimeZone, on);
    setRequested({ on, settledRows: null });
    void write
      .run(async () => {
        if (change.create) await storage.repos.water.create({ ml: 0, electrolyte: true });
        for (const id of change.remove) await storage.repos.water.remove(id);
        for (const id of change.clear) await storage.repos.water.update(id, { electrolyte: false });
      })
      .then((done) => {
        if (done === null) setRequested(null);
        else setRequested((r) => (r === null ? null : { ...r, settledRows: latestRows.current }));
      });
  };

  return (
    <Card label={copy.cards.water}>
      {day.totalMl === 0 ? (
        <p className="ui-stat__value ui-stat__value--empty" data-testid="water-total">
          {water.none}
        </p>
      ) : (
        <p className="ui-stat__value ui-stat__value--large" data-testid="water-total">
          <span>{figure.value}</span> <span className="ui-stat__unit">{figure.unit}</span>
        </p>
      )}
      <Button ref={addRef} variant="tint" block aria-disabled={write.busy} onClick={add}>
        {water.add}
      </Button>
      <Switch
        label={water.electrolytes}
        checked={requested?.on ?? day.electrolyte}
        // Until the stored truth is back, so a second tap never works from rows already changed.
        busy={write.busy || requested !== null}
        onChange={setElectrolyte}
      />
      <p role="status" className="ui-text-muted ui-status-line">
        {status}
      </p>
      {canUndo ? (
        <Button
          variant="quiet"
          aria-disabled={write.busy}
          onClick={() => {
            undo(last.id);
          }}
        >
          {water.undo}
        </Button>
      ) : null}
      <WriteError write={write} />
    </Card>
  );
}
