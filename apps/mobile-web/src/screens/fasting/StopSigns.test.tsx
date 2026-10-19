import { fasting } from '@diet/core/copy/health';
import { cleanup, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { StopSignsCard } from './StopSigns';

afterEach(cleanup);

describe('the fasting stop-signs (FS-04)', () => {
  it('lists the five signs and the action sentence, with tap-to-call rows for 111 and Healthline', () => {
    render(<StopSignsCard />);
    const card = screen.getByRole('region', { name: fasting.stopSigns.label });
    expect(
      within(card)
        .getAllByRole('listitem')
        .slice(0, 5)
        .map((li) => li.textContent),
    ).toEqual(['Dizziness', 'Fainting', 'Heart palpitations', 'Confusion', 'Severe weakness']);
    expect(within(card).getByText(fasting.stopSigns.action)).toBeTruthy();
    expect(
      within(card)
        .getAllByRole('link')
        .map((a) => a.getAttribute('href')),
    ).toEqual(['tel:111', 'tel:0800611116']);
  });
});
