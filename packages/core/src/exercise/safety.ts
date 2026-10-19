/**
 * Beach sessions and the beach prompts (HEALTH_SAFETY.md section 6 "Beach prompts"; HS-12; EX-02;
 * DOC_REVIEW C51, C77, C102). The prompts are always rendered through beachPromptLines, never
 * from move.safety.beachPrompts.items directly.
 */
import { move, readiness } from '../copy/health';
import type { ReadinessGates } from '../storage/readiness';
import type { DietMode } from '../storage/records';
import { exerciseById } from './lookup';
import { BLOCKS, type ExerciseData, type SessionTemplate } from './types';

/** C51: beach from the template's tags or from any of its movements' exercise tags. */
export function isBeachTemplate(data: ExerciseData, template: SessionTemplate): boolean {
  if (template.tags.includes('beach')) return true;
  return BLOCKS.some((block) =>
    template[block].some((slot) => exerciseById(data, slot.exerciseId)?.tags.includes('beach')),
  );
}

/**
 * The six HEALTH_SAFETY.md bullets in order. The electrolytes line follows the hydration line
 * only in keto mode while the keto carb ceiling is available (readiness answers 1, 2 and 5, an
 * unanswered one, a birth year that may be under 18 or a low weight switch it off: D30 as
 * changed), never for moderate low-carb. Readiness answer 4 (yes or unanswered) adds item 13's
 * blood-pressure salt sentence after it (C102).
 */
export function beachPromptLines(input: {
  readonly dietMode: DietMode;
  readonly gates: Pick<ReadinessGates, 'ketoCeilingAvailable' | 'bloodPressureSaltWording'>;
}): string[] {
  const { items, electrolytes } = move.safety.beachPrompts;
  const extra: string[] = [];
  // Compared as unknown, as readiness/gates.ts does: only exactly true opens the electrolytes
  // line, and anything but exactly false keeps the salt caution.
  if ((input.gates.ketoCeilingAvailable as unknown) === true && input.dietMode === 'keto') {
    extra.push(electrolytes);
    if ((input.gates.bloodPressureSaltWording as unknown) !== false) {
      extra.push(readiness.bloodPressure.electrolyte);
    }
  }
  return [...items.slice(0, 4), ...extra, ...items.slice(4)];
}
