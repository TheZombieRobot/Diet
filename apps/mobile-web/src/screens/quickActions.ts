/**
 * The quick actions of Today's "+" (UX_SCREENS section 2; item 16 design section 1.10, T17): one
 * static registry. Each item that builds an action adds its entry here, defined at module load and
 * never removed, so an action owned by another screen does not depend on what is mounted. An
 * action not built yet is shown with "Later" and does nothing; one switched off by a readiness
 * answer is shown with "Off" and item 13's reason, never hidden (T11).
 */
import { featureGateOf, type GatedFeature, type ReadinessGates } from '@diet/core';
import { today } from '@diet/core/copy/health';
import { LeafIcon, MoveIcon } from '@diet/ui';
import { createElement, type ReactElement } from 'react';
import { GARDEN_HARVEST_HREF, planDayHref, routeHref } from '../routes';
import { openWeightEntry } from './weight/entryStore';

/** UX_SCREENS section 2 order. */
export const QUICK_ACTION_ORDER = [
  'log-weight',
  'finish-meal',
  'swap-recipe',
  'complete-workout',
  'add-harvest',
  'add-drink',
  'open-grocery-list',
] as const;
export type QuickActionId = (typeof QUICK_ACTION_ORDER)[number];

/**
 * A built action: a link to the screen that owns it, or an action run in place on Today (item 14's
 * openWeightEntry opens the Weight card's Log weight panel and focuses its field).
 */
export type QuickAction = {
  /** today.quickActions.labels[id]. */
  readonly label: string;
  /** An optional badge, such as item 19's leaf on Add harvest. */
  readonly icon?: ReactElement;
} & ({ readonly href: string } | { readonly run: () => void });

/** Built actions. Item 16 adds Log weight; items 19, 22, 23, 24, 27 and 28 each add their own. */
export const BUILT_QUICK_ACTIONS: Readonly<Partial<Record<QuickActionId, QuickAction>>> = {
  'log-weight': { label: today.quickActions.labels['log-weight'], run: openWeightEntry },
  // Item 22: today's plan, where a meal is changed from suggestions (UX 2). Never gated: the plan is
  // available under every readiness answer.
  'swap-recipe': { label: today.quickActions.labels['swap-recipe'], href: planDayHref('today') },
  // Item 19: the garden screen with its Add harvest panel open. Never gated (G22, G24): no
  // readiness answer hides or changes the garden or pantry.
  'add-harvest': {
    label: today.quickActions.labels['add-harvest'],
    href: GARDEN_HARVEST_HREF,
    icon: createElement(LeafIcon),
  },
  // Item 27: today's session, at its finish if started, else its stop signs and check. The
  // session screen goes through item 26's start gate; the action never writes a row.
  'complete-workout': {
    label: today.quickActions.labels['complete-workout'],
    href: routeHref('move-session'),
    icon: createElement(MoveIcon, { size: 22 }),
  },
  // Item 28: opens the Drinks screen, and never logs a drink by itself (A32). Under 18 its gate
  // below shows it Off with item 13's reason.
  'add-drink': { label: today.quickActions.labels['add-drink'], href: routeHref('drinks') },
  // Item 23: the food log, for today. Never gated.
  'finish-meal': { label: today.quickActions.labels['finish-meal'], href: routeHref('food-log') },
  // Item 24: the List tab. Never gated (J20): a closed gate must not hide food the plan needs.
  'open-grocery-list': {
    label: today.quickActions.labels['open-grocery-list'],
    href: routeHref('list'),
  },
};

/**
 * The readiness gate that switches an action off, built or not; item 13's GateNotice says why.
 * Each later entry that needs one adds it here with its action: 'add-drink' (item 28) keeps
 * 'alcoholLogging'. Item 27: Complete workout is off while readiness answer 6 keeps exercise
 * plans hidden (RD-05). Add harvest has none.
 */
export const QUICK_ACTION_GATES: Readonly<Partial<Record<QuickActionId, GatedFeature>>> = {
  'complete-workout': 'exercisePlans',
  'add-drink': 'alcoholLogging',
};

export type QuickActionState =
  | { readonly kind: 'ready'; readonly action: QuickAction }
  | { readonly kind: 'off'; readonly feature: GatedFeature }
  | { readonly kind: 'later' };

/** Every action in UX order: off when its gate is closed, else ready when built, else later. */
export function quickActionStates(
  gates: ReadinessGates,
): readonly { readonly id: QuickActionId; readonly state: QuickActionState }[] {
  return QUICK_ACTION_ORDER.map((id) => {
    const feature = QUICK_ACTION_GATES[id];
    if (feature !== undefined && !featureGateOf(gates, feature).available) {
      return { id, state: { kind: 'off', feature } };
    }
    const action = BUILT_QUICK_ACTIONS[id];
    return { id, state: action === undefined ? { kind: 'later' } : { kind: 'ready', action } };
  });
}
