/**
 * The planner's datasets in tests (item 22 design 6.0): a test file replaces the app's one dataset
 * entry point with
 *   vi.mock('<relative path>/planner/planData', () => plannerDataMock());
 * and steers it with setPlannerData. The synthetic foods and recipes are core's planner fixtures;
 * `loaded: false` is the shipped state (every figure not known) and null is a dataset that failed.
 */
import type { PlanData } from '@diet/core';
import { fixturePlanData } from '@diet/core/planner/testData';

let current: PlanData | null = fixturePlanData();

/** Use the fixture data (loaded unless told otherwise), or null for a dataset error. */
export function setPlannerData(next: { readonly loaded?: boolean } | null): void {
  current = next === null ? null : fixturePlanData(next);
}

export function plannerDataMock(): { readonly planData: () => PlanData | null } {
  return { planData: () => current };
}
