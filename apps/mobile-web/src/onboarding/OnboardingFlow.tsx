/**
 * The first-run flow's view state machine (item 13 design section 3.3; E54, E55, E56, E59, E60).
 *
 * - The view starts from the resume step, which comes only from stored records. Welcome lives only
 *   in memory, so a reload before "I understand" shows it again (E3).
 * - Forward moves go through each step's action, which writes before the view moves; Back moves
 *   write nothing. A forward move never passes what the stored records allow.
 * - The view is pulled back only when the records move backwards (another tab, a cleared answer, a
 *   gate change that cleared the schedule) and the view is past where they now allow (E55).
 * - Drafts of the profile, schedule and add-a-crop forms live here in memory, so typing survives
 *   every detour and Back, but not a reload (E28, E60).
 * - In repair mode (setup was finished but answers are missing, RD-08) only the missing questions
 *   are asked, then the summary, whose Continue leaves the flow (E7, E56).
 */
import {
  type FlowStep,
  type FlowViewRank,
  firstMissingQuestion,
  furthestView,
  type GardenCropDraft,
  nextStep,
  type OnboardingStep,
  previousStep,
  type ProfileDraft,
  READINESS_QUESTION_IDS,
  type ReadinessGates,
  type ReadinessQuestionId,
  stepBars,
  stepPosition,
  viewAllowed,
  fillTemplate,
} from '@diet/core';
import { onboarding } from '@diet/core/copy/health';
import { Button } from '@diet/ui';
import { type ReactElement, useEffect, useRef, useState } from 'react';
import type { AppStorage } from '../db/runtime';
import { offlineCopyStore } from '../pwa/offline';
import { parseRoute } from '../routes';
import { UpdateBanner } from '../screens/UpdateBanner';
import { useStore } from '../store';
import type { FlowFrame } from './FlowFrame';
import { EMPTY_CROP, profileDraftFrom, type ScheduleDraft } from './drafts';
import type { OnboardingDerived, OnboardingState } from './state';
import { AboutInFlow } from './steps/AboutInFlow';
import { FinishStep } from './steps/FinishStep';
import { openToday } from './navigation';
import { GardenStep } from './steps/GardenStep';
import { NoticeStep } from './steps/NoticeStep';
import { ProfileStep } from './steps/ProfileStep';
import { QuestionStep } from './steps/QuestionStep';
import { RestoreInFlow } from './steps/RestoreInFlow';
import { ScheduleStep } from './steps/ScheduleStep';
import { SummaryStep } from './steps/SummaryStep';
import { WelcomeStep } from './steps/WelcomeStep';
import { useFlowHistory } from './useFlowHistory';

export type FlowView =
  | { readonly kind: 'welcome' }
  | { readonly kind: 'notice'; readonly whyOpen: boolean }
  | {
      readonly kind: 'question';
      readonly question: ReadinessQuestionId;
      readonly showingYes: boolean;
      readonly returnTo: 'profile' | null;
    }
  | { readonly kind: 'summary' }
  | { readonly kind: 'profile' }
  | { readonly kind: 'schedule' }
  | { readonly kind: 'garden' }
  | { readonly kind: 'finish' }
  | { readonly kind: 'about'; readonly returnTo: FlowView }
  | { readonly kind: 'restore'; readonly returnTo: FlowView };

interface Drafts {
  readonly profile?: ProfileDraft;
  readonly schedule?: ScheduleDraft;
  readonly gardenAdd?: GardenCropDraft;
}

const question = (q: ReadinessQuestionId, returnTo: 'profile' | null = null): FlowView => ({
  kind: 'question',
  question: q,
  showingYes: false,
  returnTo,
});

/** The view a step resumes on (section 3.3, Initial view). */
function initialView(
  step: OnboardingStep,
  derived: OnboardingDerived,
  repairList: readonly ReadinessQuestionId[] | null,
): FlowView {
  if (step === 'alcohol-notice') return { kind: 'welcome' };
  if (repairList !== null) {
    const first = repairList[0];
    return first === undefined ? { kind: 'summary' } : question(first);
  }
  switch (step) {
    case 'readiness': {
      const missing = firstMissingQuestion(derived.input);
      return missing === null ? { kind: 'summary' } : question(missing);
    }
    case 'readiness-summary':
    case 'done':
      return { kind: 'summary' };
    case 'profile':
      return { kind: 'profile' };
    case 'schedule':
      return { kind: 'schedule' };
    case 'garden':
      return { kind: 'garden' };
    case 'finish':
      return { kind: 'finish' };
  }
}

/** The view under a detour, as far as reachability goes. */
function rankOf(view: FlowView): FlowViewRank {
  switch (view.kind) {
    case 'about':
    case 'restore':
      return rankOf(view.returnTo);
    case 'question':
      return { kind: 'question', question: view.question };
    case 'notice':
      return { kind: 'notice' };
    default:
      return { kind: view.kind };
  }
}

const FURTHEST_ORDER = [
  'welcome',
  'notice',
  'question',
  'summary',
  'profile',
  'schedule',
  'garden',
  'finish',
];

/** A number that grows with the furthest view, for "did the records move backwards?". */
function furthestRank(rank: FlowViewRank): number {
  const base = FURTHEST_ORDER.indexOf(rank.kind) * 10;
  return rank.kind === 'question' ? base + READINESS_QUESTION_IDS.indexOf(rank.question) : base;
}

/** The numbered step a view belongs to (E54). */
function flowStepOf(view: FlowView): FlowStep | null {
  switch (view.kind) {
    case 'welcome':
      return 'welcome';
    case 'notice':
      return 'alcohol-notice';
    case 'question':
    case 'summary':
      return 'readiness';
    case 'profile':
    case 'schedule':
    case 'garden':
      return view.kind;
    default:
      return null;
  }
}

/** A key that changes when the view changes (not when a Yes shows its consequence). */
const viewKey = (view: FlowView): string =>
  view.kind === 'question' ? `question:${view.question}` : view.kind;

export interface OnboardingFlowProps {
  readonly storage: AppStorage;
  readonly state: OnboardingState;
  readonly derived: OnboardingDerived;
  /** Repair mode: the questions missing when it began (section 3.1); null in setup. */
  readonly repairList: readonly ReadinessQuestionId[] | null;
  /** Repair mode: the summary's Continue. */
  readonly onRepairDone: () => void;
}

export function OnboardingFlow({
  storage,
  state,
  derived,
  repairList,
  onRepairDone,
}: OnboardingFlowProps): ReactElement {
  const { step, input, gates } = derived;
  const repair = repairList !== null;
  const acknowledged = step !== 'alcohol-notice';
  const [view, setView] = useState<FlowView>(() => {
    const first = initialView(step, derived, repairList);
    return acknowledged && parseRoute(window.location.hash) === 'about'
      ? { kind: 'about', returnTo: first }
      : first;
  });
  const [drafts, setDrafts] = useState<Drafts>({});
  const [lastFurthest, setLastFurthest] = useState(() => furthestRank(furthestView(step, input)));
  const headingRef = useRef<HTMLHeadingElement>(null);
  const offlineCopy = useStore(offlineCopyStore);

  // The records moved backwards and the view is past where they now allow: start again from the
  // resume step (E55). A schedule showing when fasting becomes gated moves on to the garden.
  const furthest = furthestRank(furthestView(step, input));
  if (furthest !== lastFurthest) {
    setLastFurthest(furthest);
    if (!repair && furthest < lastFurthest && !viewAllowed(rankOf(view), step, input)) {
      setView(initialView(step, derived, repairList));
    }
  }
  if (view.kind === 'schedule' && gates.fastingGated) {
    setView({ kind: nextStep('profile', gates) === 'garden' ? 'garden' : 'schedule' });
  }

  // Focus moves to the new view's heading, as the shell does for a new screen.
  const key = viewKey(view);
  const previousKey = useRef(key);
  useEffect(() => {
    if (previousKey.current === key) return;
    previousKey.current = key;
    document.documentElement.scrollTop = 0;
    headingRef.current?.focus({ preventScroll: true });
  }, [key]);

  // "#/about" typed into the address bar, after the notice, opens About inside the flow.
  useEffect(() => {
    if (!acknowledged) return;
    const onHash = () => {
      if (parseRoute(window.location.hash) !== 'about') return;
      setView((current) =>
        current.kind === 'about' ? current : { kind: 'about', returnTo: current },
      );
    };
    window.addEventListener('hashchange', onHash);
    return () => {
      window.removeEventListener('hashchange', onHash);
    };
  }, [acknowledged]);

  const afterQuestion = (q: ReadinessQuestionId, returnTo: 'profile' | null): FlowView => {
    if (returnTo === 'profile') return { kind: 'profile' };
    const list = repairList ?? READINESS_QUESTION_IDS;
    const next = list[list.indexOf(q) + 1];
    return next === undefined ? { kind: 'summary' } : question(next);
  };
  const beforeQuestion = (q: ReadinessQuestionId, returnTo: 'profile' | null): FlowView | null => {
    if (returnTo === 'profile') return { kind: 'profile' };
    const list = repairList ?? READINESS_QUESTION_IDS;
    const previous = list[list.indexOf(q) - 1];
    return previous === undefined ? null : question(previous);
  };
  const afterNotice = (): FlowView => {
    if (repairList !== null) {
      const first = repairList[0];
      return first === undefined ? { kind: 'summary' } : question(first);
    }
    const missing = firstMissingQuestion(input);
    return missing === null ? { kind: 'summary' } : question(missing);
  };
  const lastQuestion = (): FlowView | null => {
    const list = repairList ?? READINESS_QUESTION_IDS;
    const last = list.at(-1);
    return last === undefined ? null : question(last);
  };
  const stepBack = (from: FlowStep): FlowView | null => {
    const previous = previousStep(from, gates);
    return previous === 'schedule' || previous === 'profile' ? { kind: previous } : null;
  };

  /** What the view's Back (or "Back to setup") does; null where there is none. */
  const backOf = (current: FlowView): FlowView | null => {
    switch (current.kind) {
      case 'welcome':
      case 'finish':
        return null;
      case 'notice':
        return { kind: 'welcome' };
      case 'question':
        return beforeQuestion(current.question, current.returnTo);
      case 'summary':
        return lastQuestion();
      case 'profile':
        return { kind: 'summary' };
      case 'schedule':
        return { kind: 'profile' };
      case 'garden':
        return stepBack('garden');
      case 'about':
      case 'restore':
        return current.returnTo;
    }
  };
  const back = backOf(view);
  const goBack =
    back === null
      ? null
      : () => {
          setView(back);
        };
  useFlowHistory(back !== null, () => {
    if (back !== null) setView(back);
  });

  const setDraft = <K extends keyof Drafts>(name: K, value: Drafts[K]) => {
    setDrafts((current) => ({ ...current, [name]: value }));
  };
  const dropDraft = (name: keyof Drafts) => {
    setDrafts((current) => ({ ...current, [name]: undefined }));
  };

  const current = flowStepOf(view);
  const numbered = !repair && current !== null;
  const detour = view.kind === 'about' || view.kind === 'restore';
  const position = numbered
    ? { step: stepPosition(current).index, count: stepPosition(current).count }
    : null;
  const frame: FlowFrame = {
    offlineReady: offlineCopy === 'ready',
    banners: <UpdateBanner />,
    headingRef,
    headerLink:
      acknowledged && !detour ? (
        <Button
          variant="quiet"
          onClick={() => {
            setView({ kind: 'about', returnTo: view });
          }}
        >
          {onboarding.frame.helpLink}
        </Button>
      ) : null,
    stepLabel: position === null ? null : fillTemplate(onboarding.frame.stepOf, position),
    bars: numbered ? stepBars(current, gates, state.settings.profileConfirmedAt !== null) : null,
    footerLink:
      acknowledged && !repair && !detour ? (
        <Button
          variant="quiet"
          onClick={() => {
            setView({ kind: 'restore', returnTo: view });
          }}
        >
          {onboarding.frame.restoreLink}
        </Button>
      ) : null,
  };

  switch (view.kind) {
    case 'welcome':
      return (
        <WelcomeStep
          frame={frame}
          onContinue={() => {
            setView({ kind: 'notice', whyOpen: false });
          }}
        />
      );
    case 'notice':
      return (
        <NoticeStep
          frame={frame}
          storage={storage}
          whyOpen={view.whyOpen}
          onToggleWhy={() => {
            setView({ kind: 'notice', whyOpen: !view.whyOpen });
          }}
          onBack={() => {
            setView({ kind: 'welcome' });
          }}
          onAcknowledged={() => {
            setView(afterNotice());
          }}
        />
      );
    case 'question': {
      const list = repairList ?? READINESS_QUESTION_IDS;
      return (
        <QuestionStep
          key={view.question}
          frame={frame}
          storage={storage}
          question={view.question}
          position={list.indexOf(view.question) + 1}
          count={list.length}
          showIntro={!repair && view.question === 'q1' && view.returnTo === null}
          input={input}
          showingYes={view.showingYes}
          onAnswered={(answer) => {
            if (answer === 'yes') setView({ ...view, showingYes: true });
            else setView(afterQuestion(view.question, view.returnTo));
          }}
          onContinue={() => {
            setView(afterQuestion(view.question, view.returnTo));
          }}
          onBack={goBack}
        />
      );
    }
    case 'summary':
      return (
        <SummaryStep
          frame={frame}
          storage={storage}
          input={input}
          gates={gates}
          birthYear={state.profile.birthYear}
          onContinue={
            repair
              ? onRepairDone
              : () => {
                  setView({ kind: 'profile' });
                }
          }
          onBack={goBack}
        />
      );
    case 'profile':
      return (
        <ProfileStep
          frame={frame}
          storage={storage}
          input={input}
          draft={drafts.profile ?? profileDraftFrom(state, gates, input)}
          onDraftChange={(draft) => {
            setDraft('profile', draft);
          }}
          onSaved={(saved: ReadinessGates) => {
            dropDraft('profile');
            setView(
              nextStep('profile', saved) === 'garden' ? { kind: 'garden' } : { kind: 'schedule' },
            );
          }}
          onBack={() => {
            setView({ kind: 'summary' });
          }}
          onChangeAnswer={(q) => {
            setView(question(q, 'profile'));
          }}
        />
      );
    case 'schedule':
      return (
        <ScheduleStep
          frame={frame}
          storage={storage}
          state={state}
          input={input}
          gates={gates}
          draft={drafts.schedule}
          onDraftChange={(draft) => {
            setDraft('schedule', draft);
          }}
          onSaved={() => {
            dropDraft('schedule');
            setView({ kind: 'garden' });
          }}
          onBack={() => {
            setView({ kind: 'profile' });
          }}
        />
      );
    case 'garden':
      return (
        <GardenStep
          frame={frame}
          storage={storage}
          draft={drafts.gardenAdd ?? EMPTY_CROP}
          onDraftChange={(draft) => {
            setDraft('gardenAdd', draft);
          }}
          onFinished={(completed) => {
            if (completed) openToday();
          }}
          onBack={() => {
            const previous = stepBack('garden');
            if (previous !== null) setView(previous);
          }}
        />
      );
    case 'finish':
      return <FinishStep frame={frame} storage={storage} onDone={openToday} />;
    case 'about':
      return (
        <AboutInFlow
          frame={frame}
          onBack={() => {
            setView(view.returnTo);
          }}
        />
      );
    case 'restore':
      return (
        <RestoreInFlow
          frame={frame}
          storage={storage}
          onBack={() => {
            setView(view.returnTo);
          }}
        />
      );
  }
}
