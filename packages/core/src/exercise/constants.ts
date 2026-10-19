/**
 * Exercise limits and the permanent dataset ids (HEALTH_SAFETY.md section 6; DOC_REVIEW C51, C76;
 * item 26 design sections 2.3 and 3.2). validate.ts and dataset.ts both import from here, so
 * neither imports the other.
 */

export const MOVE_LIMITS = Object.freeze({
  /** HS section 6: about 20–35 minutes. */
  sessionSeconds: Object.freeze({ min: 1200, max: 2100 }),
  /** HS section 6: a 5-minute warm-up. */
  warmUpSeconds: 300,
  coolDownSeconds: Object.freeze({ min: 180, max: 300 }),
  /** Length estimate only: 4 seconds a rep and 30 seconds between movements. */
  secondsPerRep: 4,
  transitionSeconds: 30,
  /** EX-05: rest days are scheduled, at least two a week. */
  restDaysMin: 2,
  /** 7 − restDaysMin, checked on the week actually done. */
  activeDaysMax: 5,
  /** HS section 6: two to three strength sessions a week. */
  strengthPerWeek: Object.freeze({ min: 2, max: 3 }),
  jogDaysMax: 2,
  /** C76: at most ×1.1, in integer arithmetic (11 tenths). */
  weeklyIncreaseTenths: 11,
  /** Last week, then one week further back; anything older restarts the movement. */
  historyWeeks: 2,
  /** Top of the range in this many sessions in a row suggests the next version. */
  topSessionsForNextVariant: 2,
  /** UX 4d: jogging unlocks after four tolerated walks. */
  toleratedWalksForJog: 4,
  /** C51: effort and soreness at most 3 of 5. */
  toleratedMaxRating: 3,
  jogIntervalMaxSeconds: 90,
});

/**
 * Ids in dataset version 1. They are permanent: stored sessions, their movements and the weekly
 * plan refer to them (storage spec section 5, soft references). Names, how-to lines, cues and
 * doses may change; an id may never be renamed or removed (the validator's `id` rule).
 */
export const EXERCISE_IDS_V1 = Object.freeze([
  'seed:ex-march',
  'seed:ex-easy-walk',
  'seed:ex-ankle-circles',
  'seed:ex-upper-back-rotation',
  'seed:ex-calf-stretch',
  'seed:ex-hip-flexor-stretch',
  'seed:ex-squat',
  'seed:ex-split-squat',
  'seed:ex-glute-bridge',
  'seed:ex-calf-raise',
  'seed:ex-step-up',
  'seed:ex-hip-hinge',
  'seed:ex-push-up',
  'seed:ex-pike-push-up',
  'seed:ex-row',
  'seed:ex-band-pull-apart',
  'seed:ex-dead-bug',
  'seed:ex-bird-dog',
  'seed:ex-front-plank',
  'seed:ex-side-plank',
  'seed:ex-beach-walk',
  'seed:ex-beach-jog',
] as const);

export const TEMPLATE_IDS_V1 = Object.freeze([
  'seed:session-a',
  'seed:session-b',
  'seed:session-c',
  'seed:session-beach-walk',
  'seed:session-beach-jog',
] as const);
