import { fillTemplate, foodData } from '@diet/core';
import { foods } from '@diet/core/copy/health';
import { exampleAttribution, exampleCatalogue, exampleFoodData } from '@diet/test-fixtures';
import { cleanup, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { FoodDataContext } from '../foods/FoodDataContext';
import { AboutScreen } from './AboutScreen';

afterEach(cleanup);

const dataSources = () => screen.getByRole('region', { name: 'Data sources' });

describe('About, Data sources (item 18 design 1.2)', () => {
  it('K6 NU-09 C97: the catalogue line, the attribution note and the link, with no database named while none is approved', () => {
    render(<AboutScreen />);
    const data = foodData();
    if (data.status !== 'ok') throw new Error('the shipped catalogue did not load');
    const card = dataSources();
    expect(card.textContent).toContain(
      fillTemplate(foods.about.catalogue, { count: data.catalogue.foods.length }),
    );
    expect(card.textContent).toContain(foods.about.attributionNote);
    const link = within(card).getByRole('link', { name: /^Foods in the app/ });
    expect(link.getAttribute('href')).toBe('#/foods');
    expect(card.textContent).not.toMatch(/Food Composition Database|\bUSDA\b|FoodData/);
  });

  it('K6 C97: with an approved, attributed source in use, its name, edition and attribution text', () => {
    render(
      <FoodDataContext.Provider
        value={{
          data: exampleFoodData('usda'),
          approved: ['usda'],
          attributions: exampleAttribution,
        }}
      >
        <AboutScreen />
      </FoodDataContext.Provider>,
    );
    const card = dataSources().textContent;
    expect(card).toContain(
      fillTemplate(foods.about.catalogueLoaded, {
        count: exampleCatalogue.foods.length,
        loaded: exampleCatalogue.foods.length,
      }),
    );
    expect(card).toContain('Example database, Example edition');
    expect(card).toContain('Example attribution text.');
  });
});
