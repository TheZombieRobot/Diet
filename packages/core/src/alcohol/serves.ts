/**
 * The NZ drink picker (HEALTH_SAFETY.md section 5: "NZ-typical serves ... with editable volume and
 * ABV"; storage spec section 6). The strengths are the first six AL-01 vectors; the owner checks
 * the label, and the form says so. A serve has no label, so it never carries energy (NN-01).
 */
import type { SeedId } from '../storage/primitives';

export interface DrinkPickerServe {
  readonly id: SeedId;
  readonly name: string;
  readonly volumeMl: number;
  readonly abvPercent: number;
}

export const DRINK_PICKER_SERVES: readonly DrinkPickerServe[] = Object.freeze([
  { id: 'seed:beer-bottle-330', name: 'Bottle of beer', volumeMl: 330, abvPercent: 5 },
  { id: 'seed:beer-can-440', name: 'Can of beer', volumeMl: 440, abvPercent: 5 },
  { id: 'seed:wine-glass-150', name: 'Glass of wine', volumeMl: 150, abvPercent: 13 },
  { id: 'seed:spirits-nip-30', name: 'Single nip of spirits', volumeMl: 30, abvPercent: 40 },
  { id: 'seed:cider-500', name: 'Cider', volumeMl: 500, abvPercent: 4.5 },
  { id: 'seed:premix-250', name: 'Premix can', volumeMl: 250, abvPercent: 7 },
]);
