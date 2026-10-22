/**
 * Whether drinks may be logged (HS-20, C53, RD-01; HEALTH_SAFETY.md sections 1 and 5). The app's
 * repository guard and the Drinks screens use this one rule, so a screen that has not re-rendered
 * since an answer changed cannot write what the repository would refuse.
 */
import type { Instant } from '../storage/primitives';
import type { ReadinessGates } from '../storage/readiness';

/** 'notice-first': the alcohol notice is not acknowledged; 'logging-off': under 18 (item 13). */
export type AlcoholAccess = 'notice-first' | 'logging-off' | 'open';

/** The notice first (C53), whatever the gates say; then item 13's under-18 gate. */
export function alcoholAccess(input: {
  readonly alcoholNoticeAckAt: Instant | null;
  readonly gates: Pick<ReadinessGates, 'alcoholLoggingAvailable'>;
}): AlcoholAccess {
  if (input.alcoholNoticeAckAt === null) return 'notice-first';
  // Compared as unknown: anything but exactly true keeps logging off (C41).
  return (input.gates.alcoholLoggingAvailable as unknown) === true ? 'open' : 'logging-off';
}
