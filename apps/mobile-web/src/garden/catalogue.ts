/**
 * The foods a garden or pantry row can be linked to (item 19 design 2.1 and section 3; G12, G13).
 * Until the ingredient dataset ships (item 18) it is the seeded silverbeet only, with `hasDataset`
 * false, so unlinked rows show no "not matched" note. Names only: no nutrient figure is read.
 *
 * The seam for item 18: the garden screen reads the catalogue in one place (GardenScreen), and item
 * 18 replaces that call with its useFoodCatalogue(storage), which sets `hasDataset: true` and adds
 * the owner's own foods; this file then goes (item 18 design 1.6).
 */
import { type Catalogue, PRE_DATASET_CATALOGUE } from '@diet/core';

export function appCatalogue(): Catalogue {
  return PRE_DATASET_CATALOGUE;
}
