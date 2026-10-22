import {
  fillTemplate,
  isClockTime,
  isLocalDate,
  type LatestWeighIn,
  localWallClockOf,
  parseClockTime,
  parseInstant,
  parseWeightInput,
  roundTo,
  WEIGHT_LIMITS_KG,
  zonedWallTimeToInstant,
} from '@diet/core';
import { weight } from '@diet/core/copy/health';
import { Button, ButtonRow, IconButton, MinusIcon, Notice, PlusIcon, TextField } from '@diet/ui';
import { useRef, useState, type ReactElement, type RefObject } from 'react';
import type { AppStorage } from '../../db/runtime';
import { formatKg, formatLocalDate, formatLocalTime } from '../../format';
import { writeWeighIn } from '../../onboarding/actions';
import { WriteFailure } from './parts';
import type { WeightStatusMessage } from './stores';
import { weightWriteMessage } from './writeErrors';

/** A weigh-in within this long of the last one, and more than BIG_CHANGE_KG from it, asks to confirm (W6). */
const BIG_CHANGE_WINDOW_MS = 7 * 86_400_000;
const BIG_CHANGE_KG = 3;
const STEP_KG = 0.1;

export interface LogWeightPanelProps {
  readonly storage: AppStorage;
  readonly latest: LatestWeighIn | null;
  /** Called with the "Saved …" line after a save. */
  readonly onSaved: (message: string) => void;
  /** Today's panel: closes it without saving (a quiet Cancel). */
  readonly onCancel?: () => void;
  readonly fieldRef?: RefObject<HTMLInputElement | null>;
}

/**
 * Logging a weigh-in with little typing and never a stale one-tap save (item 14 design section
 * 2.6.1, W6): the field starts empty with the last weigh-in as its hint; − and + step 0.1 kg from
 * the field or the last weigh-in; "Same as last time" fills the field but still needs Save. A
 * backdated time is read in the device zone; a time still to come is refused; more than 3 kg from
 * a weigh-in in the week before asks to confirm the number. A save while stored weigh-ins are timed
 * after now says the phone's clock may be wrong (HS-35; DECISIONS 2026-10-22 "a low weigh-in after
 * a clock error"); no stored weigh-in is re-timed.
 */
export function LogWeightPanel({
  storage,
  latest,
  onSaved,
  onCancel,
  fieldRef,
}: LogWeightPanelProps): ReactElement {
  const zone = storage.env.timeZone();
  const ownFieldRef = useRef<HTMLInputElement>(null);
  const field = fieldRef ?? ownFieldRef;
  const [text, setText] = useState('');
  const [note, setNote] = useState('');
  const [when, setWhen] = useState<{ date: string; time: string } | null>(null);
  const [error, setError] = useState<string | undefined>(undefined);
  const [failure, setFailure] = useState<WeightStatusMessage | null>(null);
  const [bigChange, setBigChange] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const typed = parseWeightInput(text);
  const base = typed.ok ? typed.kg : latest?.kg;
  const step = (delta: number) => {
    if (base === undefined) return;
    const next = Math.min(
      WEIGHT_LIMITS_KG.max,
      Math.max(WEIGHT_LIMITS_KG.min, roundTo(base + delta, 1)),
    );
    setText(formatKg(next));
    setError(undefined);
    setBigChange(null);
  };

  const save = async (confirmed: boolean) => {
    setFailure(null);
    const parsed = parseWeightInput(text);
    if (!parsed.ok) {
      setError(
        parsed.reason === 'not-a-number' ? weight.entry.notANumber : weight.entry.outOfRange,
      );
      return;
    }
    const now = storage.env.now();
    let at: string | undefined;
    if (when !== null) {
      const ms = zonedWallTimeToInstant(when.date, parseClockTime(when.time), zone);
      if (ms > parseInstant(now)) {
        setError(weight.entry.future);
        return;
      }
      at = new Date(ms).toISOString();
    }
    const entryMs = parseInstant(at ?? now);
    if (
      !confirmed &&
      latest !== null &&
      Math.abs(entryMs - parseInstant(latest.at)) <= BIG_CHANGE_WINDOW_MS &&
      Math.abs(parsed.kg - latest.kg) > BIG_CHANGE_KG
    ) {
      setBigChange(
        fillTemplate(weight.entry.bigChange, { diff: formatKg(Math.abs(parsed.kg - latest.kg)) }),
      );
      return;
    }
    setSaving(true);
    try {
      await writeWeighIn(storage, () =>
        storage.repos.weights.create({
          kg: parsed.kg,
          source: 'manual',
          note: note.trim() === '' ? null : note,
          ...(at === undefined ? {} : { at }),
        }),
      );
      const clockWrong = await storage.repos.weights.list().then(
        (rows) => rows.some((row) => parseInstant(row.at) > parseInstant(now)),
        () => false,
      );
      setText('');
      setNote('');
      setWhen(null);
      setBigChange(null);
      // Save is now off (the field is empty): focus goes back to the field, not to the page.
      field.current?.focus();
      const saved = fillTemplate(weight.entry.saved, {
        kg: formatKg(parsed.kg),
        time: formatLocalTime(at ?? now, zone),
      });
      onSaved(clockWrong ? `${saved} ${weight.entry.clockWrong}` : saved);
    } catch (failed) {
      setFailure(weightWriteMessage(failed, 'entry'));
    } finally {
      setSaving(false);
    }
  };

  const now = storage.env.now();
  const whenValid = when === null || (isLocalDate(when.date) && isClockTime(when.time));
  return (
    <div className="ui-card__body">
      <TextField
        ref={field}
        label={weight.entry.fieldLabel}
        hint={
          latest === null
            ? undefined
            : fillTemplate(weight.entry.lastHint, {
                kg: formatKg(latest.kg),
                date: formatLocalDate(latest.at, latest.timeZone),
              })
        }
        error={error}
        inputMode="decimal"
        autoComplete="off"
        value={text}
        onChange={(event) => {
          setText(event.currentTarget.value);
          setError(undefined);
          setBigChange(null);
        }}
      />
      <ButtonRow>
        <IconButton
          label={weight.entry.less}
          icon={<MinusIcon />}
          disabled={base === undefined}
          onClick={() => {
            step(-STEP_KG);
          }}
        />
        <IconButton
          label={weight.entry.more}
          icon={<PlusIcon size={22} />}
          disabled={base === undefined}
          onClick={() => {
            step(STEP_KG);
          }}
        />
        {latest === null ? null : (
          <Button
            variant="quiet"
            onClick={() => {
              setText(formatKg(latest.kg));
              setError(undefined);
            }}
          >
            {weight.entry.sameAsLast}
          </Button>
        )}
      </ButtonRow>
      {when === null ? (
        <Button
          variant="quiet"
          onClick={() => {
            const clock = localWallClockOf(now, zone);
            const hh = String(Math.floor(clock.minutes / 60)).padStart(2, '0');
            const mm = String(clock.minutes % 60).padStart(2, '0');
            setWhen({ date: clock.date, time: `${hh}:${mm}` });
          }}
        >
          {weight.entry.changeWhen}
        </Button>
      ) : (
        <>
          <TextField
            label={weight.entry.dateLabel}
            type="date"
            max={localWallClockOf(now, zone).date}
            value={when.date}
            onChange={(event) => {
              setWhen({ ...when, date: event.currentTarget.value });
            }}
          />
          <TextField
            label={weight.entry.timeLabel}
            type="time"
            value={when.time}
            onChange={(event) => {
              setWhen({ ...when, time: event.currentTarget.value });
            }}
          />
        </>
      )}
      <TextField
        label={weight.entry.noteLabel}
        autoComplete="off"
        maxLength={280}
        value={note}
        onChange={(event) => {
          setNote(event.currentTarget.value);
        }}
      />
      {bigChange === null ? null : (
        <Notice role="alert">
          <p>{bigChange}</p>
          <ButtonRow>
            <Button variant="primary" onClick={() => void save(true)}>
              {weight.entry.saveAnyway}
            </Button>
            <Button
              onClick={() => {
                setBigChange(null);
              }}
            >
              {weight.entry.checkAgain}
            </Button>
          </ButtonRow>
        </Notice>
      )}
      <div role="alert" className="ui-status-line">
        {failure === null ? null : <WriteFailure storage={storage} message={failure} />}
      </div>
      <Button
        variant="primary"
        block
        disabled={text.trim() === '' || !whenValid || saving}
        onClick={() => void save(false)}
      >
        {weight.entry.save}
      </Button>
      {onCancel === undefined ? null : (
        <Button variant="quiet" block disabled={saving} onClick={onCancel}>
          {weight.entry.cancel}
        </Button>
      )}
    </div>
  );
}
