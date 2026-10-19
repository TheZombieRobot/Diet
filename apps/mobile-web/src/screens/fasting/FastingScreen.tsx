import { featureGateOf, reasonStates } from '@diet/core';
import { fasting, privacy } from '@diet/core/copy/health';
import { Card } from '@diet/ui';
import { type ReactElement, useEffect, useRef, useState } from 'react';
import { appStorageStore, type AppStorage } from '../../db/runtime';
import { GateNotice } from '../../onboarding/GateNotice';
import { consequenceText } from '../../onboarding/readinessText';
import { type FastingSublink, fastingSublink, routeHref } from '../../routes';
import { useStore } from '../../store';
import { FastCard, FastingReadError } from './FastCard';
import { FastingErrorBoundary } from './FastingErrorBoundary';
import { FastHistory } from './FastHistory';
import { PatternCard } from './PatternCard';
import { RefluxCard } from './RefluxCard';
import { StopSignsCard } from './StopSigns';
import { type FastingState, useFasting } from './useFasting';

const gated = fasting.gated;

/** One card while the records open (design 3.4). */
function OpeningCard(): ReactElement {
  return (
    <Card label={fasting.card.gatedLabel}>
      <p role="status">{privacy.backupCard.notReady}</p>
    </Card>
  );
}

/** Why fasting is off, with item 13's reasons, and that nothing logged is deleted (RD-06). */
function GatedCard({ state }: { readonly state: FastingState }): ReactElement {
  const { gateView } = state;
  const { stated } = reasonStates(gateView.input, featureGateOf(gateView.gates, 'fasting').reasons);
  return (
    <Card label={fasting.card.gatedLabel}>
      <p className="ui-text-strong">{gated.title}</p>
      <GateNotice feature="fasting" link linkWhen="actionable" />
      {/*
        The prescriber's agreement is confirmed in Settings, Readiness answers (F44; RD-03). The
        answer-3 line follows the gates, so it never says meals keep a deficit another answer
        closes (item 13 review).
      */}
      {stated.includes('diabetes-medication') ? (
        <p>{consequenceText('q3', gateView.input, gateView.gates)}</p>
      ) : null}
      <p className="ui-text-muted">{gated.kept}</p>
    </Card>
  );
}

/** Focuses an element that is not focusable by itself, and brings it into view. */
function focusTarget(element: HTMLElement | null | undefined): boolean {
  if (element === null || element === undefined) return false;
  element.tabIndex = -1;
  element.focus();
  if (typeof element.scrollIntoView === 'function') element.scrollIntoView({ block: 'start' });
  return true;
}

function FastingScreenBody({ storage }: { readonly storage: AppStorage }): ReactElement {
  const read = useFasting(storage);
  const [target, setTarget] = useState<FastingSublink | null>(() =>
    fastingSublink(window.location.hash),
  );
  const [patternOpen, setPatternOpen] = useState(target === 'pattern');
  const refluxRef = useRef<HTMLDivElement>(null);
  const patternRef = useRef<HTMLDivElement>(null);

  // A sub-link (on arrival, or the form's reflux link while here) names a card; the hash goes back
  // to #/fasting at once, so the visit is one history entry and a reload shows the plain screen.
  useEffect(() => {
    const follow = () => {
      const sub = fastingSublink(window.location.hash);
      if (sub === null) return;
      window.history.replaceState(window.history.state, '', routeHref('fasting'));
      setTarget(sub);
      if (sub === 'pattern') setPatternOpen(true);
    };
    follow();
    window.addEventListener('hashchange', follow);
    return () => {
      window.removeEventListener('hashchange', follow);
    };
  }, []);

  // Once the cards are drawn: the Reflux card's heading, or the pattern form's legend.
  useEffect(() => {
    if (read.kind !== 'ready' || target === null) return;
    const done =
      target === 'reflux'
        ? focusTarget(refluxRef.current?.querySelector('h2'))
        : focusTarget(patternRef.current?.querySelector('legend'));
    if (done) setTarget(null);
  }, [read, target, patternOpen]);

  if (read.kind === 'loading') return <OpeningCard />;
  if (read.kind === 'error') return <FastingReadError />;
  const { view } = read;
  const refluxCard = <RefluxCard storage={storage} state={read} containerRef={refluxRef} />;

  if (view.kind === 'gated') {
    if (view.openFast !== null) {
      return (
        <>
          <FastCard storage={storage} state={read} variant="full" />
          <StopSignsCard />
          {refluxCard}
        </>
      );
    }
    // A stated under-18, pregnancy, eating-disorder or low-weight reason leads with the reflux log.
    return view.quiet ? (
      <>
        {refluxCard}
        <GatedCard state={read} />
      </>
    ) : (
      <>
        <GatedCard state={read} />
        {refluxCard}
      </>
    );
  }

  const closePattern = () => {
    setPatternOpen(false);
    focusTarget(patternRef.current?.querySelector('h2'));
  };
  return (
    <>
      <FastCard storage={storage} state={read} variant="full" />
      <StopSignsCard />
      <PatternCard
        storage={storage}
        state={read}
        open={patternOpen}
        onOpen={() => {
          setPatternOpen(true);
        }}
        onClose={closePattern}
        containerRef={patternRef}
      />
      {refluxCard}
      <FastHistory storage={storage} state={read} />
    </>
  );
}

/**
 * The Fasting screen, #/fasting (item 15 design 3.1 and 3.4; UX_SCREENS 2b): the current fast,
 * the stop-signs, the eating pattern, the reflux log and the history. While fasting is switched
 * off by the readiness answers, only the reason and the reflux log show (and an open fast, which
 * can be ended); nothing is deleted. Works the same offline: nothing is fetched.
 */
export function FastingScreen(): ReactElement {
  const storage = useStore(appStorageStore);
  if (storage === null) return <OpeningCard />;
  return (
    <FastingErrorBoundary>
      <FastingScreenBody storage={storage} />
    </FastingErrorBoundary>
  );
}
