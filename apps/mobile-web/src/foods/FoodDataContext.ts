/**
 * The bundled food data as screens read it (item 18 design 5.2). The app never provides this
 * context, so every screen reads the shipped catalogue and release with the approved sources and
 * their attribution; tests inject fixture data here instead of mocking core.
 */
import {
  APPROVED_NUTRIENT_SOURCES,
  type AttributionMap,
  type DatabaseSource,
  type FoodData,
  foodData,
} from '@diet/core';
import { foods } from '@diet/core/copy/health';
import { createContext, useContext } from 'react';

export interface FoodDataValue {
  readonly data: FoodData;
  readonly attributions: AttributionMap;
  readonly approved: readonly DatabaseSource[];
}

/** Tests inject fixture data here; the app never provides it, so the shipped data is used. */
export const FoodDataContext = createContext<FoodDataValue | null>(null);

let shipped: FoodDataValue | undefined;

/** The context value, or the shipped data with APPROVED_NUTRIENT_SOURCES and foods.attribution. */
export function useFoodData(): FoodDataValue {
  const injected = useContext(FoodDataContext);
  if (injected !== null) return injected;
  shipped ??= {
    data: foodData(),
    attributions: foods.attribution,
    approved: APPROVED_NUTRIENT_SOURCES,
  };
  return shipped;
}
