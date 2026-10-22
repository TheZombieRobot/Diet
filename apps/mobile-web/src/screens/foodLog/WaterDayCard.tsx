/**
 * Water and electrolytes for a day (item 23 design 1.6; cross-item rulings 12 and 24; T25, T26),
 * and the guide lines Today's Water card shares. The guide is item 21's water guide plus item 27's
 * heat water; item 27's electrolyte lines show under the heat line exactly as it returns them; no
 * guide under plain figures, and the pregnancy line in place of an NRV guide.
 */
import {
  electrolyteToggle,
  fillTemplate,
  type Id,
  PAST_DAY_MARKER_MINUTES,
  parseWaterMl,
  waterForDay,
  type WaterRecord,
  waterRowsOn,
  zonedWallTimeToInstant,
} from '@diet/core';
import { foodLog, today as todayCopy } from '@diet/core/copy/health';
import { Button, Card, Chip, Switch, TextField } from '@diet/ui';
import { type ReactElement, useRef, useState } from 'react';
import { formatLocalTime, formatWaterMl, formatWaterText } from '../../format';
import { TimeField } from './AddFood';
import { type LogContext, timeOf } from './logContext';
import type { WaterGuide } from './useWaterGuide';
import { useLogWrite } from './useLogWrite';

const copy = foodLog.water;

/** The "of 2.6 L" after the figure, or nothing without a guide. */
export function WaterOf({ guide }: { readonly guide: WaterGuide | null }): ReactElement | null {
  if (guide === null || guide.guide === null) return null;
  // A real space before it, so a screen reader or a copy reads "250 mL of 2.1 L" (review).
  return (
    <>
      {' '}
      <span className="ui-stat__of">
        {fillTemplate(copy.of, { guide: formatWaterText(guide.guide.totalMl) })}
      </span>
    </>
  );
}

/** The guide line (nothing logged yet), the heat line with item 27's lines, or the pregnancy line. */
export function WaterGuideNotes({
  guide,
  nothingLogged,
}: {
  readonly guide: WaterGuide | null;
  readonly nothingLogged: boolean;
}): ReactElement | null {
  if (guide === null) return null;
  const shown = guide.guide;
  return (
    <>
      {shown !== null && nothingLogged ? (
        <p className="ui-text-muted" data-testid="water-guide">
          {fillTemplate(copy.guideLine, { guide: formatWaterText(shown.totalMl) })}
        </p>
      ) : null}
      {shown !== null && shown.heatExtraMl > 0 ? (
        <>
          <p className="ui-text-muted">
            {fillTemplate(copy.heatExtra, { extra: formatWaterText(shown.heatExtraMl) })}
          </p>
          {guide.heatLines.map((line) => (
            <p key={line} className="ui-text-muted">
              {line}
            </p>
          ))}
        </>
      ) : null}
      {guide.pregnancyLine ? <p className="ui-text-muted">{copy.guidePregnancy}</p> : null}
    </>
  );
}

export function WaterDayCard({
  ctx,
  rows,
  guide,
}: {
  readonly ctx: LogContext;
  /** The water rows in the UTC cover of the date. */
  readonly rows: readonly WaterRecord[];
  readonly guide: WaterGuide | null;
}): ReactElement {
  const onDate = waterRowsOn(rows, ctx.date, ctx.home);
  const day = waterForDay(onDate, ctx.date, ctx.home);
  const entries = onDate.filter((r) => r.ml > 0);
  const isToday = ctx.date === ctx.today;
  const [amount, setAmount] = useState('250');
  const [amountError, setAmountError] = useState<string | null>(null);
  const [time, setTime] = useState('');
  const [timeError, setTimeError] = useState<string | null>(null);
  const [status, setStatus] = useState('');
  const write = useLogWrite('change');
  const removeRefs = useRef(new Map<Id, HTMLButtonElement | null>());
  const valueRef = useRef<HTMLParagraphElement>(null);
  const figure = formatWaterMl(day.totalMl);

  const add = () => {
    const ml = parseWaterMl(amount);
    setAmountError(ml.ok ? null : copy.errors[ml.problem]);
    const at = timeOf(ctx, time);
    setTimeError(at.ok ? null : at.error);
    if (!ml.ok || !at.ok) return;
    void write
      .run(() =>
        ctx.storage.repos.water.create({
          ml: ml.ml,
          electrolyte: false,
          ...(at.at === undefined ? {} : { at: at.at, timeZone: ctx.deviceZone }),
        }),
      )
      .then((done) => {
        if (done !== null) setStatus(fillTemplate(copy.added, { amount: formatWaterText(ml.ml) }));
      });
  };
  const remove = (row: WaterRecord) => {
    const i = entries.findIndex((e) => e.id === row.id);
    const next = entries[i + 1] ?? entries[i - 1];
    void write
      .run(() => ctx.storage.repos.water.remove(row.id))
      .then((done) => {
        if (done === null) return;
        setStatus(fillTemplate(copy.removed, { amount: formatWaterText(row.ml) }));
        requestAnimationFrame(() => {
          (next === undefined ? valueRef.current : removeRefs.current.get(next.id))?.focus();
        });
      });
  };
  const setElectrolyte = (on: boolean) => {
    const change = electrolyteToggle(onDate, ctx.date, ctx.home, on);
    void write.run(async () => {
      if (change.create)
        await ctx.storage.repos.water.create(
          isToday
            ? { ml: 0, electrolyte: true }
            : {
                ml: 0,
                electrolyte: true,
                at: new Date(
                  zonedWallTimeToInstant(ctx.date, PAST_DAY_MARKER_MINUTES, ctx.deviceZone),
                ).toISOString(),
                timeZone: ctx.deviceZone,
              },
        );
      for (const id of change.remove) await ctx.storage.repos.water.remove(id);
      for (const id of change.clear)
        await ctx.storage.repos.water.update(id, { electrolyte: false });
    });
  };
  return (
    <Card label={copy.label}>
      {day.totalMl === 0 ? (
        <p ref={valueRef} tabIndex={-1} className="ui-stat__value ui-stat__value--empty">
          {isToday ? todayCopy.water.none : copy.noneDay}
        </p>
      ) : (
        <p ref={valueRef} tabIndex={-1} className="ui-stat__value ui-stat__value--large">
          <span>{figure.value}</span> <span className="ui-stat__unit">{figure.unit}</span>
          <WaterOf guide={guide} />
        </p>
      )}
      <WaterGuideNotes guide={guide} nothingLogged={day.totalMl === 0} />
      {entries.length === 0 ? null : (
        <ul className="ui-entry-list">
          {entries.map((row) => {
            const when = formatLocalTime(row.at, row.timeZone);
            const text = formatWaterText(row.ml);
            return (
              <li key={row.id}>
                <span className="ui-entry-list__time">{when}</span>
                <span className="ui-entry-list__name ui-entry-list__name--amount">{text}</span>
                {row.electrolyte ? <Chip tone="neutral">{copy.entryElectrolytes}</Chip> : null}
                <Button
                  ref={(el) => {
                    removeRefs.current.set(row.id, el);
                  }}
                  variant="quiet"
                  disabled={!ctx.writable}
                  aria-disabled={write.busy}
                  aria-label={fillTemplate(copy.removeLabel, { amount: text, time: when })}
                  onClick={() => {
                    remove(row);
                  }}
                >
                  {copy.remove}
                </Button>
              </li>
            );
          })}
        </ul>
      )}
      <form
        noValidate
        className="ui-stack"
        onSubmit={(event) => {
          event.preventDefault();
          add();
        }}
      >
        <TextField
          label={copy.amount}
          hint={copy.amountHint}
          inputMode="numeric"
          autoComplete="off"
          value={amount}
          error={amountError ?? undefined}
          onChange={(e) => {
            setAmount(e.currentTarget.value);
          }}
        />
        <TimeField
          ctx={ctx}
          label={copy.time}
          hint={isToday ? null : copy.timeHintPast}
          value={time}
          onChange={setTime}
          error={timeError}
        />
        <Button type="submit" variant="tint" disabled={!ctx.writable} aria-disabled={write.busy}>
          {copy.add}
        </Button>
      </form>
      <Switch
        label={isToday ? todayCopy.water.electrolytes : copy.electrolytesDay}
        checked={day.electrolyte}
        disabled={!ctx.writable}
        busy={write.busy}
        onChange={setElectrolyte}
      />
      <p role="status" className="ui-text-muted ui-status-line">
        {status}
      </p>
      {write.error === null ? null : (
        <p role="alert" className="ui-field__error">
          {write.error}
        </p>
      )}
    </Card>
  );
}
