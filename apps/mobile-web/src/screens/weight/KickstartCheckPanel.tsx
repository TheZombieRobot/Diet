import { fillTemplate, type YesNo } from '@diet/core';
import { weight } from '@diet/core/copy/health';
import { Button, ButtonRow, ChoiceList } from '@diet/ui';
import { useId, useState, type ReactElement } from 'react';
import type { AppStorage } from '../../db/runtime';
import { startKickstart } from './kickstartActions';
import { recordPreStartStopSign } from './preStartCheck';
import { reportStatus, stopSignFocusStore, weightStatusStore } from './stores';
import { startUnavailableText, useFocusWhen } from './weightText';
import { weightWriteMessage } from './writeErrors';

const QUESTIONS = ['dizzyOnStanding', 'palpitations', 'crampsNotSettling', 'faintAtWork'] as const;
type Question = (typeof QUESTIONS)[number];

const YES_NO = [
  { value: 'yes', label: weight.check.yes },
  { value: 'no', label: weight.check.no },
];
const RATINGS = ['1', '2', '3', '4', '5'].map((value) => ({ value, label: value }));

export type CheckVariant =
  | { readonly kind: 'extend'; readonly week: number; readonly weeks: number }
  | { readonly kind: 'start'; readonly today: string };

export interface KickstartCheckPanelProps {
  readonly storage: AppStorage;
  readonly variant: CheckVariant;
  /** Closes the panel; nothing was recorded. */
  readonly onCancel: () => void;
  /** A "yes" before a start: nothing was written; the caller shows what to do. */
  readonly onPreStartStopSign: () => void;
}

/**
 * "How do you feel?" (HEALTH_SAFETY section 2 stop-signs; C59, W23): the four questions with no
 * answer chosen for the person; the confirm button stays off until all four are answered.
 *
 * Extension: the answers go to the Kickstart repository, which decides the outcome and enforces
 * the window, the stop-sign rule and both caps; this is the only caller of recordCheck. Energy and
 * sleep are optional and decide nothing.
 * Start: any "yes" writes nothing and is held for the rest of the day (W31); four "no" start a
 * Kickstart, which re-checks that a start is still available just before writing.
 * Outcomes go to the page-level status line, so they outlive the card that asked.
 */
export function KickstartCheckPanel({
  storage,
  variant,
  onCancel,
  onPreStartStopSign,
}: KickstartCheckPanelProps): ReactElement {
  const [answers, setAnswers] = useState<Partial<Record<Question, YesNo>>>({});
  const [energy, setEnergy] = useState<string | null>(null);
  const [sleep, setSleep] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const unansweredId = useId();
  const titleRef = useFocusWhen<HTMLParagraphElement>(true);
  const complete = QUESTIONS.every((q) => answers[q] !== undefined);

  const confirm = async () => {
    const four = {
      dizzyOnStanding: answers.dizzyOnStanding ?? 'yes',
      palpitations: answers.palpitations ?? 'yes',
      crampsNotSettling: answers.crampsNotSettling ?? 'yes',
      faintAtWork: answers.faintAtWork ?? 'yes',
    };
    setBusy(true);
    if (variant.kind === 'extend') {
      try {
        const check = await storage.repos.kickstart.recordCheck({
          ...four,
          energyRating: energy === null ? null : Number(energy),
          sleepRating: sleep === null ? null : Number(sleep),
        });
        if (check.outcome === 'extended') {
          reportStatus(
            fillTemplate(weight.extension.extended, {
              week: variant.week,
              weeks: variant.weeks + 1,
            }),
            true,
          );
        } else {
          reportStatus(weight.extension.stopSign);
          stopSignFocusStore.set(true);
        }
      } catch (error) {
        weightStatusStore.set(weightWriteMessage(error, 'extension'));
        setBusy(false);
      }
      return;
    }
    if (QUESTIONS.some((q) => four[q] === 'yes')) {
      recordPreStartStopSign(storage.platform, variant.today);
      onPreStartStopSign();
      return;
    }
    try {
      const result = await startKickstart(storage);
      if (result.ok) {
        reportStatus(
          result.presetSet
            ? `${weight.start.started} ${weight.start.presetSet}`
            : weight.start.started,
          true,
        );
      } else {
        reportStatus(startUnavailableText(result.refusal) ?? weight.start.saveFailed);
        onCancel();
      }
    } catch (error) {
      weightStatusStore.set(weightWriteMessage(error, 'start'));
      setBusy(false);
    }
  };

  return (
    <div className="ui-card__body">
      <p ref={titleRef} tabIndex={-1} className="ui-text-strong ui-step-start">
        {weight.check.title}
      </p>
      <p>{variant.kind === 'extend' ? weight.check.introExtend : weight.check.introStart}</p>
      {QUESTIONS.map((q) => (
        <ChoiceList
          key={q}
          layout="inline"
          legend={weight.check[q]}
          name={`${unansweredId}-${q}`}
          options={YES_NO}
          value={answers[q] ?? null}
          disabled={busy}
          onChange={(value) => {
            setAnswers({ ...answers, [q]: value as YesNo });
          }}
        />
      ))}
      {variant.kind === 'extend' ? (
        <>
          <ChoiceList
            layout="inline"
            legend={weight.check.energyLabel}
            name={`${unansweredId}-energy`}
            hint={weight.check.ratingScale}
            options={RATINGS}
            value={energy}
            disabled={busy}
            onChange={setEnergy}
          />
          <ChoiceList
            layout="inline"
            legend={weight.check.sleepLabel}
            name={`${unansweredId}-sleep`}
            hint={weight.check.ratingScale}
            options={RATINGS}
            value={sleep}
            disabled={busy}
            onChange={setSleep}
          />
        </>
      ) : null}
      {complete ? null : (
        <p id={unansweredId} className="ui-text-muted">
          {weight.check.unanswered}
        </p>
      )}
      <ButtonRow>
        <Button
          variant="primary"
          disabled={!complete || busy}
          aria-describedby={complete ? undefined : unansweredId}
          onClick={() => void confirm()}
        >
          {variant.kind === 'extend' ? weight.check.confirmExtend : weight.check.confirmStart}
        </Button>
        <Button variant="quiet" disabled={busy} onClick={onCancel}>
          {weight.check.cancel}
        </Button>
      </ButtonRow>
    </div>
  );
}
