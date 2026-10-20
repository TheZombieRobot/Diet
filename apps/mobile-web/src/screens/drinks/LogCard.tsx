/**
 * Log a drink (UX 5a; item 28 design 2.3, 2.5 and 2.6; AL-01, AL-02, NN-01, A20, A21, A43). A tap on
 * a preset logs one drink now; holding it, or its More button, opens How many and When. Other drink
 * offers the NZ picker serves, whose size and strength are editable and which never carry energy.
 * Every preset button is disabled while a log is written, so a double tap cannot log twice. The
 * status line and every entry show the entry's own totals, never a per-serve figure beside a count,
 * and the fasting note (FS-05) follows a drink that fell in a fast or outside the eating window.
 *
 * The only place a drink is logged (the alcoholStructure scan).
 */
import {
  DEFAULT_HOME_TIME_ZONE,
  DRINK_PICKER_SERVES,
  type BeverageRecord,
  type DrinkLogRecord,
  type DrinkPickerServe,
  drinkingDayOfRow,
  entryFigures,
  fillTemplate,
  localDateOf,
  MAX_SERVE_ML,
  parseOptionalNumber,
  presetSummary,
  PRESET_NAME_MAX,
  resolveZone,
} from '@diet/core';
import { alcohol, fasting, privacy } from '@diet/core/copy/health';
import { Button, ButtonRow, Card, Checkbox, IconButton, MoreIcon, TextField } from '@diet/ui';
import { type PointerEvent, type ReactElement, type ReactNode, useEffect, useState } from 'react';
import type { DrinkInput } from '../../db/repos/drinks';
import type { AppStorage } from '../../db/runtime';
import { formatLocalTime, formatMeasure, formatShortDate, formatStd2 } from '../../format';
import { WriteError } from '../today/WriteError';
import { entryText, figureNotes, presetSummaryText } from './drinksText';
import { EntryEditor } from './EntryEditor';
import { useAlcoholNote } from './fastingNote';
import { useDrinksWrite } from './useDrinksWrite';
import type { DrinksView } from './view';
import { freshWhen, nextSortOrder, readWhen, type WhenDraft, type WhenProblems } from './drinkForm';
import { WhenFields } from './WhenFields';

const a = alcohol.log;

/** A hold this long opens the options; movement beyond 8 px, a scroll or lifting early cancels it. */
const HOLD_MS = 500;
const HOLD_SLOP_PX = 8;

/**
 * A long press that does not misfire on Android: started by the primary button only, cancelled by
 * lifting early (a tap), moving, leaving, a pointer cancel or any scroll; the click that follows a
 * hold is swallowed. One plain object per button, made once, so its listener can be removed.
 */
function makeLongPress() {
  let timer: ReturnType<typeof setTimeout> | null = null;
  let origin: { x: number; y: number } | null = null;
  let held = false;
  const cancel = (): void => {
    if (timer !== null) clearTimeout(timer);
    timer = null;
    origin = null;
    window.removeEventListener('scroll', cancel, { capture: true });
  };
  return {
    cancel,
    start: (event: PointerEvent, onHold: () => void): void => {
      if (event.button !== 0) return;
      cancel();
      // A hold whose finger slid off before lifting left no click behind to swallow.
      held = false;
      origin = { x: event.clientX, y: event.clientY };
      window.addEventListener('scroll', cancel, { capture: true, passive: true });
      timer = setTimeout(() => {
        cancel();
        held = true;
        onHold();
      }, HOLD_MS);
    },
    move: (event: PointerEvent): void => {
      if (origin === null) return;
      if (Math.hypot(event.clientX - origin.x, event.clientY - origin.y) > HOLD_SLOP_PX) cancel();
    },
    /** True once after a hold, for the click it leaves behind. */
    takeHeld: (): boolean => {
      const was = held;
      held = false;
      return was;
    },
  };
}

function PresetRow({
  preset,
  busy,
  moreOpen,
  onTap,
  onMore,
  children,
}: {
  readonly preset: BeverageRecord;
  readonly busy: boolean;
  readonly moreOpen: boolean;
  readonly onTap: () => void;
  readonly onMore: () => void;
  /** The More panel, under this preset's row while it is open. */
  readonly children?: ReactNode;
}): ReactElement {
  const summary = presetSummary(preset);
  const text = presetSummaryText(preset);
  const notes = [
    ...(summary.presetDefault ? [alcohol.presets.presetDefault] : []),
    ...figureNotes(summary),
  ];
  const [press] = useState(makeLongPress);
  useEffect(() => press.cancel, [press]);
  return (
    <li className="ui-preset">
      <div className="ui-preset__row">
        <Button
          className="ui-preset-button"
          disabled={busy}
          onPointerDown={(event) => {
            press.start(event, onMore);
          }}
          onPointerMove={press.move}
          onPointerUp={press.cancel}
          onPointerCancel={press.cancel}
          onPointerLeave={press.cancel}
          onContextMenu={(event) => {
            event.preventDefault();
          }}
          onClick={() => {
            if (!press.takeHeld()) onTap();
          }}
        >
          <span className="ui-preset__name">{preset.name}</span>{' '}
          <span className="ui-preset__summary">{text.slice(preset.name.length).trim()}</span>
        </Button>
        <IconButton
          label={fillTemplate(a.moreFor, { name: preset.name })}
          icon={<MoreIcon />}
          aria-expanded={moreOpen}
          onClick={onMore}
        />
      </div>
      {notes.map((note) => (
        <p key={note} className="ui-text-muted">
          {note}
        </p>
      ))}
      {children}
    </li>
  );
}

/** The More panel: how many, and now or earlier, for one preset. */
function MorePanel({
  storage,
  maxDate,
  busy,
  onAdd,
  onCancel,
}: {
  readonly storage: AppStorage;
  readonly maxDate: string;
  readonly busy: boolean;
  readonly onAdd: (when: { count: number; at: string | undefined }) => void;
  readonly onCancel: () => void;
}): ReactElement {
  const [draft, setDraft] = useState<WhenDraft>(() => freshWhen(maxDate));
  const [problems, setProblems] = useState<WhenProblems>({});
  return (
    <div className="ui-subpanel">
      <WhenFields draft={draft} onChange={setDraft} problems={problems} maxDate={maxDate} />
      <ButtonRow>
        <Button
          variant="primary"
          disabled={busy}
          onClick={() => {
            const read = readWhen(draft, storage.env);
            setProblems(read.ok ? {} : read.problems);
            if (read.ok) onAdd({ count: read.count, at: read.at });
          }}
        >
          {a.add}
        </Button>
        <Button variant="quiet" onClick={onCancel}>
          {a.cancel}
        </Button>
      </ButtonRow>
    </div>
  );
}

/** A size or strength typed into the Other drink form, or why not. */
function measureField(
  text: string,
  min: number,
  max: number,
  problem: string,
): { readonly value: number } | { readonly problem: string } {
  try {
    const value = parseOptionalNumber(text);
    return value === undefined || value < min || value > max ? { problem } : { value };
  } catch {
    return { problem: a.errors.number };
  }
}

/** Other drink: the NZ picker serves, then a form with an editable size and strength (HS section 5). */
function OtherDrinkPanel({
  storage,
  view,
  busy,
  onLog,
  onCancel,
}: {
  readonly storage: AppStorage;
  readonly view: DrinksView;
  readonly busy: boolean;
  readonly onLog: (input: DrinkInput, preset: { readonly name: string } | null) => void;
  readonly onCancel: () => void;
}): ReactElement {
  const [serve, setServe] = useState<DrinkPickerServe | 'other' | null>(null);
  const [volume, setVolume] = useState('');
  const [abv, setAbv] = useState('');
  const [when, setWhen] = useState<WhenDraft>(() => freshWhen(view.noteToday));
  const [asPreset, setAsPreset] = useState(false);
  const [presetName, setPresetName] = useState('');
  const [problems, setProblems] = useState<
    WhenProblems & Partial<Record<'volume' | 'abv' | 'name', string>>
  >({});

  if (serve === null) {
    return (
      <div className="ui-subpanel">
        <p>{a.otherIntro}</p>
        <ul className="ui-action-list">
          {[...DRINK_PICKER_SERVES, 'other' as const].map((s) => {
            const label =
              s === 'other'
                ? a.somethingElse
                : fillTemplate(a.serveButton, {
                    name: s.name,
                    volume: formatMeasure(s.volumeMl),
                    abv: formatMeasure(s.abvPercent),
                  });
            return (
              <li key={s === 'other' ? s : s.id}>
                <Button
                  block
                  onClick={() => {
                    setServe(s);
                    setVolume(s === 'other' ? '' : String(s.volumeMl));
                    setAbv(s === 'other' ? '' : String(s.abvPercent));
                    setPresetName(s === 'other' ? '' : s.name);
                  }}
                >
                  {label}
                </Button>
              </li>
            );
          })}
        </ul>
        <Button variant="quiet" onClick={onCancel}>
          {a.cancel}
        </Button>
      </div>
    );
  }

  const add = (): void => {
    const size = measureField(volume, 1, MAX_SERVE_ML, a.errors.volume);
    const strength = measureField(abv, 0, 100, a.errors.abv);
    const read = readWhen(when, storage.env);
    const name = presetName.trim();
    const found = {
      ...(read.ok ? {} : read.problems),
      ...('problem' in size ? { volume: size.problem } : {}),
      ...('problem' in strength ? { abv: strength.problem } : {}),
      ...(asPreset && (name === '' || name.length > PRESET_NAME_MAX)
        ? { name: alcohol.presets.errors.name }
        : {}),
    };
    setProblems(found);
    if (!read.ok || 'problem' in size || 'problem' in strength || found.name !== undefined) return;
    const unchanged =
      serve !== 'other' && serve.volumeMl === size.value && serve.abvPercent === strength.value;
    onLog(
      {
        beverageId: unchanged ? serve.id : null,
        name: serve === 'other' ? a.otherDrink : serve.name,
        beverage: { volumeMl: size.value, abvPercent: strength.value, label: null },
        count: read.count,
        ...(read.at === undefined ? {} : { at: read.at }),
      },
      asPreset ? { name } : null,
    );
  };

  return (
    <div className="ui-subpanel">
      <div className="ui-field-pair">
        <TextField
          label={a.volumeLabel}
          inputMode="decimal"
          autoComplete="off"
          value={volume}
          error={problems.volume}
          onChange={(event) => {
            setVolume(event.currentTarget.value);
          }}
        />
        <TextField
          label={a.abvLabel}
          inputMode="decimal"
          autoComplete="off"
          value={abv}
          error={problems.abv}
          onChange={(event) => {
            setAbv(event.currentTarget.value);
          }}
        />
      </div>
      <WhenFields draft={when} onChange={setWhen} problems={problems} maxDate={view.noteToday} />
      <p className="ui-text-muted">{a.otherEnergyNote}</p>
      <Checkbox label={a.saveAsPreset} checked={asPreset} onChange={setAsPreset} />
      {asPreset ? (
        <TextField
          label={a.presetNameLabel}
          autoComplete="off"
          value={presetName}
          error={problems.name}
          onChange={(event) => {
            setPresetName(event.currentTarget.value);
          }}
        />
      ) : null}
      <ButtonRow>
        <Button variant="primary" disabled={busy} onClick={add}>
          {a.add}
        </Button>
        <Button variant="quiet" onClick={onCancel}>
          {a.cancel}
        </Button>
      </ButtonRow>
    </div>
  );
}

type LogStatus =
  | { readonly kind: 'added'; readonly row: DrinkLogRecord; readonly note: boolean }
  | { readonly kind: 'undone' };

/** "Added 3 × Zero-sugar premix (3.91 std) at 1:05 pm.", with the date for an earlier day (A43). */
function addedText(row: DrinkLogRecord, view: DrinksView): string {
  const values = {
    count: row.count,
    name: row.name,
    std: formatStd2(entryFigures(row).std),
    time: formatLocalTime(row.at, row.timeZone),
  };
  if (drinkingDayOfRow(row, view.ctx).day === view.today) return fillTemplate(a.added, values);
  const zone = resolveZone(row.timeZone, view.ctx.homeTimeZone, DEFAULT_HOME_TIME_ZONE).timeZone;
  return fillTemplate(a.addedOn, { ...values, date: formatShortDate(localDateOf(row.at, zone)) });
}

export function LogCard({
  storage,
  view,
  onEditPresets,
}: {
  readonly storage: AppStorage;
  readonly view: DrinksView;
  readonly onEditPresets: () => void;
}): ReactElement {
  const { repos } = storage;
  const write = useDrinksWrite();
  const noteFor = useAlcoholNote(storage);
  const [panel, setPanel] = useState<string | null>(null);
  const [status, setStatus] = useState<LogStatus | null>(null);
  const [editing, setEditing] = useState<string | null>(null);

  const log = async (input: DrinkInput): Promise<DrinkLogRecord | null> => {
    const done = await write.run(() => repos.drinks.log(input));
    if (done === null) return null;
    setStatus({ kind: 'added', row: done.value, note: noteFor(done.value) });
    setPanel(null);
    return done.value;
  };
  const fromPreset = (preset: BeverageRecord, count: number, at: string | undefined) =>
    log({
      beverageId: preset.id,
      name: preset.name,
      beverage: { volumeMl: preset.volumeMl, abvPercent: preset.abvPercent, label: preset.label },
      count,
      ...(at === undefined ? {} : { at }),
    });

  return (
    <Card label={a.cardLabel}>
      <p>{a.intro}</p>
      {view.presets.length === 0 ? (
        <p>{a.noPresets}</p>
      ) : (
        <ul className="ui-action-list">
          {view.presets.map((preset) => (
            <PresetRow
              key={preset.id}
              preset={preset}
              busy={write.busy}
              moreOpen={panel === preset.id}
              onTap={() => void fromPreset(preset, 1, undefined)}
              onMore={() => {
                setPanel((open) => (open === preset.id ? null : preset.id));
              }}
            >
              {panel === preset.id ? (
                <MorePanel
                  storage={storage}
                  maxDate={view.noteToday}
                  busy={write.busy}
                  onAdd={({ count, at }) => void fromPreset(preset, count, at)}
                  onCancel={() => {
                    setPanel(null);
                    write.clear();
                  }}
                />
              ) : null}
            </PresetRow>
          ))}
        </ul>
      )}
      {panel === 'other' ? (
        <OtherDrinkPanel
          storage={storage}
          view={view}
          busy={write.busy}
          onLog={(input, preset) => {
            void log(input).then((row) => {
              if (row === null || preset === null) return;
              void write.run(() =>
                repos.beverages.create({
                  name: preset.name,
                  volumeMl: input.beverage.volumeMl,
                  abvPercent: input.beverage.abvPercent,
                  label: null,
                  sortOrder: nextSortOrder([...view.presets, ...view.hiddenPresets]),
                  archived: false,
                }),
              );
            });
          }}
          onCancel={() => {
            setPanel(null);
            write.clear();
          }}
        />
      ) : (
        <Button
          onClick={() => {
            setPanel('other');
          }}
        >
          {a.otherDrink}
        </Button>
      )}
      <div role="status" className="ui-log-status">
        {status === null ? null : status.kind === 'undone' ? (
          <p>{a.undone}</p>
        ) : (
          <>
            <p data-testid="drinks-added">{addedText(status.row, view)}</p>
            {status.note ? <p>{fasting.alcoholNote}</p> : null}
          </>
        )}
      </div>
      {status?.kind === 'added' ? (
        <Button
          variant="quiet"
          disabled={write.busy}
          onClick={() => {
            void write
              .run(() => repos.drinks.remove(status.row.id))
              .then((done) => {
                if (done !== null) setStatus({ kind: 'undone' });
              });
          }}
        >
          {a.undo}
        </Button>
      ) : null}
      <WriteError write={write} />
      <Button variant="quiet" onClick={onEditPresets}>
        {a.editPresets}
      </Button>
      <h3 className="ui-text-strong">{a.loggedToday}</h3>
      {view.todayEntries.length === 0 ? (
        <p className="ui-text-muted">{a.nothingToday}</p>
      ) : (
        <ul className="ui-drinks-entries" data-testid="logged-today">
          {view.todayEntries.map((entry) => (
            <li key={entry.id}>
              <div className="ui-drinks-entry">
                <span>{entryText(entry)}</span>
                <Button
                  variant="quiet"
                  aria-expanded={editing === entry.id}
                  onClick={() => {
                    setEditing((open) => (open === entry.id ? null : entry.id));
                  }}
                >
                  {a.edit}
                </Button>
              </div>
              {figureNotes(entryFigures(entry)).map((note) => (
                <p key={note} className="ui-text-muted">
                  {note}
                </p>
              ))}
              {editing === entry.id ? (
                <EntryEditor
                  storage={storage}
                  entry={entry}
                  maxDate={view.noteToday}
                  onClose={() => {
                    setEditing(null);
                  }}
                />
              ) : null}
            </li>
          ))}
        </ul>
      )}
      {view.todayTotals.zoneFallback ? (
        <p className="ui-text-muted">{privacy.zoneFallback}</p>
      ) : null}
    </Card>
  );
}
