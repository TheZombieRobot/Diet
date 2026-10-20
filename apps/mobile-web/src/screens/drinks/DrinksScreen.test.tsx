// The Drinks screen (item 28 design 6.2 K1): real repositories over fake-indexeddb, the test clock
// at 1:00 pm on Wednesday 1 March 2000 in Auckland, and a finished setup (all seven answers "no",
// female, born 1970) unless a case says otherwise.
import { fillTemplate, type ProfileSex } from '@diet/core';
import { alcohol, fasting, readiness } from '@diet/core/copy/health';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { createElement } from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import type { TestDb } from '../../db/testKit';
import { DrinksScreen } from './DrinksScreen';
import { drinksFixture, logAt, nz, renderDrinks, resetDrinks } from './drinksTestKit';

let test: TestDb | undefined;
afterEach(() => {
  resetDrinks(test);
  test = undefined;
});

const a = alcohol;
const region = (name: string) => screen.getByRole('region', { name });
const button = (name: string | RegExp, within_: HTMLElement = document.body) =>
  within(within_).getByRole('button', { name });
const field = (label: string, root: HTMLElement = document.body) =>
  within(root).getByLabelText(label);
const type = (element: HTMLElement, value: string) => {
  fireEvent.change(element, { target: { value } });
};
const HELP_NUMBERS = ['111', '0800 611 116', '0800 787 797', '8681', '1737'];
const SEEDED = 'Zero-sugar premix 330 mL, 5%, 94 kcal, 1.3 std';
const SEVEN_DAYS = ['24', '25', '26', '27', '28', '29'].map((d) => nz(`2000-02-${d}`, 19));

describe('the Help card is in every state (K1a; AL-12, HS-13)', () => {
  it.each(['opening', 'notice not read', 'under 18', 'open'] as const)('%s', async (state) => {
    if (state === 'opening') {
      render(createElement('main', null, createElement(DrinksScreen)));
    } else {
      test = await drinksFixture({
        onboard: state !== 'notice not read',
        answers: state === 'under 18' ? { q1: 'yes' } : {},
      });
      await renderDrinks();
    }
    const help = await screen.findByRole('region', { name: a.help.cardLabel });
    for (const number of HELP_NUMBERS) expect(help.textContent).toContain(number);
    expect(help.textContent).toContain(a.firstRunNotice);
  });
});

describe('logging (K1b to K1d; AL-01, NN-01, A43, FS-05)', () => {
  it('AL-01: a tap logs one drink now; More logs three; each line shows its own totals; Undo removes it', async () => {
    test = await drinksFixture();
    await renderDrinks();
    const log = region(a.log.cardLabel);
    fireEvent.click(button(SEEDED, log));
    expect((await within(log).findByTestId('drinks-added')).textContent).toBe(
      'Added 1 × Zero-sugar premix (1.30 std) at 1:00 pm.',
    );
    const summary = region(a.summary.cardLabel);
    await waitFor(() => {
      expect(summary.textContent).toContain('1 drink · 1.30 std');
    });
    expect(summary.textContent).toContain('1 drink, 1.30 standard drinks');
    expect(summary.textContent).toContain('94 kcal (393 kJ)');

    fireEvent.click(button(`More options for Zero-sugar premix`, log));
    type(field(a.log.countLabel, log), '3');
    fireEvent.click(button(a.log.add, log));
    await waitFor(() => {
      expect(within(log).getByTestId('drinks-added').textContent).toBe(
        'Added 3 × Zero-sugar premix (3.91 std) at 1:00 pm.',
      );
    });
    const today = await within(log).findByTestId('logged-today');
    await waitFor(() => {
      expect(today.textContent).toContain('1:00 pm: 3 × Zero-sugar premix, 3.91 std, 282 kcal');
    });
    fireEvent.click(button(a.log.undo, log));
    expect(await within(log).findByText(a.log.undone)).toBeDefined();
    await waitFor(() => {
      expect(within(log).getByTestId('logged-today').textContent).not.toContain('3 ×');
    });
    expect(await test.repos.drinks.list()).toHaveLength(1);
  });

  it("FS-05: a drink during the running fast gets the neutral note; one earlier, inside yesterday's eating window, does not", async () => {
    test = await drinksFixture({
      seed: async (t) => {
        t.env.set(nz('2000-03-01', 9));
        await t.repos.fasts.start();
      },
    });
    await renderDrinks();
    const log = region(a.log.cardLabel);
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 50));
    });
    fireEvent.click(button(SEEDED, log));
    await within(log).findByTestId('drinks-added');
    expect(await within(log).findByText(fasting.alcoholNote)).toBeDefined();

    fireEvent.click(button(`More options for Zero-sugar premix`, log));
    fireEvent.click(within(log).getByRole('radio', { name: a.log.earlier }));
    type(field(a.log.dateLabel, log), '2000-02-29');
    type(field(a.log.timeLabel, log), '18:00');
    fireEvent.click(button(a.log.add, log));
    await waitFor(() => {
      expect(within(log).getByTestId('drinks-added').textContent).toBe(
        'Added 1 × Zero-sugar premix (1.30 std) on Tue 29 Feb at 6:00 pm.',
      );
    });
    expect(within(log).queryByText(fasting.alcoholNote)).toBeNull();
  });

  it('NN-01: a picker serve with the seeded size and strength has no energy, so the tile says how many are unknown', async () => {
    test = await drinksFixture();
    await renderDrinks();
    const log = region(a.log.cardLabel);
    fireEvent.click(button(SEEDED, log));
    await within(log).findByTestId('drinks-added');
    fireEvent.click(button(a.log.otherDrink, log));
    fireEvent.click(button('Bottle of beer, 330 mL, 5%', log));
    expect(within(log).getByText(a.log.otherEnergyNote)).toBeDefined();
    fireEvent.click(button(a.log.add, log));
    await waitFor(() => {
      expect(within(log).getByTestId('logged-today').textContent).toContain(
        '1:00 pm: 1 × Bottle of beer, 1.30 std, kcal unknown',
      );
    });
    expect(region(a.summary.cardLabel).textContent).toContain(
      'at least 94 kcal (393 kJ); 1 drink with kcal unknown',
    );
    const [beer] = (await test.repos.drinks.list()).filter((d) => d.name === 'Bottle of beer');
    expect(beer).toMatchObject({ beverageId: 'seed:beer-bottle-330', kcalPerServe: null });
  });

  it('A21: holding a preset opens its options and logs nothing, and the click a hold leaves is ignored', async () => {
    test = await drinksFixture();
    await renderDrinks();
    const log = region(a.log.cardLabel);
    const preset = button(SEEDED, log);
    fireEvent.pointerDown(preset, { button: 0, clientX: 10, clientY: 10 });
    expect(await within(log).findByLabelText(a.log.countLabel)).toBeDefined();
    fireEvent.pointerUp(preset);
    fireEvent.click(preset);
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 50));
    });
    expect(await test.repos.drinks.list()).toEqual([]);
    expect(within(log).queryByTestId('drinks-added')).toBeNull();
  });

  it('2.6: editing How many alone keeps the time and zone; a time still to come is refused and nothing is saved', async () => {
    test = await drinksFixture({ seed: (t) => logAt(t, [nz('2000-03-01', 12)]) });
    await renderDrinks();
    const log = region(a.log.cardLabel);
    const [before] = await test.repos.drinks.list();
    fireEvent.click(await within(log).findByRole('button', { name: a.log.edit }));
    type(field(a.log.countLabel, log), '2');
    fireEvent.click(button(a.log.save, log));
    await waitFor(async () => {
      expect((await test?.repos.drinks.list())?.[0]?.count).toBe(2);
    });
    const [after] = await test.repos.drinks.list();
    expect(after).toMatchObject({ at: before?.at, timeZone: before?.timeZone });

    fireEvent.click(await within(log).findByRole('button', { name: a.log.edit }));
    type(field(a.log.timeLabel, log), '13:30');
    fireEvent.click(button(a.log.save, log));
    expect(await within(log).findByText(a.log.errors.future)).toBeDefined();
    expect((await test.repos.drinks.list())[0]?.at).toBe(before?.at);
  });
});

describe('the preset editor (K1e; AL-02, A42, A18, D49)', () => {
  async function openEditor(): Promise<HTMLElement> {
    test = await drinksFixture();
    await renderDrinks();
    fireEvent.click(button(a.log.editPresets));
    const editor = region(a.presets.cardLabel);
    fireEvent.click(button(fillTemplate(a.presets.editFor, { name: 'Zero-sugar premix' }), editor));
    return editor;
  }

  it('A42: a new size clears the label figures at once and says what they were for; 0.99 typed is saved for 250 mL only', async () => {
    const editor = await openEditor();
    expect(button(a.presets.matchesLabel, editor)).toBeDefined();
    type(field(a.presets.volumeLabel, editor), '250');
    expect(within(editor).getByTestId('label-was-for').textContent).toBe(
      fillTemplate(a.presets.labelWasFor, { volume: '330', abv: '5' }),
    );
    expect(within(editor).queryByRole('button', { name: a.presets.matchesLabel })).toBeNull();
    expect(field(a.presets.energyLabel, editor)).toHaveProperty('value', '');
    type(field(a.presets.stdLabel, editor), '0.99');
    fireEvent.click(button(a.presets.save, editor));
    await waitFor(() => {
      expect(
        button('Zero-sugar premix 250 mL, 5%, kcal unknown, 1.0 std', region(a.log.cardLabel)),
      ).toBeDefined();
    });
  });

  it('A18: a printed figure far from the calculation needs "Save anyway", then the preset keeps a note', async () => {
    const editor = await openEditor();
    type(field(a.presets.stdLabel, editor), '0.13');
    fireEvent.click(button(a.presets.save, editor));
    expect(
      await within(editor).findByText(fillTemplate(a.presets.stdDisagrees, { calculated: '1.30' })),
    ).toBeDefined();
    fireEvent.click(button(a.presets.saveAnyway, editor));
    expect(
      await within(region(a.log.cardLabel)).findByText(
        fillTemplate(a.log.labelDiffers, { calculated: '1.30' }),
      ),
    ).toBeDefined();
  });

  it('D49: every field of the editor, Other drink, the milestone form and the day note has autocomplete off and no name', async () => {
    const editor = await openEditor();
    fireEvent.click(button(a.log.otherDrink));
    fireEvent.click(button(a.log.somethingElse));
    fireEvent.click(button(a.milestones.add));
    const fields = [
      ...editor.querySelectorAll(
        'input:not([type="radio"]):not([type="checkbox"]), textarea, select',
      ),
      ...region(a.log.cardLabel).querySelectorAll(
        'input:not([type="radio"]):not([type="checkbox"]), textarea',
      ),
      ...region(a.milestones.cardLabel).querySelectorAll('input:not([type="radio"]), textarea'),
      ...region(a.dayNote.cardLabel).querySelectorAll('input:not([type="checkbox"]), textarea'),
    ];
    expect(fields.length).toBeGreaterThan(12);
    for (const element of fields) {
      expect(element.getAttribute('autocomplete'), element.outerHTML).toBe('off');
      expect(element.hasAttribute('name'), element.outerHTML).toBe(false);
    }
  });
});

describe('NZ guidance (K1f; HS-05, C25, C46, C78, NN-09)', () => {
  it.each<[string, ProfileSex | null, 'nz-women' | null, 'nz-women' | 'nz-men', string]>([
    ['female', 'female', null, 'nz-women', a.guidance.basis.profile['nz-women']],
    ['no sex entered', null, null, 'nz-women', a.guidance.basis.noSex],
    ["male, women's figures chosen", 'male', 'nz-women', 'nz-women', a.guidance.basis.chosen],
    ['male', 'male', null, 'nz-men', a.guidance.basis.profile['nz-men']],
  ])('%s', async (_case, sex, setting, set, basis) => {
    test = await drinksFixture({
      profile: { sex },
      seed: (t) => t.repos.settings.update({ alcoholGuidanceSet: setting }),
    });
    await renderDrinks();
    const card = region(a.guidance.cardLabel);
    expect(card.textContent).toContain(a.guidance.line[set]);
    expect(card.textContent).toContain(a.guidance.singleOccasion[set]);
    expect(card.textContent).toContain(basis);
    expect(card.textContent).toContain(a.noRiskFreeLevel);
    if (set === 'nz-women') {
      const screenText = screen.getByTestId('drinks-screen').textContent;
      expect(screenText).not.toMatch(/3 standard drinks|15 a week|5 standard drinks/);
    }
  });
});

describe('milestones (K1g; HS-19, A16, A47, A50)', () => {
  it('the form starts empty with the notice and help rows; own words are never the heading; the chart says "your milestone"', async () => {
    const days = Array.from({ length: 21 }, (_, i) =>
      nz(`2000-02-${String(8 + i).padStart(2, '0')}`, 19),
    );
    test = await drinksFixture({ seed: (t) => logAt(t, days) });
    await renderDrinks();
    const card = region(a.milestones.cardLabel);
    fireEvent.click(button(a.milestones.add, card));
    expect(field(a.milestones.weeklyLabel, card)).toHaveProperty('value', '');
    expect(field(a.milestones.fromLabel, card)).toHaveProperty('value', '');
    for (const radio of within(card).getAllByRole('radio'))
      expect(radio).toHaveProperty('checked', false);
    expect(card.textContent).toContain(a.firstRunNotice);
    expect(
      within(card)
        .getAllByRole('link')
        .map((l) => l.getAttribute('href')),
    ).toEqual(['tel:0800787797', 'sms:8681', 'tel:111']);

    type(field(a.milestones.weeklyLabel, card), '8');
    type(field(a.milestones.fromLabel, card), '2000-02-14');
    type(field(a.milestones.nameLabel, card), 'Weekly limit');
    fireEvent.click(within(card).getByRole('radio', { name: a.milestones.whoSelf }));
    fireEvent.click(button(a.milestones.save, card));
    expect(await within(card).findByText(a.milestones.rowTitle)).toBeDefined();
    const ownWords = within(card).getByText(
      fillTemplate(a.milestones.ownWords, { label: 'Weekly limit' }),
    );
    const elsewhere = [...card.querySelectorAll('*')].filter(
      (e) => e.children.length === 0 && e !== ownWords && e.textContent.includes('Weekly limit'),
    );
    expect(elsewhere).toEqual([]);
    expect(
      screen.getByTestId('drinks-screen').textContent.replace(ownWords.textContent, ''),
    ).not.toContain('Weekly limit');
    await waitFor(() => {
      expect(
        region(a.trends.cardLabel).querySelector('.ui-bar-chart__legend')?.textContent,
      ).toContain(a.trends.milestoneLine);
    });
  });
});

describe('How you felt (K1h; AL-08, C05)', () => {
  it('a ticked note brings up the Talk to someone card; with nothing left, Remove note deletes it', async () => {
    test = await drinksFixture();
    await renderDrinks();
    expect(screen.queryByRole('region', { name: a.helpCardLabel })).toBeNull();
    const note = region(a.dayNote.cardLabel);
    fireEvent.click(within(note).getByRole('checkbox', { name: a.dayNote.withdrawalTick }));
    fireEvent.click(button(a.dayNote.save, note));
    const talk = await screen.findByRole('region', { name: a.helpCardLabel });
    expect(screen.getByTestId('drinks-screen').querySelector('section')).toBe(talk);
    expect(await within(note).findByTestId('day-note-help')).toBeDefined();
    fireEvent.click(within(note).getByRole('checkbox', { name: a.dayNote.withdrawalTick }));
    fireEvent.click(button(a.dayNote.remove, note));
    await waitFor(async () => {
      expect(await test?.repos.alcoholDayNotes.list()).toEqual([]);
    });
  });
});

describe('under 18 (K1i; RD-01, RD-06, A23)', () => {
  it.each([
    ['answered yes, question 7 unanswered', false],
    ['seven drinking days logged, then answered yes', true],
  ])(
    '%s: tracking is off with the reason, help stays, and nothing is lost',
    async (_case, drinks) => {
      test = await drinksFixture({
        seed: async (t) => {
          if (drinks) await logAt(t, [...SEVEN_DAYS, nz('2000-03-01', 12)]);
          await t.repos.readiness.answer('q1', 'yes');
          if (!drinks) await t.repos.readiness.clear('q7');
        },
      });
      const before = (await test.repos.drinks.list()).length;
      await renderDrinks();
      const off = await screen.findByTestId('gate-notice-alcoholLogging');
      expect(off.textContent).toContain(readiness.reasonPhrases['under-18']);
      expect(screen.getByText(a.access.kept)).toBeDefined();
      expect(screen.queryByRole('region', { name: a.log.cardLabel })).toBeNull();
      expect(screen.queryByRole('button', { name: SEEDED })).toBeNull();
      expect(screen.queryByRole('link', { name: readiness.changeAnswersLink })).toBeNull();
      expect(await screen.findByRole('region', { name: a.helpCardLabel })).toBeDefined();
      for (const number of HELP_NUMBERS) {
        expect(region(a.help.cardLabel).textContent).toContain(number);
      }
      expect(await test.repos.drinks.list()).toHaveLength(before);

      await act(async () => {
        await test?.repos.readiness.answer('q1', 'no');
      });
      const log = await screen.findByRole('region', { name: a.log.cardLabel });
      if (drinks) {
        expect(await within(log).findByTestId('logged-today')).toBeDefined();
      }
    },
  );
});

describe('the jump row', () => {
  it('each button moves focus to its part', async () => {
    test = await drinksFixture();
    await renderDrinks();
    fireEvent.click(button(a.screen.jumpGuidance));
    expect(document.activeElement?.id).toBe('drinks-guidance');
  });
});
