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
import { presetMovedStore, reportStatus, stopSignFocusStore } from './stores';
import type { WeightView } from './useWeightView';
import { useFocusWhen } from './weightText';

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
}: {
  storage: AppStorage;
  card: NonNullable<Cards['extensionOffer']>;
  week: number;
  weeks: number;
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
          variant={{ kind: 'extend', week, weeks }}
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
  onPreStartStopSign,
}: {
  storage: AppStorage;
  card: NonNullable<Cards['pendingStart']>;
  today: string;
  onPreStartStopSign: () => void;
}): ReactElement {
  const [checking, setChecking] = useState(false);
  return (
    <Card label={weight.start.pendingLabel}>
      <p>{weight.start.pendingIntro}</p>
      <p>{weight.start.offer}</p>
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
          onPreStartStopSign={onPreStartStopSign}
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
                  reportStatus(weight.start.declined);
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
        reportStatus(weight.steadyExplainer.kept231);
        then?.();
      },
      () => undefined,
    );
}

/** "Kickstart has finished" (WT-08, C55, C61, W17): no percentage, with the 22:2 line and "Use 23:1 instead". */
export function SteadyExplainerCard({
  storage,
  card,
  lowWeight,
  rebound,
}: {
  storage: AppStorage;
  card: NonNullable<Cards['steadyExplainer']>;
  lowWeight: boolean;
  rebound: boolean;
}): ReactElement {
  return (
    <Card label={weight.steadyExplainer.label}>
      <p>{weight.steadyExplainer.deficit}</p>
      {card.carbCeilingG === null ? null : (
        <p>{fillTemplate(weight.steadyExplainer.carbs, { g: card.carbCeilingG })}</p>
      )}
      <p>{lowWeight ? weight.phase.lowWeight : weight.phase.steadyPace}</p>
      {rebound ? <p>{weight.phase.steadyRebound}</p> : null}
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

/** The in-memory notice after the stored 23:1 → 22:2 move, when nothing else explains it (C55, W16). */
export function PresetMovedCard({ storage }: { storage: AppStorage }): ReactElement {
  return (
    <Card label={weight.presetMoved.label}>
      <p>{weight.presetMoved.body}</p>
      <ButtonRow>
        <Button
          onClick={() => {
            keepOneMeal(storage, () => {
              presetMovedStore.set(null);
            });
          }}
        >
          {weight.presetMoved.use231}
        </Button>
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

/** After a "yes" before a start: nothing started, and what to do about it (W31). Stays until OK. */
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
 * offer, the start card (Today only), Kickstart has finished, the eating-window notice, daily
 * changes. A pre-start "yes" keeps its guidance on screen after the start card goes.
 */
export function WeightCards({
  storage,
  view,
  showStartCard,
  preStartStopSign,
  onPreStartStopSign,
}: {
  storage: AppStorage;
  view: WeightView;
  showStartCard: boolean;
  preStartStopSign: boolean;
  onPreStartStopSign: (shown: boolean) => void;
}): ReactElement {
  const { overview } = view;
  const { cards, phase, notes } = overview;
  const presetMoved = useStore(presetMovedStore);
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
        />
      )}
      {preStartStopSign ? (
        <PreStartStopSignCard
          bloodPressure={view.input.gates.bloodPressureSaltWording}
          onClose={() => {
            onPreStartStopSign(false);
          }}
        />
      ) : null}
      {showStartCard && cards.pendingStart !== null && !preStartStopSign ? (
        <PendingStartCard
          storage={storage}
          card={cards.pendingStart}
          today={overview.today}
          onPreStartStopSign={() => {
            onPreStartStopSign(true);
          }}
        />
      ) : null}
      {cards.steadyExplainer === null ? null : (
        <SteadyExplainerCard
          storage={storage}
          card={cards.steadyExplainer}
          lowWeight={overview.lowWeight}
          rebound={notes.includes('steady-rebound')}
        />
      )}
      {presetMoved === null || explained ? null : <PresetMovedCard storage={storage} />}
      {cards.fluctuation ? <FluctuationCard storage={storage} /> : null}
    </>
  );
}
