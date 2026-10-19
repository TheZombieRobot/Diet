/**
 * The first-run steps (UX section 1; storage spec section 4.4; C41, C25, C07, C53; item 13 design
 * section 4.4). Which step resumes is decided only from stored records, so a reload, a deep link
 * or another tab always lands on the step that is not finished; the alcohol notice comes before
 * anything else whatever else is stored (HS-20).
 */
import { type GateInput, readinessGates } from '../readiness/gates';
import { INSTANT_MIN, type Instant } from '../storage/primitives';
import {
  missingReadinessAnswers,
  READINESS_QUESTION_IDS,
  type ReadinessGates,
  type ReadinessInput,
  type ReadinessQuestionId,
} from '../storage/readiness';
import type { ProfileRecord, SettingsRecord } from '../storage/records';

export type OnboardingStep =
  | 'alcohol-notice'
  | 'readiness'
  | 'readiness-summary'
  | 'profile'
  | 'schedule'
  | 'garden'
  | 'finish'
  | 'done';

export type OnboardingProgress = Pick<
  SettingsRecord,
  | 'alcoholNoticeAckAt'
  | 'profileConfirmedAt'
  | 'scheduleConfirmedAt'
  | 'gardenConfirmedAt'
  | 'onboardingCompletedAt'
>;

export type OnboardingProfile = Pick<ProfileRecord, 'sex' | 'heightCm' | 'birthYear'>;

/** The step to resume at (storage spec 4.4 order). First match wins. */
export function onboardingResumeStep(
  progress: OnboardingProgress,
  input: GateInput,
  profile: OnboardingProfile,
): OnboardingStep {
  if (progress.alcoholNoticeAckAt === null) return 'alcohol-notice';
  // Even after setup: an import without answers, or a reworded question (RD-08).
  if (missingReadinessAnswers(input).length > 0) return 'readiness';
  if (progress.onboardingCompletedAt !== null) return 'done';
  if (progress.profileConfirmedAt === null) return 'readiness-summary';
  // Defensive: the form requires all three (C25).
  if (profile.sex === null || profile.heightCm === null || profile.birthYear === null) {
    return 'profile';
  }
  if (!readinessGates(input).fastingGated && progress.scheduleConfirmedAt === null) {
    return 'schedule';
  }
  if (progress.gardenConfirmedAt === null) return 'garden';
  return 'finish';
}

/** The six numbered steps of setup (E54). Readiness and its summary share step 3. */
export const FLOW_STEPS = Object.freeze([
  'welcome',
  'alcohol-notice',
  'readiness',
  'profile',
  'schedule',
  'garden',
] as const);
export type FlowStep = (typeof FLOW_STEPS)[number];

/** "Step n of 6", always of 6, even when the schedule is skipped (E54). */
export function stepPosition(step: FlowStep): { index: number; count: 6 } {
  return { index: FLOW_STEPS.indexOf(step) + 1, count: 6 };
}

/**
 * The progress bars: steps before `current` are done; the schedule is also drawn as done once it
 * is skipped (the profile is confirmed while fasting is gated), so the count never changes.
 */
export function stepBars(
  current: FlowStep,
  gates: ReadinessGates,
  profileConfirmed: boolean,
): readonly ('done' | 'current' | 'todo')[] {
  const at = FLOW_STEPS.indexOf(current);
  return FLOW_STEPS.map((step, i) => {
    if (i === at) return 'current';
    if (i < at) return 'done';
    return step === 'schedule' && gates.fastingGated && profileConfirmed ? 'done' : 'todo';
  });
}

/** The step after `step`; the schedule is left out while fasting is gated (HS-03, C07). */
export function nextStep(step: FlowStep, gates: ReadinessGates): FlowStep | 'done' {
  const at = FLOW_STEPS.indexOf(step);
  const next = FLOW_STEPS[at + 1];
  if (next === undefined) return 'done';
  return next === 'schedule' && gates.fastingGated ? 'garden' : next;
}

/** The step before `step`, likewise skipping the schedule; null before Welcome. */
export function previousStep(step: FlowStep, gates: ReadinessGates): FlowStep | null {
  const at = FLOW_STEPS.indexOf(step);
  const previous = FLOW_STEPS[at - 1];
  if (previous === undefined) return null;
  return previous === 'schedule' && gates.fastingGated ? 'profile' : previous;
}

/** The first question with no current answer, or null when all seven are answered. */
export function firstMissingQuestion(input: ReadinessInput): ReadinessQuestionId | null {
  return missingReadinessAnswers(input)[0] ?? null;
}

/** A view of the flow, as far as reachability goes (section 3.3). */
export type FlowViewRank =
  | { kind: 'welcome' }
  | { kind: 'notice' }
  | { kind: 'question'; question: ReadinessQuestionId }
  | { kind: 'summary' }
  | { kind: 'profile' }
  | { kind: 'schedule' }
  | { kind: 'garden' }
  | { kind: 'finish' };

/** welcome < notice < q1 … q7 < summary < profile < schedule < garden < finish. */
function rank(view: FlowViewRank): number {
  switch (view.kind) {
    case 'welcome':
      return 0;
    case 'notice':
      return 1;
    case 'question':
      return 2 + READINESS_QUESTION_IDS.indexOf(view.question);
    case 'summary':
      return 9;
    case 'profile':
      return 10;
    case 'schedule':
      return 11;
    case 'garden':
      return 12;
    case 'finish':
      return 13;
  }
}

/** The furthest view the person may be on for a resume step (the table in section 3.3; E55). */
export function furthestView(resume: OnboardingStep, input: GateInput): FlowViewRank {
  switch (resume) {
    case 'alcohol-notice':
      return { kind: 'notice' };
    case 'readiness':
      return { kind: 'question', question: firstMissingQuestion(input) ?? 'q7' };
    case 'readiness-summary':
    case 'profile':
      return { kind: 'profile' };
    case 'schedule':
      return { kind: 'schedule' };
    case 'garden':
      return { kind: 'garden' };
    case 'finish':
    case 'done':
      return { kind: 'finish' };
  }
}

/**
 * Whether a view may be shown for the resume step: at or before the furthest view; Welcome and the
 * notice only until the notice is acknowledged; the schedule never while fasting is gated.
 */
export function viewAllowed(view: FlowViewRank, resume: OnboardingStep, input: GateInput): boolean {
  if ((view.kind === 'welcome' || view.kind === 'notice') && resume !== 'alcohol-notice') {
    return false;
  }
  if (view.kind === 'schedule' && readinessGates(input).fastingGated) return false;
  return rank(view) <= rank(furthestView(resume, input));
}

/** True when, with the garden step counted as done, the resume step would be 'finish'. */
export function canCompleteOnboarding(
  progress: OnboardingProgress,
  input: GateInput,
  profile: OnboardingProfile,
): boolean {
  const gardenDone = { ...progress, gardenConfirmedAt: progress.gardenConfirmedAt ?? INSTANT_MIN };
  return onboardingResumeStep(gardenDone, input, profile) === 'finish';
}

/**
 * The profile clocks set when setup completes (C72, C109; E16): firstLowCarbAt once, and the carb
 * ceiling clock in keto mode, each only if empty and only while the keto ceiling is available.
 * Only changed keys are returned, so a retried finish changes nothing the second time.
 */
export function onboardingCompletionPatch(
  profile: Pick<ProfileRecord, 'dietMode' | 'firstLowCarbAt' | 'carbCeilingStartedAt'>,
  gates: ReadinessGates,
  now: Instant,
): Partial<Pick<ProfileRecord, 'firstLowCarbAt' | 'carbCeilingStartedAt'>> {
  const patch: Partial<Pick<ProfileRecord, 'firstLowCarbAt' | 'carbCeilingStartedAt'>> = {};
  if (!gates.ketoCeilingAvailable) return patch;
  if (profile.firstLowCarbAt === null && profile.dietMode !== 'balanced') {
    patch.firstLowCarbAt = now;
  }
  if (profile.carbCeilingStartedAt === null && profile.dietMode === 'keto') {
    patch.carbCeilingStartedAt = now;
  }
  return patch;
}
