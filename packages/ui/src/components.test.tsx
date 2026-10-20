import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { createRef } from 'react';
import { afterEach, beforeEach, describe, expect, expectTypeOf, it, vi } from 'vitest';
import {
  ActionRow,
  AppShell,
  applyTheme,
  Banner,
  BarChart,
  BowlIcon,
  Button,
  ButtonRow,
  CameraView,
  Card,
  Checkbox,
  CheckList,
  Chip,
  ChoiceList,
  currentThemePreference,
  DayBar,
  FastMeter,
  FloatingActionButton,
  FloatingActionPanel,
  IconButton,
  IconLink,
  MeterBar,
  meterRects,
  OFFLINE_LABEL,
  OFFLINE_NOT_READY_LABEL,
  Notice,
  OfflineIndicator,
  ONLINE_LABEL,
  SegmentedControl,
  SelectField,
  StatTile,
  StepFrame,
  Stepper,
  Switch,
  TabBar,
  TagList,
  TextArea,
  TextField,
  TodayIcon,
  TrendChart,
  type TabItem,
  type TrendChartProps,
} from './index';
import componentsCss from './styles/components.css?raw';
import tokensCss from './styles/tokens.css?raw';

const TABS: readonly TabItem[] = [
  { id: 'today', label: 'Today', href: '#/today', icon: <TodayIcon /> },
  { id: 'food', label: 'Food', href: '#/food', icon: <TodayIcon /> },
  { id: 'move', label: 'Move', href: '#/move', icon: <TodayIcon /> },
  { id: 'drinks', label: 'Drinks', href: '#/drinks', icon: <TodayIcon /> },
  { id: 'list', label: 'List', href: '#/list', icon: <TodayIcon /> },
];

let online = true;
beforeEach(() => {
  online = true;
  vi.spyOn(window.navigator, 'onLine', 'get').mockImplementation(() => online);
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  document.head.innerHTML = '';
  document.documentElement.removeAttribute('data-theme');
});

function goOffline(): void {
  online = false;
  act(() => {
    window.dispatchEvent(new Event('offline'));
  });
}

function goOnline(): void {
  online = true;
  act(() => {
    window.dispatchEvent(new Event('online'));
  });
}

describe('OfflineIndicator', () => {
  it('flips between "Online" and "Offline, all saved" with the online and offline events', () => {
    render(<OfflineIndicator offlineReady />);
    const pill = screen.getByRole('status');
    expect(pill).toHaveProperty('textContent', ONLINE_LABEL);

    goOffline();
    expect(pill).toHaveProperty('textContent', OFFLINE_LABEL);
    expect(OFFLINE_LABEL).toBe('Offline, all saved');

    goOnline();
    expect(pill).toHaveProperty('textContent', ONLINE_LABEL);
  });

  it('starts offline when the browser already reports no connection', () => {
    online = false;
    render(<OfflineIndicator offlineReady />);
    expect(screen.getByRole('status').textContent).toBe(OFFLINE_LABEL);
  });

  it('says only "Offline" while the offline copy of the app is not saved yet', () => {
    online = false;
    const { rerender } = render(<OfflineIndicator offlineReady={false} />);
    expect(screen.getByRole('status').textContent).toBe(OFFLINE_NOT_READY_LABEL);
    expect(OFFLINE_NOT_READY_LABEL).toBe('Offline');
    rerender(<OfflineIndicator offlineReady />);
    expect(screen.getByRole('status').textContent).toBe(OFFLINE_LABEL);
  });
});

describe('TabBar', () => {
  it('marks only the current tab with aria-current="page"', () => {
    render(<TabBar items={TABS} current="drinks" />);
    const nav = screen.getByRole('navigation', { name: 'Main' });
    const links = within(nav).getAllByRole('link');
    expect(links.map((l) => l.textContent)).toEqual(['Today', 'Food', 'Move', 'Drinks', 'List']);
    expect(links.map((l) => l.getAttribute('aria-current'))).toEqual([
      null,
      null,
      null,
      'page',
      null,
    ]);
    expect(within(nav).getByRole('link', { name: 'Drinks' }).getAttribute('href')).toBe('#/drinks');
  });

  it('marks no tab on a screen that is not a tab', () => {
    render(<TabBar items={TABS} current={undefined} />);
    for (const link of screen.getAllByRole('link')) {
      expect(link.hasAttribute('aria-current')).toBe(false);
    }
  });

  it('hands a plain tap to onSelect instead of following the link; a modified click follows it', () => {
    const onSelect = vi.fn();
    render(<TabBar items={TABS} current="today" onSelect={onSelect} />);
    const food = screen.getByRole('link', { name: 'Food' });
    expect(fireEvent.click(food)).toBe(false);
    expect(onSelect).toHaveBeenCalledWith('food');
    expect(fireEvent.click(food, { ctrlKey: true })).toBe(true);
    expect(onSelect).toHaveBeenCalledOnce();
  });
});

describe('icon-only controls carry an accessible name', () => {
  it('IconButton, IconLink and the floating button use their label as aria-label', () => {
    const onClick = vi.fn();
    render(
      <>
        <IconButton label="Dismiss" icon={<TodayIcon />} onClick={onClick} />
        <IconLink label="Settings" href="#/settings" icon={<TodayIcon />} current="page" />
        <FloatingActionButton label="Quick actions" />
      </>,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Dismiss' }));
    expect(onClick).toHaveBeenCalledOnce();
    expect(screen.getByRole('link', { name: 'Settings' }).getAttribute('aria-current')).toBe(
      'page',
    );
    expect(screen.getByRole('button', { name: 'Quick actions' })).toBeDefined();
    for (const control of [...screen.getAllByRole('button'), ...screen.getAllByRole('link')]) {
      expect(control.getAttribute('aria-label')).toMatch(/\S/);
      expect(control.querySelector('svg')?.getAttribute('aria-hidden')).toBe('true');
    }
  });

  it('buttons never submit a form by accident', () => {
    render(
      <>
        <Button>Text</Button>
        <IconButton label="Icon" icon={<TodayIcon />} />
        <FloatingActionButton label="Plus" />
      </>,
    );
    for (const button of screen.getAllByRole('button')) {
      expect(button.getAttribute('type')).toBe('button');
    }
  });
});

describe('AppShell', () => {
  it('shows the screen name, the offline pill, the settings gear and the tab bar', () => {
    render(
      <AppShell
        title="Food"
        tabs={TABS}
        currentTab="food"
        settingsHref="#/settings"
        offlineReady
        banners={<Banner title="Update available" />}
        floatingAction={<FloatingActionButton label="Quick actions" />}
      >
        <p>Screen content</p>
      </AppShell>,
    );
    expect(screen.getByRole('heading', { level: 1, name: 'Food' })).toBeDefined();
    expect(screen.getByRole('banner').textContent).toContain(ONLINE_LABEL);
    expect(screen.getByRole('link', { name: 'Settings' }).hasAttribute('aria-current')).toBe(false);
    expect(within(screen.getByRole('main')).getByText('Screen content')).toBeDefined();
    expect(within(screen.getByRole('main')).getByText('Update available')).toBeDefined();
    expect(screen.getByRole('link', { name: 'Food' }).getAttribute('aria-current')).toBe('page');
    expect(screen.getByRole('button', { name: 'Quick actions' })).toBeDefined();
    expect(document.querySelector('.ui-shell')?.classList.contains('ui-shell--with-fab')).toBe(
      true,
    );
    expect(screen.getByRole('heading', { level: 1 }).getAttribute('tabindex')).toBe('-1');
  });

  it('leaves no extra room at the bottom without a floating button', () => {
    render(
      <AppShell title="Food" tabs={TABS} currentTab="food" settingsHref="#/s" offlineReady>
        <p>Screen</p>
      </AppShell>,
    );
    expect(document.querySelector('.ui-shell')?.className).toBe('ui-shell');
  });

  it('marks the gear as the current page on Settings, and only as its section below it', () => {
    const { rerender } = render(
      <AppShell
        title="Settings"
        tabs={TABS}
        currentTab={undefined}
        settingsHref="#/settings"
        settingsCurrent="page"
        offlineReady
      >
        <p>Screen</p>
      </AppShell>,
    );
    const gear = () => screen.getByRole('link', { name: 'Settings' });
    expect(gear().getAttribute('aria-current')).toBe('page');
    rerender(
      <AppShell
        title="About"
        tabs={TABS}
        currentTab={undefined}
        settingsHref="#/settings"
        settingsCurrent="section"
        offlineReady
      >
        <p>Screen</p>
      </AppShell>,
    );
    expect(gear().getAttribute('aria-current')).toBe('true');
  });

  it('flips the top-bar pill when the connection drops', () => {
    render(
      <AppShell
        title="Today"
        tabs={TABS}
        currentTab="today"
        settingsHref="#/settings"
        offlineReady={false}
      >
        <p>Screen</p>
      </AppShell>,
    );
    goOffline();
    expect(screen.getByRole('banner').textContent).toContain(OFFLINE_NOT_READY_LABEL);
    expect(screen.getByRole('banner').textContent).not.toContain(OFFLINE_LABEL);
    expect(screen.getByRole('link', { name: 'Settings' }).hasAttribute('aria-current')).toBe(false);
  });
});

describe('FloatingActionPanel', () => {
  function renderPanel() {
    render(
      <>
        <p>Outside</p>
        <FloatingActionPanel label="Quick actions">
          <p>Panel text</p>
          <button type="button">Inside</button>
        </FloatingActionPanel>
      </>,
    );
    return screen.getByRole('button', { name: 'Quick actions' });
  }

  it('opens the panel after the "+" in the page and closes it again on a second tap', () => {
    const plus = renderPanel();
    expect(plus.getAttribute('aria-expanded')).toBe('false');
    fireEvent.click(plus);
    expect(plus.getAttribute('aria-expanded')).toBe('true');
    const panel = document.getElementById(plus.getAttribute('aria-controls') ?? '');
    expect(panel?.textContent).toContain('Panel text');
    expect(plus.compareDocumentPosition(panel as Node) & Node.DOCUMENT_POSITION_FOLLOWING).toBe(
      Node.DOCUMENT_POSITION_FOLLOWING,
    );
    fireEvent.click(plus);
    expect(plus.getAttribute('aria-expanded')).toBe('false');
  });

  it('closes on Escape and returns focus to the "+"', () => {
    const plus = renderPanel();
    fireEvent.click(plus);
    screen.getByRole('button', { name: 'Inside' }).focus();
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(plus.getAttribute('aria-expanded')).toBe('false');
    expect(document.activeElement).toBe(plus);
  });

  it('closes on a tap outside, but not on a tap inside the panel', () => {
    const plus = renderPanel();
    fireEvent.click(plus);
    fireEvent.pointerDown(screen.getByRole('button', { name: 'Inside' }));
    expect(plus.getAttribute('aria-expanded')).toBe('true');
    fireEvent.pointerDown(screen.getByText('Outside'));
    expect(plus.getAttribute('aria-expanded')).toBe('false');
    expect(document.activeElement).toBe(plus);
  });

  it('closes when the screen changes', () => {
    const plus = renderPanel();
    fireEvent.click(plus);
    act(() => {
      window.dispatchEvent(new HashChangeEvent('hashchange'));
    });
    expect(plus.getAttribute('aria-expanded')).toBe('false');
  });
});

describe('Card, Banner and ActionRow', () => {
  it('a card is a region named by its section label', () => {
    render(
      <Card label="Weight">
        <p>Body</p>
      </Card>,
    );
    const region = screen.getByRole('region', { name: 'Weight' });
    expect(within(region).getByRole('heading', { level: 2, name: 'Weight' })).toBeDefined();
    expect(within(region).getByText('Body')).toBeDefined();
  });

  it('a banner is a polite status message with its actions', () => {
    const onReload = vi.fn();
    render(
      <Banner
        title="Update available"
        actions={
          <Button variant="primary" onClick={onReload}>
            Reload
          </Button>
        }
      />,
    );
    const status = screen.getByRole('status');
    expect(status.textContent).toContain('Update available');
    fireEvent.click(within(status).getByRole('button', { name: 'Reload' }));
    expect(onReload).toHaveBeenCalledOnce();
  });

  it('an action row is one link named by its title and detail', () => {
    render(
      <ActionRow href="tel:111" title="Emergency" detail="111" badge="111" tone="emergency" />,
    );
    const link = screen.getByRole('link', { name: 'Emergency 111' });
    expect(link.getAttribute('href')).toBe('tel:111');
    expect(link.className).toContain('ui-action-row--emergency');
  });
});

/**
 * Resolves a computed length in px. jsdom applies stylesheets but does not resolve var() or
 * calc(), so this does both for the simple forms the stylesheet uses.
 */
function resolvedPx(element: Element, property: string): number {
  const style = getComputedStyle(element);
  const resolveVars = (value: string): string =>
    value.replace(/var\((--[\w-]+)\)/g, (_, name: string) =>
      resolveVars(style.getPropertyValue(name).trim()),
    );
  const value = resolveVars(style.getPropertyValue(property).trim());
  const calc = /^calc\((.*)\)$/.exec(value)?.[1] ?? value;
  const terms = calc.match(/[+-]?\s*\d+(?:\.\d+)?px/g);
  if (terms === null) throw new Error(`${property} is not a px length: ${value}`);
  return terms.reduce((sum, term) => sum + Number(term.replace(/\s|px/g, '')), 0);
}

describe('tap targets are at least 48 px (UX_SCREENS.md design rules)', () => {
  beforeEach(() => {
    const style = document.createElement('style');
    style.textContent = `${tokensCss}\n${componentsCss}`;
    document.head.append(style);
  });

  it('every button, icon control, tab and row has a min-height and min-width of 48 px or more', () => {
    render(
      <>
        <Button>Text button</Button>
        <Button variant="quiet">Quiet</Button>
        <IconButton label="Icon button" icon={<TodayIcon />} />
        <IconLink label="Icon link" href="#/x" icon={<TodayIcon />} />
        <FloatingActionButton label="Floating" />
        <TabBar items={TABS} current="today" />
        <ActionRow href="tel:111" title="Row" badge="1" />
      </>,
    );
    const controls = [...screen.getAllByRole('button'), ...screen.getAllByRole('link')];
    expect(controls).toHaveLength(11);
    for (const control of controls) {
      const name = control.getAttribute('aria-label') ?? control.textContent;
      expect(resolvedPx(control, 'min-height'), `${name} height`).toBeGreaterThanOrEqual(48);
      if (!control.classList.contains('ui-action-row')) {
        expect(resolvedPx(control, 'min-width'), `${name} width`).toBeGreaterThanOrEqual(48);
      }
    }
  });

  it('the size token itself is 48 px', () => {
    expect(getComputedStyle(document.documentElement).getPropertyValue('--size-tap').trim()).toBe(
      '48px',
    );
  });
});

describe('applyTheme', () => {
  it('sets data-theme on <html> for light or dark, and removes it to follow the phone', () => {
    expect(currentThemePreference()).toBe('system');
    applyTheme('dark');
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
    expect(currentThemePreference()).toBe('dark');
    applyTheme('light');
    expect(currentThemePreference()).toBe('light');
    applyTheme('system');
    expect(document.documentElement.hasAttribute('data-theme')).toBe(false);
  });
});

describe('form controls (the Backup and data card)', () => {
  it('TextField labels its input and announces its hint and error', () => {
    render(
      <TextField
        label="Password"
        type="password"
        autoComplete="new-password"
        hint="At least 10 characters."
        error="The password needs at least 10 characters."
        value=""
        onChange={() => undefined}
      />,
    );
    const input = screen.getByLabelText('Password');
    expect(input.getAttribute('autocomplete')).toBe('new-password');
    expect(input.getAttribute('aria-invalid')).toBe('true');
    const described = (input.getAttribute('aria-describedby') ?? '').split(' ');
    expect(described).toHaveLength(2);
    expect(described.map((id) => document.getElementById(id)?.textContent)).toEqual([
      'At least 10 characters.',
      'The password needs at least 10 characters.',
    ]);
    expect(screen.getByRole('alert').textContent).toBe(
      'The password needs at least 10 characters.',
    );
  });

  it('TextField without a hint or error has no description and is not marked invalid', () => {
    render(<TextField label="Name" value="" onChange={() => undefined} />);
    const input = screen.getByLabelText('Name');
    expect(input.hasAttribute('aria-describedby')).toBe(false);
    expect(input.hasAttribute('aria-invalid')).toBe(false);
  });

  it('Switch is a labelled checkbox with role="switch" that reports its new state', () => {
    const onChange = vi.fn();
    render(<Switch label="Lock the file with a password" checked onChange={onChange} />);
    const control = screen.getByRole('switch', { name: 'Lock the file with a password' });
    expect((control as HTMLInputElement).checked).toBe(true);
    fireEvent.click(control);
    expect(onChange).toHaveBeenCalledWith(false);
  });

  it('Notice and ButtonRow render their content, with the role asked for', () => {
    render(
      <>
        <Notice role="alert">
          <p>Example refusal</p>
        </Notice>
        <ButtonRow>
          <Button>One</Button>
          <Button>Two</Button>
        </ButtonRow>
      </>,
    );
    expect(screen.getByRole('alert').textContent).toBe('Example refusal');
    expect(screen.getByRole('alert').className).toContain('ui-notice--amber');
    expect(screen.getAllByRole('button').map((b) => b.textContent)).toEqual(['One', 'Two']);
  });

  it('a caution button (an action that cannot be undone) is drawn apart from primary and secondary buttons', () => {
    render(
      <ButtonRow>
        <Button variant="primary">Cancel</Button>
        <Button variant="caution">Delete everything</Button>
      </ButtonRow>,
    );
    const [primary, caution] = screen.getAllByRole('button');
    expect(caution?.className).toContain('ui-button--caution');
    expect(caution?.className).not.toContain('ui-button--primary');
    expect(primary?.className).toContain('ui-button--primary');
  });

  it('the new controls use only colour tokens', () => {
    for (const selector of [
      '.ui-field__input',
      '.ui-switch__track',
      '.ui-notice--amber',
      '.ui-button--caution',
      '.ui-progress',
      '.ui-button--on-amber',
      '.ui-button--on-amber-outline',
      '.ui-fast-meter',
      '.ui-fast-meter__fill',
      '.ui-fast-meter__window',
      '.ui-split-row__amber',
    ]) {
      const rule = componentsCss.slice(componentsCss.indexOf(`${selector} {`));
      const body = rule.slice(0, rule.indexOf('}'));
      expect(body, selector).not.toMatch(/#[0-9a-f]{3,8}\b|rgba?\(/i);
      expect(body, selector).toMatch(/var\(--color-/);
    }
  });
});

describe('first-run components (item 13; K19)', () => {
  beforeEach(() => {
    const style = document.createElement('style');
    style.textContent = `${tokensCss}\n${componentsCss}`;
    document.head.append(style);
  });

  it('StepFrame: one h1, the step text, and the help link on its own row; no tab bar or gear', () => {
    render(
      <StepFrame
        stepLabel="Step 2 of 6"
        bars={['done', 'current', 'todo', 'todo', 'todo', 'todo']}
        heading="A safety note"
        offlineReady
        headerLink={<a href="#/about">Help numbers and About</a>}
        footer={<Button variant="primary">I understand</Button>}
      >
        <p>Body</p>
      </StepFrame>,
    );
    expect(screen.getAllByRole('heading', { level: 1 }).map((h) => h.textContent)).toEqual([
      'A safety note',
    ]);
    const header = screen.getByRole('banner');
    expect(within(header).getByText('Step 2 of 6')).toBeDefined();
    expect(header.querySelector('.ui-steps__bars')?.getAttribute('aria-hidden')).toBe('true');
    expect(header.querySelectorAll('.ui-steps__bar--done')).toHaveLength(1);
    const link = within(header).getByRole('link', { name: 'Help numbers and About' });
    expect(link.closest('.ui-steps__link')).not.toBeNull();
    expect(link.closest('.ui-steps__row')).toBeNull();
    expect(screen.queryByRole('navigation')).toBeNull();
    expect(screen.queryByRole('link', { name: 'Settings' })).toBeNull();
    expect(screen.getByRole('main').textContent).toContain('Body');
  });

  it('ChoiceList: a radio group named by its legend; nothing chosen for null; arrows move; the error is announced', () => {
    const onChange = vi.fn();
    const first = createRef<HTMLInputElement>();
    const options = [
      { value: '22:2', label: '22:2', detail: 'Eat 5:00 pm – 7:00 pm' },
      { value: '23:1', label: '23:1', chip: 'Kickstart' },
    ];
    const { rerender } = render(
      <ChoiceList
        legend="Choose a pattern"
        name="pattern"
        options={options}
        value={null}
        onChange={onChange}
        error="Choose a pattern, or No fasting plan for now."
        firstInputRef={first}
      />,
    );
    const group = screen.getByRole('radiogroup', { name: 'Choose a pattern' });
    const radios = within(group).getAllByRole<HTMLInputElement>('radio');
    expect(radios.map((r) => r.checked)).toEqual([false, false]);
    expect(first.current).toBe(radios[0]);
    expect(radios[1]?.closest('label')?.textContent).toContain('Kickstart');
    const alert = screen.getByRole('alert');
    expect(alert.textContent).toBe('Choose a pattern, or No fasting plan for now.');
    expect(group.getAttribute('aria-describedby')).toBe(alert.id);
    fireEvent.click(radios[1] as HTMLInputElement);
    expect(onChange).toHaveBeenLastCalledWith('23:1');
    rerender(
      <ChoiceList
        legend="Choose a pattern"
        name="pattern"
        options={options}
        value="23:1"
        onChange={onChange}
        firstInputRef={first}
      />,
    );
    expect(first.current?.value).toBe('23:1');
    fireEvent.keyDown(first.current as HTMLInputElement, { key: 'ArrowDown' });
    expect(onChange).toHaveBeenLastCalledWith('22:2');
    fireEvent.keyDown(first.current as HTMLInputElement, { key: 'ArrowUp' });
    expect(onChange).toHaveBeenLastCalledWith('22:2');
  });

  it('CheckList, Stepper, DayBar and TagList', () => {
    const onTicks = vi.fn();
    const onCount = vi.fn();
    const onRemove = vi.fn();
    render(
      <>
        <CheckList
          legend="Allergens to avoid"
          options={[
            { value: 'milk', label: 'Milk' },
            { value: 'egg', label: 'Egg' },
          ]}
          values={['egg']}
          onChange={onTicks}
        />
        <Stepper
          label="People"
          value={1}
          min={1}
          max={20}
          onChange={onCount}
          decreaseLabel="One fewer person"
          increaseLabel="One more person"
        />
        <DayBar segments={[{ startPct: 75, widthPct: 4.17 }]} labels={['12 am', '12 pm']} />
        <TagList
          items={[{ key: 'liver', label: 'liver', removeLabel: 'Remove liver' }]}
          onRemove={onRemove}
        />
      </>,
    );
    fireEvent.click(screen.getByRole('checkbox', { name: 'Milk' }));
    expect(onTicks).toHaveBeenCalledWith(['milk', 'egg']);
    expect(screen.getByRole('button', { name: 'One fewer person' }).hasAttribute('disabled')).toBe(
      true,
    );
    fireEvent.click(screen.getByRole('button', { name: 'One more person' }));
    expect(onCount).toHaveBeenCalledWith(2);
    const output = screen.getByRole('group', { name: 'People' }).querySelector('output');
    expect(output?.getAttribute('aria-live')).toBe('polite');
    expect(output?.textContent).toBe('1');
    expect(document.querySelector('.ui-daybar')?.getAttribute('aria-hidden')).toBe('true');
    fireEvent.click(screen.getByRole('button', { name: 'Remove liver' }));
    expect(onRemove).toHaveBeenCalledWith('liver');
  });

  it('DayBar sets each time under its own hour, and marks every other one to leave out when narrow', () => {
    render(
      <DayBar
        segments={[{ startPct: 70.8, widthPct: 8.3 }]}
        labels={['12 am', '6 am', '12 pm', '6 pm', '12 am']}
      />,
    );
    const labels = Array.from(document.querySelectorAll<HTMLElement>('.ui-daybar__label'));
    expect(labels.map((l) => l.style.left)).toEqual(['0%', '25%', '50%', '75%', '100%']);
    expect(labels.map((l) => l.classList.contains('ui-daybar__label--minor'))).toEqual([
      false,
      true,
      false,
      true,
      false,
    ]);
  });

  it('TextField: an action sits on the input row, a shared error marks the field and describes it', () => {
    render(
      <>
        <TextField label="Foods" hint="One at a time." action={<Button>Add</Button>} />
        <TextField label="First bite" sharedErrorId="window-error" />
        <p id="window-error">The first and last bite need different times.</p>
      </>,
    );
    const row = screen.getByLabelText('Foods').parentElement;
    expect(row?.className).toBe('ui-field__control');
    expect(row?.contains(screen.getByRole('button', { name: 'Add' }))).toBe(true);
    expect(row?.contains(screen.getByText('One at a time.'))).toBe(false);
    const field = screen.getByLabelText('First bite');
    expect(field.getAttribute('aria-invalid')).toBe('true');
    expect(field.getAttribute('aria-describedby')).toBe('window-error');
  });

  it('Switch with a hint ties it by aria-describedby; Switch and TextField forward their ref', () => {
    const switchRef = createRef<HTMLInputElement>();
    const fieldRef = createRef<HTMLInputElement>();
    render(
      <>
        <Switch
          label="I get reflux"
          hint="The app will suggest an earlier dinner."
          checked={false}
          onChange={() => undefined}
          ref={switchRef}
        />
        <TextField label="Height (cm)" value="" onChange={() => undefined} ref={fieldRef} />
      </>,
    );
    const control = screen.getByRole('switch', { name: 'I get reflux' });
    const hintId = control.getAttribute('aria-describedby') ?? '';
    expect(document.getElementById(hintId)?.textContent).toBe(
      'The app will suggest an earlier dinner.',
    );
    expect(switchRef.current).toBe(control);
    expect(fieldRef.current).toBe(screen.getByLabelText('Height (cm)'));
  });

  it('every new control is at least 48 px (choice rows 58 px), using only colour tokens', () => {
    render(
      <>
        <ChoiceList
          legend="L"
          name="n"
          options={[{ value: 'a', label: 'A' }]}
          value="a"
          onChange={() => undefined}
        />
        <CheckList
          legend="C"
          options={[{ value: 'b', label: 'B' }]}
          values={[]}
          onChange={() => undefined}
        />
        <Stepper
          label="S"
          value={2}
          min={1}
          max={3}
          onChange={() => undefined}
          decreaseLabel="Less"
          increaseLabel="More"
        />
        <TagList
          items={[{ key: 'k', label: 'k', removeLabel: 'Remove k' }]}
          onRemove={() => undefined}
        />
      </>,
    );
    const choice = document.querySelector('.ui-choice') as Element;
    expect(resolvedPx(choice, 'min-height')).toBeGreaterThanOrEqual(58);
    const check = document.querySelector('.ui-check') as Element;
    expect(resolvedPx(check, 'min-height')).toBeGreaterThanOrEqual(48);
    for (const button of screen.getAllByRole('button')) {
      expect(resolvedPx(button, 'min-height')).toBeGreaterThanOrEqual(48);
      expect(resolvedPx(button, 'min-width')).toBeGreaterThanOrEqual(48);
    }
    // A pressed Yes or No is drawn with a border, a fill and a tick, not colour alone.
    expect(componentsCss).toContain(".ui-button[aria-pressed='true']::before");
    const block = componentsCss.slice(componentsCss.indexOf('/* ---- First-run steps'));
    expect(block.length).toBeGreaterThan(100);
    expect(block).not.toMatch(/#[0-9a-f]{3,8}\b|rgba?\(/i);
  });
});

describe('the weight chart and inline answers (item 14)', () => {
  const week = Array.from({ length: 7 }, (_, index) => ({ index, value: 100 - index * 0.3 }));
  const chart = (props: Partial<TrendChartProps> = {}) =>
    render(
      <TrendChart
        days={28}
        points={week}
        line={week.slice(2)}
        band={week.map(({ index, value }) => ({ index, low: value - 1, high: value }))}
        todayIndex={6}
        ariaLabel="Chart of your weight over four weeks."
        xLabels={['Week 1', 'Week 2', 'Week 3', 'Week 4']}
        {...props}
      />,
    );

  it('HS-26, WT-10: the band is one unstroked filled path; the drawing holds no text, title or description', () => {
    const { container } = chart();
    const svg = screen.getByRole('img', { name: 'Chart of your weight over four weeks.' });
    const bands = svg.querySelectorAll('.ui-trend-chart__band');
    expect(bands).toHaveLength(1);
    expect(bands[0]?.getAttribute('stroke')).toBe('none');
    expect(svg.querySelectorAll('text, title, desc')).toHaveLength(0);
    expect(svg.textContent).toBe('');
    // The week labels are HTML under the drawing.
    const labels = container.querySelector('.ui-trend-chart__labels');
    expect(labels?.textContent).toBe('Week 1Week 2Week 3Week 4');
    expect(svg.contains(labels)).toBe(false);
  });

  it('a disabled icon button is drawn as off (the weight − and + before there is a weight)', () => {
    const style = document.createElement('style');
    style.textContent = componentsCss;
    document.head.append(style);
    render(<IconButton label="More 0.1 kg" icon={<TodayIcon />} disabled />);
    expect(getComputedStyle(screen.getByRole('button', { name: 'More 0.1 kg' })).opacity).toBe(
      '0.5',
    );
    style.remove();
  });

  it('draws no band when there is none', () => {
    chart({ band: null });
    expect(screen.getByRole('img').querySelector('.ui-trend-chart__band')).toBeNull();
  });

  it('HS-26: nothing can draw a horizontal line, a target or an axis value', () => {
    expectTypeOf<keyof TrendChartProps>().toEqualTypeOf<
      'days' | 'points' | 'line' | 'band' | 'todayIndex' | 'ariaLabel' | 'xLabels' | 'legend'
    >();
  });

  it('W20: a flat series is drawn on a 2 kg span, level across the middle', () => {
    const flat = week.map(({ index }) => ({ index, value: 90 }));
    chart({ points: flat, line: flat, band: null });
    const d =
      screen.getByRole('img').querySelector('.ui-trend-chart__line')?.getAttribute('d') ?? '';
    const ys = [...d.matchAll(/[ML][\d.]+ ([\d.]+)/g)].map((m) => Number(m[1]));
    expect(ys).toHaveLength(7);
    expect(new Set(ys)).toEqual(new Set([52]));
  });

  it('ChoiceList inline: a question in sentence type with answers side by side, none chosen at first; disabled while saving', () => {
    const onChange = vi.fn();
    const options = [
      { value: 'yes', label: 'Yes' },
      { value: 'no', label: 'No' },
    ];
    const { rerender } = render(
      <ChoiceList
        layout="inline"
        legend="Feeling faint?"
        name="faint"
        options={options}
        value={null}
        onChange={onChange}
        hint="Answer each one."
      />,
    );
    const group = screen.getByRole('radiogroup', { name: 'Feeling faint?' });
    expect(group.tagName).toBe('FIELDSET');
    expect(group.classList.contains('ui-choices--inline')).toBe(true);
    expect(group.getAttribute('aria-describedby')).not.toBeNull();
    const radios = within(group).getAllByRole('radio');
    expect(radios.map((r) => (r as HTMLInputElement).checked)).toEqual([false, false]);
    expect(new Set(radios.map((r) => r.getAttribute('name')))).toEqual(new Set(['faint']));
    fireEvent.click(screen.getByRole('radio', { name: 'No' }));
    expect(onChange).toHaveBeenCalledWith('no');
    rerender(
      <ChoiceList
        layout="inline"
        legend="Feeling faint?"
        name="faint"
        options={options}
        value="no"
        onChange={onChange}
        disabled
      />,
    );
    expect(screen.getByRole<HTMLInputElement>('radio', { name: 'No' }).checked).toBe(true);
    for (const radio of screen.getAllByRole<HTMLInputElement>('radio')) {
      expect(radio.matches(':disabled')).toBe(true);
    }
  });

  it('answers are at least 48 px; a stat with no figure is smaller and in the secondary colour', () => {
    const style = document.createElement('style');
    style.textContent = `${tokensCss}\n${componentsCss}`;
    document.head.append(style);
    render(
      <ChoiceList
        layout="inline"
        legend="Q"
        name="q"
        options={[{ value: 'a', label: 'A' }]}
        value={null}
        onChange={() => undefined}
      />,
    );
    // Inside its 1 px border (2 px when chosen) the answer is still at least 48 px each way.
    const answer = document.querySelector('.ui-choices--inline .ui-choice');
    expect(answer === null ? 0 : resolvedPx(answer, 'min-height')).toBeGreaterThanOrEqual(52);
    expect(answer === null ? 0 : resolvedPx(answer, 'min-width')).toBeGreaterThanOrEqual(52);
    const rule = (selector: string) => {
      const at = componentsCss.indexOf(`${selector} {`);
      return componentsCss.slice(at, componentsCss.indexOf('}', at));
    };
    expect(rule('.ui-stat__value--empty')).toContain('font-size: 15px');
    expect(rule('.ui-stat__value--empty')).toContain('var(--color-secondary)');
    expect(rule('.ui-stat__value')).toContain('font-size: 24px');
    for (const selector of [
      '.ui-pill--teal',
      '.ui-note',
      '.ui-trend-chart__band',
      '.ui-stat__label',
    ]) {
      expect(rule(selector), selector).not.toMatch(/#[0-9a-f]{3,8}\b|rgba?\(/i);
      expect(rule(selector), selector).toMatch(/var\(--color-/);
    }
  });
});

describe('the Fast card pieces (item 15; mock-up Main)', () => {
  it('FastMeter is decorative: teal progress, the eating window at its place, all amber past 24 hours', () => {
    const { container, rerender } = render(
      <FastMeter progressPct={3.125} window={{ startPct: 95.833, widthPct: 4.167 }} over={false} />,
    );
    const meter = container.querySelector('.ui-fast-meter');
    expect(meter?.getAttribute('aria-hidden')).toBe('true');
    expect(meter?.className).toBe('ui-fast-meter');
    expect(container.querySelector<HTMLElement>('.ui-fast-meter__fill')?.style.width).toBe(
      '3.125%',
    );
    const window = container.querySelector<HTMLElement>('.ui-fast-meter__window');
    expect([window?.style.left, window?.style.width]).toEqual(['95.833%', '4.167%']);
    rerender(<FastMeter progressPct={100} window={{ startPct: 50, widthPct: 10 }} over />);
    expect(container.querySelector('.ui-fast-meter')?.className).toContain('ui-fast-meter--over');
    expect(container.querySelector('.ui-fast-meter__window')).toBeNull();
    expect(componentsCss).toMatch(
      /\.ui-fast-meter--over \.ui-fast-meter__fill \{\s*background: var\(--color-amber-strong\);/,
    );
  });

  it('an amber notice can carry a decorative icon and its own amber buttons', () => {
    render(
      <Notice
        icon={<BowlIcon />}
        actions={
          <ButtonRow>
            <Button variant="on-amber">Add</Button>
            <Button variant="on-amber-outline">Not now</Button>
          </ButtonRow>
        }
      >
        <p>Example meal check</p>
      </Notice>,
    );
    const [add, notNow] = screen.getAllByRole('button');
    expect(add?.className).toContain('ui-button--on-amber');
    expect(notNow?.className).toContain('ui-button--on-amber-outline');
    expect(document.querySelector('.ui-notice__icon')?.getAttribute('aria-hidden')).toBe('true');
    expect(document.querySelector('.ui-notice__text')?.textContent).toBe('Example meal check');
  });
});

describe('meters, the select field and chips (item 21; K1 to K3b)', () => {
  const rule = (selector: string) => {
    const at = componentsCss.indexOf(`${selector} {`);
    return componentsCss.slice(at, componentsCss.indexOf('}', at));
  };

  it('K1: a meter reads as its label and value; the bar is decorative, clamped, with a gap between parts', () => {
    const { container, rerender } = render(
      <MeterBar
        label="Energy"
        value="9,500 of 9,100 kJ"
        segments={[
          { fraction: 0.6, tone: 'ink' },
          { fraction: 0.5, tone: 'alcohol' },
        ]}
        state="over"
        notes={['A note']}
      />,
    );
    const meter = container.querySelector('.ui-meter');
    expect(meter?.textContent).toBe('Energy 9,500 of 9,100 kJA note');
    expect(meter?.getAttribute('data-state')).toBe('over');
    const svg = container.querySelector('svg');
    expect(svg?.getAttribute('aria-hidden')).toBe('true');
    const rects = [...container.querySelectorAll('rect')].map((r) => [
      r.getAttribute('x'),
      r.getAttribute('width'),
      r.getAttribute('class'),
    ]);
    expect(rects).toEqual([
      ['0', '60', 'ui-meter__fill ui-meter__fill--ink'],
      ['61', '39', 'ui-meter__fill ui-meter__fill--alcohol'],
    ]);
    expect(meterRects([{ fraction: 2, tone: 'soft' }])).toEqual([
      { x: 0, width: 100, tone: 'soft' },
    ]);
    expect(meterRects([{ fraction: -1, tone: 'soft' }])).toEqual([]);
    rerender(<MeterBar label="Energy" value="9,500 kJ" segments={null} state="over" />);
    expect(container.querySelector('svg')).toBeNull();
    expect(container.querySelector('.ui-meter')?.hasAttribute('data-state')).toBe(false);
    // HS-09: over changes only the soft fill's colour, to the amber token.
    expect(rule(".ui-meter[data-state='over'] .ui-meter__fill--soft")).toContain(
      'var(--color-amber-strong)',
    );
  });

  it('K2: SelectField labels its select, reports a change, and draws an inline chevron in the text colour', () => {
    const onChange = vi.fn();
    render(
      <SelectField
        label="Steady deficit"
        hint="From 15% to 20%."
        value="15"
        options={[
          { value: '15', label: '15%' },
          { value: '20', label: '20%' },
        ]}
        onChange={onChange}
      />,
    );
    const select = screen.getByRole('combobox', { name: 'Steady deficit' });
    expect(
      document.getElementById(select.getAttribute('aria-describedby') ?? '')?.textContent,
    ).toBe('From 15% to 20%.');
    fireEvent.change(select, { target: { value: '20' } });
    expect(onChange).toHaveBeenCalledWith('20');
    const chevron = document.querySelector('.ui-select__chevron');
    expect(chevron?.getAttribute('aria-hidden')).toBe('true');
    expect(chevron?.querySelector('svg')?.getAttribute('stroke')).toBe('currentColor');
    expect(rule('.ui-select__chevron')).toContain('color: var(--color-ink-soft)');
  });

  it('K3b: a chip carries its word, with a class for each tone', () => {
    const { container } = render(
      <>
        <Chip>Label</Chip>
        <Chip tone="neutral">Database</Chip>
        <Chip tone="amber">Estimate</Chip>
      </>,
    );
    expect(
      [...container.querySelectorAll('span')].map((s) => [s.className, s.textContent]),
    ).toEqual([
      ['ui-chip', 'Label'],
      ['ui-chip ui-chip--neutral', 'Database'],
      ['ui-chip ui-chip--amber', 'Estimate'],
    ]);
  });
});

describe('Today pieces (item 16; C13)', () => {
  it('an off action row is a focusable aria-disabled button that does nothing and says why', () => {
    render(
      <>
        <ActionRow title="Finish meal" marker="Later" describedBy="why" />
        <p id="why">Arrives later.</p>
      </>,
    );
    const row = screen.getByRole('button', { name: 'Finish meal' });
    expect(row.getAttribute('aria-disabled')).toBe('true');
    expect(row.hasAttribute('disabled')).toBe(false);
    expect(row.getAttribute('aria-describedby')).toBe('why');
    expect(row.className).toContain('ui-action-row--off');
    const marker = within(row).getByText('Later');
    expect(marker.getAttribute('aria-hidden')).toBe('true');
    row.focus();
    expect(document.activeElement).toBe(row);
    fireEvent.click(row);
    fireEvent.keyDown(row, { key: 'Enter' });
    expect(window.location.hash).toBe('');
  });

  it('an action row with onSelect is a button that runs it; the panel hands its actions a close', () => {
    const select = vi.fn();
    render(
      <FloatingActionPanel label="Quick actions">
        {(close) => (
          <ActionRow
            title="Log weight"
            onSelect={() => {
              select();
              close();
            }}
          />
        )}
      </FloatingActionPanel>,
    );
    const plus = screen.getByRole('button', { name: 'Quick actions' });
    fireEvent.click(plus);
    const row = screen.getByRole('button', { name: 'Log weight' });
    expect(row.hasAttribute('aria-disabled')).toBe(false);
    fireEvent.click(row);
    expect(select).toHaveBeenCalledOnce();
    expect(plus.getAttribute('aria-expanded')).toBe('false');
    // Closing for an action leaves focus to the action, not the "+".
    expect(document.activeElement).not.toBe(plus);
  });

  it('a card heading takes focus from code but not from Tab; a stacked button row', () => {
    const { container } = render(
      <Card label="Water">
        <ButtonRow stacked>
          <Button>Save</Button>
        </ButtonRow>
      </Card>,
    );
    expect(screen.getByRole('heading', { level: 2, name: 'Water' }).tabIndex).toBe(-1);
    expect(container.querySelector('.ui-button-row')?.className).toBe(
      'ui-button-row ui-button-row--stacked',
    );
  });
});

describe('the drinks pieces (item 28; K3)', () => {
  it('TextArea, Checkbox and SegmentedControl are labelled and report changes', () => {
    const typed = vi.fn();
    const ticked = vi.fn();
    const chosen = vi.fn();
    render(
      <>
        <TextArea
          label="Note"
          hint="Optional."
          value=""
          onChange={(e) => {
            typed(e.target.value);
          }}
        />
        <Checkbox label="I felt unwell" checked={false} onChange={ticked} />
        <SegmentedControl
          legend="When"
          options={[
            { value: 'now', label: 'Now' },
            { value: 'earlier', label: 'Earlier' },
          ]}
          value="now"
          onChange={chosen}
        />
      </>,
    );
    const note = screen.getByLabelText('Note');
    expect(note.tagName).toBe('TEXTAREA');
    expect(document.getElementById(note.getAttribute('aria-describedby') ?? '')?.textContent).toBe(
      'Optional.',
    );
    fireEvent.change(note, { target: { value: 'x' } });
    expect(typed).toHaveBeenCalledWith('x');
    fireEvent.click(screen.getByRole('checkbox', { name: 'I felt unwell' }));
    expect(ticked).toHaveBeenCalledWith(true);
    const group = screen.getByRole('group', { name: 'When' });
    expect(within(group).getByRole('radio', { name: 'Now' })).toHaveProperty('checked', true);
    fireEvent.click(within(group).getByRole('radio', { name: 'Earlier' }));
    expect(chosen).toHaveBeenCalledWith('earlier');
  });

  it('StatTile with a spoken value hides the visible figure from screen readers', () => {
    const { container } = render(
      <StatTile label="Today" value="1 drink · 1.30 std" spoken="1 drink, 1.30 standard drinks" />,
    );
    const shown = within(container).getByText('1 drink · 1.30 std');
    expect(shown.getAttribute('aria-hidden')).toBe('true');
    expect(within(container).getByText('1 drink, 1.30 standard drinks').className).toBe(
      'ui-visually-hidden',
    );
  });

  it('BarChart: one bar per value, the line and the dotted reference, and a labelled image; no colour but neutral', () => {
    const { container } = render(
      <BarChart
        label="Standard drinks per week"
        bars={[
          { key: 'a', value: 2, tick: '21 Feb' },
          { key: 'b', value: null },
          { key: 'c', value: 3, partial: true, tick: 'This week' },
        ]}
        line={[null, 2.5, 2.5]}
        lineLabel="4-week average"
        reference={[4, 4, 4]}
        referenceLabel="your milestone"
      />,
    );
    expect(screen.getByRole('img', { name: 'Standard drinks per week' })).toBeDefined();
    expect(container.querySelectorAll('rect')).toHaveLength(2);
    expect(container.querySelectorAll('.ui-bar-chart__bar--partial')).toHaveLength(1);
    expect(container.querySelectorAll('polyline')).toHaveLength(1);
    const dots = container.querySelectorAll('.ui-bar-chart__reference');
    expect(dots).toHaveLength(3);
    expect(dots[0]?.getAttribute('stroke-dasharray')).toBe('0 6');
    expect(container.querySelector('.ui-bar-chart__legend')?.textContent).toBe(
      '4-week averageyour milestone',
    );
    const block = componentsCss.slice(componentsCss.indexOf('/* ---- Item 28'));
    expect(block).not.toMatch(/--color-(?:teal|amber|emergency)/);
  });
});

// Item 30: the camera view of the Laptop pairing screen, and Button's ref for its focus rules.
describe('CameraView and the Button ref (item 30)', () => {
  it('U1: a muted, inline video hidden from screen readers, and a guide shown only while active', () => {
    const videoRef = createRef<HTMLVideoElement>();
    const { rerender } = render(<CameraView videoRef={videoRef} active={false} />);
    const video = videoRef.current;
    expect(video?.tagName).toBe('VIDEO');
    expect(video?.muted).toBe(true);
    expect(video?.hasAttribute('playsinline')).toBe(true);
    expect(video?.getAttribute('aria-hidden')).toBe('true');
    const view = document.querySelector('.ui-camera');
    expect(view?.getAttribute('data-active')).toBe('false');
    expect(componentsCss).toContain(".ui-camera[data-active='false'] .ui-camera__guide {");
    expect(document.querySelector('.ui-camera__guide')?.getAttribute('aria-hidden')).toBe('true');
    rerender(<CameraView videoRef={videoRef} active />);
    expect(view?.getAttribute('data-active')).toBe('true');
  });

  it('U2: a ref passed to Button reaches the button element', () => {
    const ref = createRef<HTMLButtonElement>();
    render(<Button ref={ref}>Example</Button>);
    expect(ref.current).toBe(screen.getByRole('button', { name: 'Example' }));
  });
});
