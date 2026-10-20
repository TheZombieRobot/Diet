/**
 * Small pieces shared by the weight screens: figures with their unit, the phase notes, the
 * stop-sign lines with the 111 and Healthline rows, the page-level status line, and the four-week
 * chart with its key. All wording comes from health.ts.
 */
import { fillTemplate, type FourWeekChart, type WeightNote } from '@diet/core';
import { helpNumbers, privacy, readiness, weight } from '@diet/core/copy/health';
import { ActionRow, Button, Notice, PhoneIcon, TrendChart } from '@diet/ui';
import { useEffect, useRef, type ReactElement, type ReactNode } from 'react';
import type { AppStorage } from '../../db/runtime';
import { formatKg } from '../../format';
import { routeHref } from '../../routes';
import { useStore } from '../../store';
import { dial } from '../dial';
import { type WeightStatusMessage, weightStatusStore } from './stores';
import { KG_UNIT, NOTE_TEXT } from './weightText';

/** A figure in a stat slot: the number, then its smaller unit. */
export function KgValue({ kg, lead = false }: { kg: number; lead?: boolean }): ReactElement {
  return (
    <span className={lead ? 'ui-stat__value ui-stat__value--lead' : 'ui-stat__value'}>
      {formatKg(kg)} <span className="ui-stat__unit">{KG_UNIT}</span>
    </span>
  );
}

/** A stat: its label above its value, as a group named by the label. */
export function Stat({
  id,
  label,
  children,
}: {
  id: string;
  label: string;
  children: ReactNode;
}): ReactElement {
  return (
    <div className="ui-stat" role="group" aria-labelledby={id}>
      <span id={id} className="ui-stat__label">
        {label}
      </span>
      {children}
    </div>
  );
}

/** A stat slot that holds a short phrase instead of a figure; its sentence goes under the row (W37). */
export function EmptyValue({ children }: { children: string }): ReactElement {
  return <span className="ui-stat__value ui-stat__value--empty">{children}</span>;
}

/** The phase notes in an inset box. */
/** The notes that name a readiness answer (or answer 5's low weight), so they link to the answers. */
const READINESS_NOTES: readonly WeightNote[] = ['gated', 'gated-unanswered', 'low-weight'];

export function PhaseNotes({ notes }: { notes: readonly WeightNote[] }): ReactElement | null {
  if (notes.length === 0) return null;
  return (
    <div className="ui-note">
      {notes.map((note) => (
        <p key={note}>{NOTE_TEXT[note]}</p>
      ))}
      {notes.some((note) => READINESS_NOTES.includes(note)) ? (
        <p>
          {/* Item 13's Settings, Readiness answers screen. */}
          <a className="ui-button ui-button--quiet" href={routeHref('readiness')}>
            {weight.phase.readinessLink}
          </a>
        </p>
      ) : null}
    </div>
  );
}

/** 111 (emergency tone) and Healthline as tap-to-call rows (HS-13). */
export function SafetyRows(): ReactElement {
  const { emergency, healthline } = helpNumbers;
  return (
    <ul className="ui-action-list">
      <li>
        <ActionRow
          tone="emergency"
          href={dial('tel', emergency.number)}
          title={emergency.name}
          detail={emergency.number}
          badge={emergency.number}
        />
      </li>
      <li>
        <ActionRow
          href={dial('tel', healthline.number)}
          title={healthline.name}
          detail={healthline.number}
          badge={<PhoneIcon />}
        />
      </li>
    </ul>
  );
}

/**
 * What to do about a stop-sign (HEALTH_SAFETY section 2): eat, salt and fluids, or the
 * blood-pressure wording when readiness answer 4 is yes or unanswered (C102); 111; the rows.
 */
export function StopSignLines({ bloodPressure }: { bloodPressure: boolean }): ReactElement {
  return (
    <>
      <p>{bloodPressure ? readiness.bloodPressure.stopSign : weight.stopSigns.action}</p>
      <p>{weight.stopSigns.emergency}</p>
      <SafetyRows />
    </>
  );
}

/** A failed write's message (role alert), with Reload when the records are closed in this tab. */
export function WriteFailure({
  storage,
  message,
}: {
  storage: AppStorage;
  message: WeightStatusMessage;
}): ReactElement {
  return (
    <Notice>
      <p>{message.text}</p>
      {message.reload === true ? (
        <Button
          variant="primary"
          onClick={() => {
            storage.platform.reload();
          }}
        >
          {privacy.backupCard.reload}
        </Button>
      ) : null}
    </Notice>
  );
}

/**
 * The weight screens' outcome line (W33): a polite status and an alert, both always present so a
 * message is announced; the last message stays until the next one or until the screen closes. A
 * message whose control has gone (a finished check, a start, an end) takes focus.
 */
export function WeightStatus({ storage }: { storage: AppStorage }): ReactElement {
  const message = useStore(weightStatusStore);
  const statusRef = useRef<HTMLParagraphElement>(null);
  useEffect(
    () => () => {
      weightStatusStore.set(null);
    },
    [],
  );
  useEffect(() => {
    if (message?.focus === true) statusRef.current?.focus();
  }, [message]);
  return (
    <>
      <p ref={statusRef} tabIndex={-1} role="status" className="ui-text-strong ui-status-line">
        {message?.tone === 'status' ? message.text : null}
      </p>
      <div role="alert" className="ui-status-line">
        {message?.tone === 'alert' ? <WriteFailure storage={storage} message={message} /> : null}
      </div>
    </>
  );
}

/** The current four-week block as drawn on Today and in the Trend card, with its key and the trend line. */
export function FourWeekChartView({ chart }: { chart: FourWeekChart }): ReactElement {
  const band = chart.band;
  return (
    <>
      <TrendChart
        days={28}
        points={chart.points.map((p) => ({ index: p.index, value: p.kg }))}
        line={chart.line.map((p) => ({ index: p.index, value: p.kg }))}
        band={
          band === null
            ? null
            : band.map((b) => ({ index: b.index, low: b.fastKg, high: b.slowKg }))
        }
        todayIndex={chart.todayIndex}
        ariaLabel={band === null ? weight.chart.ariaNoBand : weight.chart.ariaWithBand}
        xLabels={chart.weekLabels.map((n) => fillTemplate(weight.chart.week, { n }))}
        legend={
          band === null ? undefined : (
            <span className="ui-trend-chart__key">
              <span className="ui-trend-chart__swatch" aria-hidden="true" />
              {weight.chart.bandLegend}
            </span>
          )
        }
      />
      <p className="ui-text-muted">{weight.chart.trendLine}</p>
    </>
  );
}
