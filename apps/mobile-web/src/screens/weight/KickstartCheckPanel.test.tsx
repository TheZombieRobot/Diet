import { foods } from '@diet/core/copy/health';
import { exampleAttribution, exampleFoodData } from '@diet/test-fixtures';
import { cleanup, render, screen } from '@testing-library/react';
import type { ReactElement } from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import type { AppStorage } from '../../db/runtime';
import { FoodDataContext, type FoodDataValue } from '../../foods/FoodDataContext';
import { type CheckVariant, KickstartCheckPanel } from './KickstartCheckPanel';

afterEach(cleanup);

// Only rendered: nothing here is answered, so the panel never touches the records.
const storage = {} as AppStorage;
const panel = (variant: CheckVariant): ReactElement => (
  <KickstartCheckPanel
    storage={storage}
    variant={variant}
    onCancel={() => undefined}
    onPreStartStopSign={() => undefined}
  />
);
const START: CheckVariant = { kind: 'start', today: '2000-01-01' };

describe('the Kickstart start check while food figures are not loaded (item 18 design 1.8)', () => {
  it('K10 HS-10 HS-18: the start check says the floor and protein cannot be checked yet; the extension check does not', () => {
    const { rerender } = render(panel(START));
    expect(screen.getByText(foods.kickstart.figuresNotLoaded)).toBeDefined();
    rerender(panel({ kind: 'extend', week: 3, weeks: 3 }));
    expect(screen.queryByText(foods.kickstart.figuresNotLoaded)).toBeNull();

    const loaded: FoodDataValue = {
      data: exampleFoodData('usda'),
      approved: ['usda'],
      attributions: exampleAttribution,
    };
    rerender(<FoodDataContext.Provider value={loaded}>{panel(START)}</FoodDataContext.Provider>);
    expect(screen.queryByText(foods.kickstart.figuresNotLoaded)).toBeNull();
  });
});
