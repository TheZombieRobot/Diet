/**
 * The label check before the owner adds a recipe whose allergens are not fully known (item 22
 * design 3.12 and 2.11; P41, contract 10 rule 3; HS-R20; V18). It names the owner's blocked
 * allergens, expanded (gluten as its four cereals), and the ingredients whose labels to check, by
 * name. The confirmation carries exactly the allergens it named, and covers one write only.
 */
import { matchKey } from '../foods/names';
import type { RecipeView } from '../recipes/view';
import { type Allergen, sortAllergens } from '../storage/allergens';

export interface LabelCheckView {
  readonly allergens: readonly Allergen[];
  /** An empty name stays '': the app shows its "not in the app" wording. */
  readonly lineNames: readonly string[];
}

export function labelCheckView(
  view: Pick<RecipeView, 'lines' | 'allergens'>,
  blocked: readonly Allergen[],
): LabelCheckView {
  const seen = new Set<string>();
  const lineNames: string[] = [];
  for (const index of view.allergens.checkLabelLines) {
    const name = view.lines[index]?.name ?? '';
    const key = matchKey(name);
    if (name !== '' && seen.has(key)) continue;
    seen.add(key);
    lineNames.push(name);
  }
  return { allergens: sortAllergens(blocked), lineNames };
}
