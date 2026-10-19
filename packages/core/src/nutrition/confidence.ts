/** Where a nutrition figure came from (DATA_MODEL.md ingredients.source). */
export type NutritionSource = 'label' | 'nz-fcdb' | 'usda' | 'estimate';

/** The badge shown next to every nutrition number (HEALTH_SAFETY.md section 4). */
export type Confidence = 'label' | 'database' | 'estimate';

const RANK: Record<Confidence, number> = { label: 3, database: 2, estimate: 1 };

export function confidenceOf(source: NutritionSource): Confidence {
  switch (source) {
    case 'label':
      return 'label';
    case 'nz-fcdb':
    case 'usda':
      return 'database';
    case 'estimate':
      return 'estimate';
  }
}

/**
 * A recipe is only as trustworthy as its weakest ingredient: label > database > estimate
 * (DATA_MODEL.md; FL-02). With no ingredients there is nothing to trust, so it is an estimate.
 */
export function weakestConfidence(confidences: readonly Confidence[]): Confidence {
  let weakest: Confidence | null = null;
  for (const c of confidences) {
    if (weakest === null || RANK[c] < RANK[weakest]) weakest = c;
  }
  return weakest ?? 'estimate';
}

export function recipeConfidence(sources: readonly NutritionSource[]): Confidence {
  return weakestConfidence(sources.map(confidenceOf));
}
