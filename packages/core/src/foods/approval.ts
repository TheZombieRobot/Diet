import type { DatabaseSource } from './types';

/**
 * Food databases the owner has approved for nutrient figures (checklist item 10; DECISIONS.md).
 * Empty until that decision is recorded, so no database figure can ship (validateNutrientRelease,
 * rules R3 and R12). Changed only in the same commit as the dated item-10 "Nutrition data licence"
 * DECISIONS row and the matching foods.attribution text; tools/scans/docFidelity.test.ts checks
 * that all three agree (S5). A source is never removed once approved: stored log entries may carry
 * its figures, and footers must keep naming it (footerForEntries).
 */
export const APPROVED_NUTRIENT_SOURCES: readonly DatabaseSource[] = Object.freeze([]);
