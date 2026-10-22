/**
 * The owner's portion as words (item 22 design 3.12; C33, HS-23): half a serve, one serve, or a
 * number of serves. "Cooking for" is joined by the app and never changes a figure.
 */
import { formatNumber } from '../foods/figures';

export type PortionText =
  | { readonly kind: 'half' }
  | { readonly kind: 'one' }
  | { readonly kind: 'many'; readonly serves: string };

export function portionText(myServes: number): PortionText {
  if (myServes === 0.5) return { kind: 'half' };
  if (myServes === 1) return { kind: 'one' };
  return { kind: 'many', serves: formatNumber(myServes) };
}
