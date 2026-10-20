/**
 * The session log's layout (item 27 design section 2.5; N6): each planned movement of a fresh
 * plan for the row, matched to its stored movement, with the amount to show on each set not yet
 * ticked. The plan is item 26's planSession for this row (its own row left out of the history and
 * its ticks counted toward this session), so the amounts shown stay within every cap, and a
 * stored 3 × 8 for [9, 9, 8] does not stall progression.
 */
import {
  type Block,
  BLOCKS,
  type Exercise,
  type ExerciseData,
  exerciseById,
  type PlannedMovement,
  type SessionTemplate,
  type TemplateSlot,
} from '../exercise';
import type { SessionMovement, SessionRecord } from '../storage/records';

export interface LayoutMovement {
  readonly block: Block;
  readonly exercise: Exercise | null;
  readonly slot: TemplateSlot | null;
  /** Null for a stored movement whose slot has left the dataset. */
  readonly planned: PlannedMovement | null;
  /** Its index in row.movements; null when not stored. */
  readonly index: number | null;
  readonly stored: SessionMovement | null;
  /** The amount to show on each set not yet ticked, in order; empty when none is left. */
  readonly toDo: readonly number[];
}

export interface LayoutBlock {
  readonly block: Block;
  readonly movements: readonly LayoutMovement[];
}

const amountOf = (m: SessionMovement): number => m.reps ?? m.seconds ?? 0;

/**
 * Walks the plan in order. A warm-up or cool-down movement takes the next slot of its block, a
 * main one its main slot; each takes the first stored movement of its exercise not yet matched
 * (the warm-up march the first stored march, the cool-down march the second). Stored movements
 * left over (a slot no longer in the dataset) go last in the main block, read-only.
 */
export function layoutSession(
  data: ExerciseData,
  template: SessionTemplate,
  plan: { readonly movements: readonly PlannedMovement[] },
  row: SessionRecord,
): LayoutBlock[] {
  const matched = new Set<number>();
  const usedSlots = new Set<TemplateSlot>();
  const groups = new Map<Block, LayoutMovement[]>(BLOCKS.map((b) => [b, []]));

  for (const p of plan.movements) {
    const slot =
      template[p.block].find((s) => s.exerciseId === p.exerciseId && !usedSlots.has(s)) ?? null;
    if (slot !== null) usedSlots.add(slot);
    const index = row.movements.findIndex(
      (m, i) => m.exerciseId === p.exerciseId && !matched.has(i),
    );
    const stored = index < 0 ? null : (row.movements[index] ?? null);
    if (stored !== null) matched.add(index);
    let toDo: readonly number[];
    if (stored === null) {
      toDo = p.perSet;
    } else {
      const left = Math.max(0, stored.sets - stored.done.length);
      const fromPlan = p.variant === stored.variant ? p.perSet : [];
      toDo = Array.from({ length: left }, (_, i) => fromPlan[i] ?? amountOf(stored));
    }
    groups.get(p.block)?.push({
      block: p.block,
      exercise: exerciseById(data, p.exerciseId) ?? null,
      slot,
      planned: p,
      index: stored === null ? null : index,
      stored,
      toDo: Object.freeze([...toDo]),
    });
  }

  row.movements.forEach((stored, index) => {
    if (matched.has(index)) return;
    const left = Math.max(0, stored.sets - stored.done.length);
    groups.get('main')?.push({
      block: 'main',
      exercise: exerciseById(data, stored.exerciseId) ?? null,
      slot: null,
      planned: null,
      index,
      stored,
      toDo: Object.freeze(Array<number>(left).fill(amountOf(stored))),
    });
  });

  return BLOCKS.flatMap((block) => {
    const movements = groups.get(block) ?? [];
    return movements.length === 0 ? [] : [{ block, movements }];
  });
}
