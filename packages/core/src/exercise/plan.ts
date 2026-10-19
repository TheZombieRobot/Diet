/**
 * Planning a session (item 26 design section 3.11): the one function the Move screens call to
 * build a session from a template after the pre-session check. After any yes, on this check or
 * any other check that day, it produces the lighter session whatever it is asked for (HS-29): the
 * easier version of each movement, one set fewer, at the bottom of the range, with the warm-up and
 * cool-down kept.
 */
import type { Id, SeedId } from '../storage/primitives';
import type { PreCheck, SessionRecord } from '../storage/records';
import type { LocalDate } from '../util/time';
import { exerciseById } from './lookup';
import { anyYes, painAnswered } from './preCheck';
import { type DoseSuggestion, suggestDose, weeklyVolumes } from './progression';
import type {
  Block,
  EquipmentToggles,
  ExerciseData,
  ExerciseUnit,
  SessionTemplate,
  TemplateSlot,
  VariantKey,
} from './types';
import { nextVariantFor, sessionVariants, slotAvailable } from './variants';
import { occurrencesLeft, type ResolvedWeek, resumedRow } from './week';

export interface PlannedMovement {
  readonly block: Block;
  readonly exerciseId: SeedId;
  readonly variant: VariantKey;
  readonly unit: ExerciseUnit;
  readonly perSide: boolean;
  /**
   * Target per set; the number of sets is its length. On a re-plan of a row with ticked sets of
   * this exercise, only the sets still to do.
   */
  readonly perSet: readonly number[];
  readonly restSeconds: number;
  /** null for the warm-up and cool-down. */
  readonly dose: DoseSuggestion | null;
}

export interface PlanContext {
  /** Required: there is no plan without the check. */
  readonly preCheck: PreCheck;
  readonly choice: 'planned' | 'lighter';
  readonly equipment: EquipmentToggles;
  /** Every stored session row. */
  readonly sessions: readonly SessionRecord[];
  readonly week: ResolvedWeek;
  readonly today: LocalDate;
  /**
   * The row being re-planned (a variant switch), or null for a new row. Only a row dated today
   * with this template counts (resumedRow): it is left out of the history, and its ticked sets of
   * each exercise count toward this session's amount, so a switch part-way never adds to it.
   */
  readonly sessionId: Id | null;
  /** From the variant switch; a version the switch does not offer is ignored. */
  readonly variantOverrides: ReadonlyMap<SeedId, VariantKey>;
}

export interface SessionPlan {
  readonly mode: 'planned' | 'lighter';
  readonly movements: readonly PlannedMovement[];
}

export function planSession(
  data: ExerciseData,
  template: SessionTemplate,
  ctx: PlanContext,
): SessionPlan {
  // A yes on any check today counts for the whole day (the start gate refuses a second session
  // after one), so a re-plan or a new check never brings the planned session back.
  const checksToday = [
    ctx.preCheck,
    ...ctx.sessions.flatMap((s) =>
      s.date === ctx.today && s.preCheck !== null ? [s.preCheck] : [],
    ),
  ];
  const mode = checksToday.some(anyYes) ? 'lighter' : ctx.choice;
  const dropPainFreeOnly = checksToday.some(painAnswered);
  const resumed = resumedRow(ctx.sessions, ctx.sessionId, ctx.today, template.id);
  const movements: PlannedMovement[] = [];

  const fixed = (block: Block, slot: TemplateSlot) => {
    const exercise = exerciseById(data, slot.exerciseId);
    if (exercise === undefined || !slotAvailable(data, slot, ctx.equipment)) return;
    movements.push({
      block,
      exerciseId: exercise.id,
      variant: slot.startVariant,
      unit: exercise.unit,
      perSide: exercise.variants[slot.startVariant].perSide,
      perSet: Object.freeze([slot.min]),
      restSeconds: 0,
      dose: null,
    });
  };

  for (const slot of template.warmUp) fixed('warmUp', slot);
  for (const slot of template.main) {
    const exercise = exerciseById(data, slot.exerciseId);
    if (exercise === undefined || !slotAvailable(data, slot, ctx.equipment)) continue;
    // Nothing can add a movement back, so a dropped pain-free-only movement stays out.
    if (dropPainFreeOnly && exercise.safetyKeys.includes('painFreeOnly')) continue;

    const historyFor = (variant: VariantKey) =>
      weeklyVolumes(ctx.sessions, exercise.id, ctx.today, {
        variant,
        sets: slot.sets,
        max: slot.max,
        excludeSessionId: resumed?.id ?? null,
      });
    const offered = sessionVariants(exercise, ctx.equipment, mode);
    const override = ctx.variantOverrides.get(exercise.id);
    const { lastVariant } = historyFor(slot.startVariant);
    let variant: VariantKey;
    if (mode === 'lighter') variant = 'easier';
    else if (override !== undefined && offered.includes(override)) variant = override;
    else if (lastVariant !== null && offered.includes(lastVariant)) variant = lastVariant;
    else variant = slot.startVariant;

    const dose = suggestDose({
      mode,
      sets: slot.sets,
      min: slot.min,
      max: slot.max,
      step: exercise.step,
      variant,
      nextCandidate: nextVariantFor(exercise, variant),
      history: historyFor(variant),
      remainingOccurrences: occurrencesLeft(data, ctx.week, exercise.id, ctx.today, ctx.equipment),
    });
    movements.push({
      block: 'main',
      exerciseId: exercise.id,
      variant,
      unit: exercise.unit,
      perSide: exercise.variants[variant]?.perSide ?? false,
      perSet: dose.perSet,
      restSeconds: slot.restSeconds,
      dose,
    });
  }
  for (const slot of template.coolDown) fixed('coolDown', slot);
  return Object.freeze({ mode, movements: Object.freeze(movements.map((m) => Object.freeze(m))) });
}
