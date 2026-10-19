/** Where a nutrition figure came from (DATA_MODEL.md ingredients.source). */
export type NutritionSource = 'label' | 'nz-fcdb' | 'usda' | 'estimate';

/** The badge shown next to every nutrition number (HEALTH_SAFETY.md section 4). */
export type Confidence = 'label' | 'database' | 'estimate';

const RANK: Readonly<Record<Confidence, number>> = { label: 3, database: 2, estimate: 1 };

/** The badge for a single item logged directly: a label item logged as it is stays 'label' (FL-01). */
export function confidenceOf(source: NutritionSource): Confidence {
  switch (source) {
    case 'label':
      return 'label';
    case 'nz-fcdb':
    case 'usda':
      return 'database';
    case 'estimate':
      return 'estimate';
    default: {
      const unknown: never = source;
      throw new RangeError(`Unknown nutrition source: ${JSON.stringify(unknown)}`);
    }
  }
}

/**
 * The weakest of several badges: label > database > estimate (DATA_MODEL.md). With none there is
 * nothing to trust, so it is an estimate. An unrecognised badge is refused, never ranked.
 */
export function weakestConfidence(confidences: readonly Confidence[]): Confidence {
  let weakest: Confidence | null = null;
  for (const c of confidences) {
    if (!Object.hasOwn(RANK, c)) {
      throw new RangeError(`Unknown confidence: ${JSON.stringify(c)}`);
    }
    if (weakest === null || RANK[c] < RANK[weakest]) weakest = c;
  }
  return weakest ?? 'estimate';
}

/**
 * A computed recipe's badge: 'estimate' if any ingredient is estimated, else 'database' (FL-02;
 * HEALTH_SAFETY.md section 4, where 'Label' means you typed the figure from a product label). A
 * recipe is computed from its ingredients, so it is never 'label', even when every ingredient is.
 */
export function recipeConfidence(sources: readonly NutritionSource[]): Confidence {
  const weakest = weakestConfidence(sources.map(confidenceOf));
  return weakest === 'label' ? 'database' : weakest;
}
