// The Drinks screen (item 28 design 6.2 K1): real repositories over fake-indexeddb, the test clock
// at 1:00 pm on Wednesday 1 March 2000 in Auckland, and a finished setup (all seven answers "no",
// female, born 1970) unless a case says otherwise.
import { fillTemplate, type ProfileSex, zonedWallTimeToInstant } from '@diet/core';
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
    // Tapped at once, before the fasting records are read: the note follows when they are.
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

    // A20: once its size is changed it is no longer that serve, so it keeps no seed id.
    fireEvent.click(button(a.log.otherDrink, log));
    fireEvent.click(button('Bottle of beer, 330 mL, 5%', log));
    type(field(a.log.volumeLabel, log), '500');
    fireEvent.click(button(a.log.add, log));
    await waitFor(async () => {
      expect(
        (await test?.repos.drinks.list())?.filter((d) => d.name === 'Bottle of beer'),
      ).toHaveLength(2);
    });
    const big = (await test.repos.drinks.list()).find((d) => d.beverage.volumeMl === 500);
    expect(big?.beverageId).toBeNull();
  });

  it('2.3: two taps before the first log is written log one drink', async () => {
    test = await drinksFixture();
    await renderDrinks();
    const preset = button(SEEDED, region(a.log.cardLabel));
    fireEvent.click(preset);
    // Marked busy, never disabled, so focus stays on it (F19); the second tap is ignored.
    expect(preset).toHaveProperty('disabled', false);
    expect(preset.getAttribute('aria-disabled')).toBe('true');
    fireEvent.click(preset);
    await within(region(a.log.cardLabel)).findByTestId('drinks-added');
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 50));
    });
    expect(await test.repos.drinks.list()).toHaveLength(1);
  });

  it('A13, HS-05: a "more than the guidance" line shows only when the shown total is above its figure', async () => {
    test = await drinksFixture({ seed: (t) => logAt(t, [nz('2000-03-01', 12)]) });
    await renderDrinks();
    const summary = region(a.summary.cardLabel);
    await waitFor(() => {
      expect(summary.textContent).toContain('1 drink · 1.30 std');
    });
    expect(summary.textContent).not.toContain(a.summary.dayAbove);
    expect(summary.textContent).not.toContain(a.summary.weekAbove);
    // Women: 2 a day and 10 a week. 8 cans are 10.41.
    await act(async () => {
      await logAt(
        test as TestDb,
        Array.from({ length: 7 }, () => nz('2000-03-01', 12, 30)),
      );
    });
    await waitFor(() => {
      expect(summary.textContent).toContain('8 drinks · 10.41 std');
    });
    expect(summary.textContent).toContain(a.summary.dayAbove);
    expect(summary.textContent).toContain(a.summary.weekAbove);
  });

  it('C94, A43: when the entries do not add up to the day total, a note says why', async () => {
    // Three 30 mL nips at 40% are 0.95 each as entries, and 2.84 together (0.9468 × 3).
    test = await drinksFixture({
      seed: (t) =>
        logAt(t, [nz('2000-03-01', 12), nz('2000-03-01', 12, 5), nz('2000-03-01', 12, 10)], {
          volumeMl: 30,
          abvPercent: 40,
        }),
    });
    await renderDrinks();
    const log = region(a.log.cardLabel);
    await waitFor(() => {
      expect(within(log).getByTestId('logged-today').textContent).toContain('0.95 std');
    });
    expect(region(a.summary.cardLabel).textContent).toContain('3 drinks · 2.84 std');
    expect(log.textContent).toContain(a.log.roundingNote);
  });

  it('F19: More then Add hands focus back to More; Undo moves it to the status line', async () => {
    test = await drinksFixture();
    await renderDrinks();
    const log = region(a.log.cardLabel);
    const more = button('More options for Zero-sugar premix', log);
    fireEvent.click(more);
    fireEvent.click(button(a.log.add, log));
    await within(log).findByTestId('drinks-added');
    await waitFor(() => {
      expect(document.activeElement).toBe(more);
    });
    fireEvent.click(button(a.log.undo, log));
    await within(log).findByText(a.log.undone);
    await waitFor(() => {
      expect(document.activeElement?.getAttribute('role')).toBe('status');
    });
  });

  it('F19: deleting an entry moves focus to the Log card heading, never to the page', async () => {
    test = await drinksFixture({ seed: (t) => logAt(t, [nz('2000-03-01', 12)]) });
    await renderDrinks();
    const log = region(a.log.cardLabel);
    fireEvent.click(await within(log).findByRole('button', { name: a.log.edit }));
    fireEvent.click(button(a.log.delete, log));
    const confirm = within(log).getAllByRole('button', { name: a.log.delete })[0] as HTMLElement;
    confirm.focus();
    fireEvent.click(confirm);
    await waitFor(() => {
      expect(within(log).queryByTestId('logged-today')).toBeNull();
    });
    await waitFor(() => {
      expect(document.activeElement).toBe(
        within(log).getByRole('heading', { name: a.log.cardLabel }),
      );
    });
  });

  it('F20: with every preset hidden the card says so, with nothing to tap and no tap line', async () => {
    test = await drinksFixture({
      seed: async (t) => {
        for (const preset of await t.repos.beverages.list())
          await t.repos.beverages.update(preset.id, { archived: true });
      },
    });
    await renderDrinks();
    const log = region(a.log.cardLabel);
    expect(log.textContent).toContain(a.log.allPresetsHidden);
    expect(log.textContent).not.toContain(a.log.noPresets);
    expect(log.textContent).not.toContain(a.log.intro);
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

  it('2.6: editing How many alone keeps the time, to the second, and the zone; a time still to come is refused and nothing is saved', async () => {
    // Logged at 10:00:30 am in Sydney (12:00:30 pm in Auckland, where the phone is now).
    const SYDNEY = 'Australia/Sydney';
    const at = new Date(zonedWallTimeToInstant('2000-03-01', 600, SYDNEY) + 30_000).toISOString();
    test = await drinksFixture({
      seed: async (t) => {
        t.env.setZone(SYDNEY);
        await logAt(t, [at]);
        t.env.setZone('Pacific/Auckland');
      },
    });
    await renderDrinks();
    const log = region(a.log.cardLabel);
    expect((await within(log).findByTestId('logged-today')).textContent).toContain('10:00 am');
    fireEvent.click(within(log).getByRole('button', { name: a.log.edit }));
    expect(field(a.log.timeLabel, log)).toHaveProperty('value', '10:00');
    type(field(a.log.countLabel, log), '2');
    fireEvent.click(button(a.log.save, log));
    await waitFor(async () => {
      expect((await test?.repos.drinks.list())?.[0]?.count).toBe(2);
    });
    expect((await test.repos.drinks.list())[0]).toMatchObject({ at, timeZone: SYDNEY });

    // F6: a corrected time is read in the drink's own zone, and the drink keeps that zone.
    fireEvent.click(await within(log).findByRole('button', { name: a.log.edit }));
    type(field(a.log.timeLabel, log), '09:00');
    fireEvent.click(button(a.log.save, log));
    await waitFor(async () => {
      expect((await test?.repos.drinks.list())?.[0]).toMatchObject({
        at: new Date(zonedWallTimeToInstant('2000-03-01', 540, SYDNEY)).toISOString(),
        timeZone: SYDNEY,
      });
    });

    fireEvent.click(await within(log).findByRole('button', { name: a.log.edit }));
    type(field(a.log.timeLabel, log), '13:30');
    fireEvent.click(button(a.log.save, log));
    expect(await within(log).findByText(a.log.errors.future)).toBeDefined();
    expect((await test.repos.drinks.list())[0]?.timeZone).toBe(SYDNEY);
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

  it('A40: an energy of 0 kcal kept by "Save anyway" reads "kcal unknown" with its note, never "0 kcal"', async () => {
    const editor = await openEditor();
    type(field(a.presets.energyLabel, editor), '0');
    fireEvent.click(button(a.presets.save, editor));
    expect(await within(editor).findByText(a.presets.kcalImplausible)).toBeDefined();
    fireEvent.click(button(a.presets.saveAnyway, editor));
    const log = region(a.log.cardLabel);
    expect(
      await within(log).findByRole('button', {
        name: 'Zero-sugar premix 330 mL, 5%, kcal unknown, 1.3 std',
      }),
    ).toBeDefined();
    expect(log.textContent).toContain(a.log.kcalLooksLow);
    expect(log.textContent).not.toMatch(/\b0 kcal\b/);
  });

  it('F17: Edit drink presets opens the editor with focus on its heading; Done gives focus back', async () => {
    test = await drinksFixture();
    await renderDrinks();
    const open = button(a.log.editPresets);
    expect(open.getAttribute('aria-expanded')).toBe('false');
    fireEvent.click(open);
    const editor = region(a.presets.cardLabel);
    await waitFor(() => {
      expect(document.activeElement).toBe(
        within(editor).getByRole('heading', { name: a.presets.cardLabel }),
      );
    });
    expect(open.getAttribute('aria-expanded')).toBe('true');
    fireEvent.click(button(a.presets.done, editor));
    await waitFor(() => {
      expect(document.activeElement).toBe(button(a.log.editPresets));
    });
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
    // C78: the single-occasion figure says where it comes from, after the sources line, which
    // names only what it covers.
    const single = within(card).getByTestId('single-occasion');
    expect(single.textContent).toBe(
      `${a.guidance.singleOccasion[set]} ${a.guidance.singleOccasionSource}`,
    );
    const sources = within(card).getByText(a.guidance.sources);
    expect(sources.compareDocumentPosition(single) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(card.textContent).toContain(basis);
    expect(card.textContent).toContain(a.noRiskFreeLevel);
    if (set === 'nz-women') {
      const screenText = screen.getByTestId('drinks-screen').textContent;
      expect(screenText).not.toMatch(/3 standard drinks|15 a week|5 standard drinks/);
    }
  });
});

describe('NZ guidance with readiness answer 2 "yes" (F30; HEALTH_SAFETY section 5, NN-09; re-check V18)', () => {
  // guidanceShown on the Drinks screen and its GuidanceCard, whichever set the profile picks.
  it.each(['female', 'male'] as const)(
    'the pregnancy line replaces every figure, and nothing is compared with a figure (%s profile)',
    async (sex) => {
      test = await drinksFixture({
        answers: { q2: 'yes' },
        profile: { sex },
        seed: (t) =>
          logAt(
            t,
            Array.from({ length: 8 }, () => nz('2000-03-01', 12)),
          ),
      });
      await renderDrinks();
      const summary = region(a.summary.cardLabel);
      await waitFor(() => {
        expect(summary.textContent).toContain('8 drinks · 10.41 std');
      });
      expect(summary.textContent).not.toContain(a.summary.dayAbove);
      expect(summary.textContent).not.toContain(a.summary.weekAbove);
      const card = region(a.guidance.cardLabel);
      for (const region_ of [summary, card]) {
        expect(within(region_).getByTestId('drinks-guidance').textContent).toBe(
          a.guidance.pregnancy,
        );
      }
      const screenText = screen.getByTestId('drinks-screen').textContent;
      expect(screenText).not.toMatch(/standard drinks a day|\d+ a week|single occasion/);
      for (const basis of Object.values(a.guidance.basis.profile))
        expect(screenText).not.toContain(basis);
      // The line kept from the week-1 fixes: no sudden stop for someone who drinks most days (V19).
      expect(a.guidance.pregnancy).toContain('stopping suddenly can be risky');
    },
  );
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
  it('C05: a note with text and no tick brings up no card', async () => {
    test = await drinksFixture();
    await renderDrinks();
    const note = region(a.dayNote.cardLabel);
    type(field(a.dayNote.noteLabel, note), 'Synthetic note: slept badly');
    fireEvent.click(button(a.dayNote.save, note));
    expect(await within(note).findByText(a.dayNote.saved)).toBeDefined();
    expect(await test.repos.alcoholDayNotes.list()).toHaveLength(1);
    expect(screen.queryByRole('region', { name: a.helpCardLabel })).toBeNull();
  });

  it('a day still to come is refused and nothing is stored', async () => {
    test = await drinksFixture();
    await renderDrinks();
    const note = region(a.dayNote.cardLabel);
    type(field(a.dayNote.dayLabel, note), '2000-03-02');
    fireEvent.click(within(note).getByRole('checkbox', { name: a.dayNote.withdrawalTick }));
    fireEvent.click(button(a.dayNote.save, note));
    expect(await within(note).findByText(a.dayNote.errors.future)).toBeDefined();
    expect(await test.repos.alcoholDayNotes.list()).toEqual([]);
  });

  it('F18: picking another day keeps what was typed; a day with a saved note is opened only when asked', async () => {
    test = await drinksFixture({
      seed: (t) =>
        t.repos.alcoholDayNotes.create({
          date: '2000-02-27',
          note: 'Earlier note',
          withdrawalTick: false,
        }),
    });
    await renderDrinks();
    const note = region(a.dayNote.cardLabel);
    type(field(a.dayNote.noteLabel, note), 'Synthetic note: headache');
    fireEvent.click(within(note).getByRole('checkbox', { name: a.dayNote.withdrawalTick }));
    type(field(a.dayNote.dayLabel, note), '2000-02-29');
    expect(field(a.dayNote.dayLabel, note)).toHaveProperty('value', '2000-02-29');
    expect(field(a.dayNote.noteLabel, note)).toHaveProperty('value', 'Synthetic note: headache');
    expect(within(note).getByRole('checkbox', { name: a.dayNote.withdrawalTick })).toHaveProperty(
      'checked',
      true,
    );
    type(field(a.dayNote.dayLabel, note), '2000-02-27');
    fireEvent.click(button(a.dayNote.replaceNo, note));
    expect(field(a.dayNote.dayLabel, note)).toHaveProperty('value', '2000-02-29');
    expect(field(a.dayNote.noteLabel, note)).toHaveProperty('value', 'Synthetic note: headache');
    type(field(a.dayNote.dayLabel, note), '2000-02-27');
    fireEvent.click(button(a.dayNote.replaceYes, note));
    expect(field(a.dayNote.noteLabel, note)).toHaveProperty('value', 'Earlier note');
  });

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
      // Said only when there are entries to keep (full review of item 28, F20).
      expect(screen.queryByText(a.access.kept) !== null).toBe(drinks);
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
