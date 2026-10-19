/**
 * The day's targets (item 21 design section 3.9). Item 14 builds only the keto-run predicate its
 * phase engine needs, so the Weight card and the targets agree on when a Kickstart is broken; item
 * 21 adds dayTargets and its adapter here.
 */
import type { Instant } from '../storage/primitives';
import { parseInstant } from '../util/time';

/**
 * The owner has stayed in keto since the period began: every switch into keto writes
 * carbCeilingStartedAt (C72), and a Kickstart start writes it equal to the period's startedAt, so
 * a later value means keto was left and re-entered. null counts as broken (item 21 T7; DECISIONS
 * C56 row: a mode round trip never resumes a period).
 */
export function ketoUnbrokenSince(
  carbCeilingStartedAt: Instant | null,
  periodStartedAt: Instant,
): boolean {
  return (
    carbCeilingStartedAt !== null &&
    parseInstant(carbCeilingStartedAt) <= parseInstant(periodStartedAt)
  );
}
