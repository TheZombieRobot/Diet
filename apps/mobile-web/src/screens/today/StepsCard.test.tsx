// The Steps card (item 16 design section 5.2 C5; TD-04, T9, T25): real repositories on
// fake-indexeddb; the fixture has 12,000 steps yesterday and none today.
import { today } from '@diet/core/copy/health';
import { act, cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { TestDb } from '../../db/testKit';
import { renderToday, resetToday, todayFixture } from './todayTestKit';

let test: TestDb | undefined;
afterEach(() => {
  vi.restoreAllMocks();
  cleanup();
  resetToday(test);
  test = undefined;
});

const steps = today.steps;
const D = '2000-03-15';
const card = () => screen.getByRole('region', { name: today.cards.steps });
const button = (name: string) => within(card()).getByRole('button', { name });
const pair = () => card().parentElement;
const field = () => within(card()).getByLabelText(steps.field);

describe('the Steps card (C5; TD-04)', () => {
  it('"Same as yesterday" copies 12,000 into today, then Edit takes focus', async () => {
    test = await todayFixture();
    await renderToday();
    fireEvent.click(button('Same as yesterday: 12,000'));
    await waitFor(() => {
      expect(screen.getByTestId('steps-today').textContent).toBe('12,000');
    });
    expect(card().textContent).toContain('saved at 2:20 pm');
    expect(within(card()).queryByRole('button', { name: /Same as yesterday/ })).toBeNull();
    await waitFor(() => {
      expect(document.activeElement).toBe(button(steps.edit));
    });
    expect(await test.repos.steps.get(D)).toMatchObject({ steps: 12000, source: 'manual' });
  });

  it('a second "Same as yesterday" tap before the saved row comes back saves nothing more and reports no failure', async () => {
    test = await todayFixture();
    await renderToday();
    // Today's read lags behind the write, as on a busy phone: today still reads as empty.
    const read = test.repos.steps.get.bind(test.repos.steps);
    vi.spyOn(test.repos.steps, 'get').mockImplementation((date) =>
      date === D ? Promise.resolve(undefined) : read(date),
    );
    const create = vi.spyOn(test.repos.steps, 'create');
    const repeat = button('Same as yesterday: 12,000');
    fireEvent.click(repeat);
    await act(async () => {
      await create.mock.results[0]?.value;
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    fireEvent.click(repeat);
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 20));
    });
    expect(create).toHaveBeenCalledTimes(1);
    expect(within(card()).queryByRole('alert')).toBeNull();
    expect(repeat.getAttribute('aria-disabled')).toBe('true');
    expect(await read(D)).toMatchObject({ steps: 12000 });
  });

  it('Edit, type "16,400", Enter (the form submits): saved, editor closed, focus on Edit; the pair stacks only while editing', async () => {
    test = await todayFixture({
      seed: (t) => t.repos.steps.create({ date: D, steps: 9000, source: 'manual' }),
    });
    await renderToday();
    expect(within(card()).queryByRole('button', { name: /Same as yesterday/ })).toBeNull();
    expect(pair()?.className).toBe('ui-card-pair');
    fireEvent.click(button(steps.edit));
    expect(document.activeElement).toBe(field());
    expect(pair()?.className).toBe('ui-card-pair ui-card-pair--stacked');
    expect(card().querySelector('.ui-button-row--stacked')).not.toBeNull();
    fireEvent.change(field(), { target: { value: '16,400' } });
    fireEvent.submit(field());
    await waitFor(() => {
      expect(screen.getByTestId('steps-today').textContent).toBe('16,400');
    });
    expect(pair()?.className).toBe('ui-card-pair');
    await waitFor(() => {
      expect(document.activeElement).toBe(button(steps.edit));
    });
    expect((await test.repos.steps.get(D))?.steps).toBe(16400);
  });

  it.each([
    ['100,001', steps.errors['too-many']],
    ['1.5', steps.errors.format],
    ['-5', steps.errors.format],
    ['', steps.errors.empty],
  ])(
    'refuses %j with its error, keeps focus in the field and writes nothing',
    async (text, error) => {
      test = await todayFixture();
      await renderToday();
      fireEvent.click(button(steps.enter));
      fireEvent.change(field(), { target: { value: text } });
      fireEvent.click(button(steps.save));
      expect(within(card()).getByRole('alert').textContent).toBe(error);
      expect(document.activeElement).toBe(field());
      expect(await test.repos.steps.get(D)).toBeUndefined();
    },
  );

  it("Cancel writes nothing; Remove today's entry deletes it and focus goes to Enter steps", async () => {
    test = await todayFixture({
      seed: (t) => t.repos.steps.create({ date: D, steps: 9000, source: 'manual' }),
    });
    await renderToday();
    fireEvent.click(button(steps.edit));
    fireEvent.change(field(), { target: { value: '1' } });
    fireEvent.click(button(steps.cancel));
    expect((await test.repos.steps.get(D))?.steps).toBe(9000);
    fireEvent.click(button(steps.edit));
    fireEvent.click(button(steps.remove));
    await waitFor(() => {
      expect(document.activeElement).toBe(button(steps.enter));
    });
    expect(await test.repos.steps.get(D)).toBeUndefined();
    expect(await test.repos.steps.get('2000-03-14')).toBeDefined();
  });

  it('no "Same as yesterday" without a count yesterday', async () => {
    test = await todayFixture({ logs: false });
    await renderToday();
    expect(within(card()).queryByRole('button', { name: /Same as yesterday/ })).toBeNull();
    expect(card().textContent).not.toMatch(/goal|target/i);
  });
});
