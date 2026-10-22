/**
 * Recipe fixtures for the app's tests (checklist item 20; design 8). They live in core beside the
 * code they test (core cannot import this package) and are re-exported here. Every figure is
 * synthetic and never shipped; the foods are item 18's real catalogue and allergen model.
 */
export {
  exampleOwnFood,
  fixtureFoods,
  fixtureSeedViews,
  nu04Fixtures,
  overrideFiguresFor,
  SYNTHETIC_PER_100G,
} from '@diet/core/recipes/testData';
