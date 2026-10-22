import { FASTING_PRESETS, fillTemplate, type WeightOverview } from '@diet/core';
import { weight } from '@diet/core/copy/health';
import { Button, ButtonRow, Card, Notice } from '@diet/ui';
import { useEffect, useState, type ReactElement } from 'react';
import type { AppStorage } from '../../db/runtime';
import { formatLocalDay } from '../../format';
import { useStore } from '../../store';
import { EndKickstart } from './EndKickstart';
import { KickstartCheckPanel } from './KickstartCheckPanel';
import { StopSignLines } from './parts';
import {
  acknowledgePreStartStopSign,
  preStartGuidanceShown,
  preStartSeenStore,
  preStartStopSignStore,
} from './preStartCheck';
import { presetMovedStore, reportStatus, stopSignFocusStore } from './stores';
import type { WeightView } from './useWeightView';
import { startOfferText, useFocusWhen } from './weightText';

/** Card buttons swallow their errors: the card simply stays and can be tapped again. */
const quietly = (write: Promise<unknown>): void => {
  write.catch(() => undefined);
};

type Cards = WeightOverview['cards'];

/** The weight check-in card (HS-11, C46): hidden for the day only; there is no other control. */
export function RapidLossCard({
  storage,
  card,
}: {
  storage: AppStorage;
  card: NonNullable<Cards['rapidLoss']>;
}): ReactElement {
  return (
    <Card label={weight.rapidLoss.label}>
      <p>{weight.rapidLoss.body}</p>
      <p>
        {fillTemplate(weight.rapidLoss.detail, {
          threshold: String(card.thresholdKgPerWeek),
          weeks: card.weeks,
        })}
      </p>
      <p className="ui-text-muted">{weight.rapidLoss.returns}</p>
      <ButtonRow>
        <Button
          variant="quiet"
          onClick={() => {
            quietly(storage.repos.cardState.dismiss('rapid-loss', 'steady'));
          }}
        >
          {weight.rapidLoss.hideToday}
        </Button>
      </ButtonRow>
    </Card>
  );
}

/**
 * The Kickstart stop-sign card (HS-27, W22): every Kickstart day, hideable for the day; after a
 * stop-sign answer forced and expanded through that Kickstart's last day, with End Kickstart now as
 * the main button while it runs. It never ends Kickstart by itself.
 */
export function StopSignsCard({
  storage,
  card,
}: {
  storage: AppStorage;
  card: NonNullable<Cards['stopSigns']>;
}): ReactElement {
  const focusRequested = useStore(stopSignFocusStore);
  const focus = useFocusWhen<HTMLParagraphElement>(card.expanded && focusRequested);
  useEffect(() => {
    if (card.expanded && focusRequested) stopSignFocusStore.set(false);
  }, [card.expanded, focusRequested]);
  return (
    <Card label={weight.stopSigns.label}>
      {card.expanded ? (
        <Notice>
          <p ref={focus} tabIndex={-1} className="ui-step-start">
            {card.running ? weight.stopSigns.afterCheckRunning : weight.stopSigns.afterCheckEnded}
          </p>
        </Notice>
      ) : null}
      <p>{weight.stopSigns.intro}</p>
      <StopSignLines bloodPressure={card.bloodPressureWording} />
      {card.forced ? (
        card.running ? (
          <EndKickstart storage={storage} primary />
        ) : null
      ) : (
        <ButtonRow>
          <Button
            variant="quiet"
            onClick={() => {
              quietly(storage.repos.cardState.dismiss('kickstart-stop-signs', card.trigger));
            }}
          >
            {weight.stopSigns.hideToday}
          </Button>
        </ButtonRow>
      )}
    </Card>
  );
}

/** The extension offer (C59, C08, W10, W30): the check panel replaces its buttons. */
export function ExtensionOfferCard({
  storage,
  card,
  week,
  weeks,
  today,
}: {
  storage: AppStorage;
  card: NonNullable<Cards['extensionOffer']>;
  week: number;
  weeks: number;
  today: string;
}): ReactElement {
  const [checking, setChecking] = useState(false);
  return (
    <Card label={weight.extension.label}>
      <p>{fillTemplate(weight.extension.offer, { date: formatLocalDay(card.scheduledLastDay) })}</p>
      <p className="ui-text-muted">
        {fillTemplate(weight.phase.extensionsUsed, { used: card.extensionsUsed })}
      </p>
      {card.rapidLine ? <p>{weight.rapidLoss.body}</p> : null}
      {checking ? (
        <KickstartCheckPanel
          storage={storage}
          variant={{ kind: 'extend', week, weeks, today }}
          onCancel={() => {
            setChecking(false);
          }}
          onPreStartStopSign={() => undefined}
        />
      ) : (
        <ButtonRow>
          <Button
            variant="primary"
            onClick={() => {
              setChecking(true);
            }}
          >
            {weight.extension.extend}
          </Button>
          <Button
            variant="quiet"
            onClick={() => {
              quietly(storage.repos.cardState.dismiss('kickstart-extension', card.trigger));
            }}
          >
            {weight.extension.notNow}
          </Button>
        </ButtonRow>
      )}
    </Card>
  );
}

/** Today's "Start Kickstart today" card for someone who chose Kickstart during setup (W14). */
export function PendingStartCard({
  storage,
  card,
  today,
  offer,
}: {
  storage: AppStorage;
  card: NonNullable<Cards['pendingStart']>;
  today: string;
  /** The offer, true to what a start would plan (startOfferText; F35). */
  offer: string;
}): ReactElement {
  const [checking, setChecking] = useState(false);
  return (
    <Card label={weight.start.pendingLabel}>
      <p>{weight.start.pendingIntro}</p>
      <p>{offer}</p>
      {card.windowLines ? (
        <>
          <p>{weight.start.pendingWindow}</p>
          <p>{weight.start.offerWindow}</p>
        </>
      ) : null}
      {checking ? (
        <KickstartCheckPanel
          storage={storage}
          variant={{ kind: 'start', today }}
          onCancel={() => {
            setChecking(false);
          }}
          // The guidance card takes over (preStartCheck.ts).
          onPreStartStopSign={() => undefined}
        />
      ) : (
        <ButtonRow>
          <Button
            variant="primary"
            onClick={() => {
              setChecking(true);
            }}
          >
            {weight.start.pendingAction}
          </Button>
          <Button
            variant="quiet"
            onClick={() => {
              storage.repos.profile.update({ kickstartOptIn: false }).then(
                () => {
                  reportStatus(weight.start.declined, true);
                },
                () => undefined,
              );
            }}
          >
            {weight.start.notNow}
          </Button>
        </ButtonRow>
      )}
    </Card>
  );
}

/** "Use 23:1 instead": the owner's own choice, kept as theirs (C55). */
function keepOneMeal(storage: AppStorage, then?: () => void): void {
  const window = FASTING_PRESETS.find((p) => p.id === '23:1')?.window;
  if (window === undefined) return;
  storage.repos.targets
    .update({
      fastingPreset: '23:1',
      eatingWindow: { start: window.start, end: window.end },
      presetChosenBy: 'user',
    })
    .then(
      () => {
        reportStatus(weight.steadyExplainer.kept231, true);
        then?.();
      },
      () => undefined,
    );
}

/** The deficit line that is true now (F4): the stop-sign pause, the smaller Steady deficit, or Steady. */
function explainerDeficit(card: NonNullable<Cards['steadyExplainer']>): string {
  if (card.deficit === 'paused' && card.pausedUntil !== null) {
    return fillTemplate(weight.stopSigns.pausedUntil, { date: formatLocalDay(card.pausedUntil) });
  }
  return card.deficit === 'smaller'
    ? weight.steadyExplainer.deficit
    : weight.steadyExplainer.deficitSteady;
}

/**
 * "Kickstart has finished" (WT-08, C55, C61, W17): no percentage, with the 22:2 line and "Use 23:1
 * instead". The pace and rebound sentences are the phase notes beside it (the Weight card on Today,
 * the Phase card on the Weight screen), so they are not repeated here. A Kickstart a readiness
 * answer, the birth year or the weight ended is "Kickstart has ended", with that reason (F23).
 */
export function SteadyExplainerCard({
  storage,
  card,
}: {
  storage: AppStorage;
  card: NonNullable<Cards['steadyExplainer']>;
}): ReactElement {
  return (
    <Card
      label={
        card.endedBecause === 'readiness'
          ? weight.steadyExplainer.labelEnded
          : weight.steadyExplainer.label
      }
    >
      {card.endedBecause === 'readiness' ? <p>{weight.steadyExplainer.endedReadiness}</p> : null}
      <p>{explainerDeficit(card)}</p>
      {card.carbCeilingG === null ? null : (
        <p>{fillTemplate(weight.steadyExplainer.carbs, { g: card.carbCeilingG })}</p>
      )}
      {card.windowLine ? <p>{weight.steadyExplainer.window}</p> : null}
      <ButtonRow>
        {card.windowLine ? (
          <Button
            onClick={() => {
              keepOneMeal(storage);
            }}
          >
            {weight.steadyExplainer.use231}
          </Button>
        ) : null}
        <Button
          variant="quiet"
          onClick={() => {
            quietly(storage.repos.cardState.done('steady-explainer', card.trigger));
          }}
        >
          {weight.steadyExplainer.ok}
        </Button>
      </ButtonRow>
    </Card>
  );
}

/**
 * The in-memory notice after the stored 23:1 → 22:2 move, when nothing else explains it (C55, W16).
 * While answer 4 is "yes" or unanswered it says why 23:1 is not used (C07). The one-tap 23:1 is
 * there only when the overview allows it (oneTap231: not for answer 4, nor after a stop-sign
 * answer or a readiness end; F5); otherwise the owner chooses a pattern in Settings.
 */
export function PresetMovedCard({
  storage,
  answer4,
  offer231,
}: {
  storage: AppStorage;
  answer4: boolean;
  offer231: boolean;
}): ReactElement {
  return (
    <Card label={weight.presetMoved.label}>
      <p>{answer4 ? weight.presetMoved.answer4 : weight.presetMoved.body}</p>
      <ButtonRow>
        {answer4 || !offer231 ? null : (
          <Button
            onClick={() => {
              keepOneMeal(storage, () => {
                presetMovedStore.set(null);
              });
            }}
          >
            {weight.presetMoved.use231}
          </Button>
        )}
        <Button
          variant="quiet"
          onClick={() => {
            presetMovedStore.set(null);
          }}
        >
          {weight.presetMoved.ok}
        </Button>
      </ButtonRow>
    </Card>
  );
}

/** "About daily changes", once (WT-14, W21). */
export function FluctuationCard({ storage }: { storage: AppStorage }): ReactElement {
  return (
    <Card label={weight.fluctuation.label}>
      <p>{weight.fluctuation.body}</p>
      <ButtonRow>
        <Button
          variant="quiet"
          onClick={() => {
            quietly(storage.repos.cardState.done('weight-fluctuation-explainer', 'once'));
          }}
        >
          {weight.fluctuation.gotIt}
        </Button>
      </ButtonRow>
    </Card>
  );
}

/**
 * After a "yes" before a start: nothing started, and what to do about it (W31). Stays on Today and
 * the Weight screen, through a reload and in every tab, until OK that day (preStartCheck.ts).
 */
export function PreStartStopSignCard({
  bloodPressure,
  onClose,
}: {
  bloodPressure: boolean;
  onClose: () => void;
}): ReactElement {
  const focus = useFocusWhen<HTMLParagraphElement>(true);
  return (
    <Card label={weight.start.pendingLabel}>
      <p ref={focus} tabIndex={-1} className="ui-text-strong ui-step-start">
        {weight.start.stopSign}
      </p>
      <StopSignLines bloodPressure={bloodPressure} />
      <ButtonRow>
        <Button variant="quiet" onClick={onClose}>
          {weight.steadyExplainer.ok}
        </Button>
      </ButtonRow>
    </Card>
  );
}

/**
 * The weight cards, in order (item 14 design section 2.3): weight check-in, stop-signs, extension
 * offer, the guidance after a pre-start "yes", the start card (Today only), Kickstart has finished,
 * the eating-window notice, daily changes.
 */
export function WeightCards({
  storage,
  view,
  showStartCard,
}: {
  storage: AppStorage;
  view: WeightView;
  showStartCard: boolean;
}): ReactElement {
  const { overview } = view;
  const { cards, phase } = overview;
  const presetMoved = useStore(presetMovedStore);
  const preStartHeld = useStore(preStartStopSignStore);
  const preStartSeen = useStore(preStartSeenStore);
  const preStartStopSign = preStartGuidanceShown(
    view.inputs.cardStates,
    { held: preStartHeld, seen: preStartSeen },
    overview.today,
    view.input.now,
  );
  const explained = cards.steadyExplainer?.windowLine === true || cards.pendingStart !== null;
  return (
    <>
      {cards.rapidLoss === null ? null : <RapidLossCard storage={storage} card={cards.rapidLoss} />}
      {cards.stopSigns === null ? null : <StopSignsCard storage={storage} card={cards.stopSigns} />}
      {cards.extensionOffer === null || phase.kind !== 'kickstart' ? null : (
        <ExtensionOfferCard
          key={cards.extensionOffer.trigger}
          storage={storage}
          card={cards.extensionOffer}
          week={phase.week}
          weeks={phase.weeks}
          today={overview.today}
        />
      )}
      {/* While Kickstart runs, a "yes" held for the day forces the stop-sign card instead (V9). */}
      {preStartStopSign && phase.kind !== 'kickstart' ? (
        <PreStartStopSignCard
          bloodPressure={view.input.gates.bloodPressureSaltWording}
          onClose={() => {
            // OK holds in this page even if its record cannot be written.
            void acknowledgePreStartStopSign(storage, overview.today).catch(() => undefined);
          }}
        />
      ) : null}
      {showStartCard && cards.pendingStart !== null && !preStartStopSign ? (
        <PendingStartCard
          storage={storage}
          card={cards.pendingStart}
          today={overview.today}
          offer={startOfferText(view)}
        />
      ) : null}
      {cards.steadyExplainer === null ? null : (
        <SteadyExplainerCard storage={storage} card={cards.steadyExplainer} />
      )}
      {presetMoved === null || explained ? null : (
        <PresetMovedCard
          storage={storage}
          answer4={view.input.gates.pharmacistReminder}
          offer231={overview.kickstart.oneTap231}
        />
      )}
      {cards.fluctuation ? <FluctuationCard storage={storage} /> : null}
    </>
  );
}
