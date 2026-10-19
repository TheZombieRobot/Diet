import {
  checkEatingWindowForm,
  dayBarSegments,
  describeEatingWindow,
  FASTING_PRESETS,
  type FastingPresetId,
  fillTemplate,
  formatClockTime,
  presetForWindow,
  presetWindow,
  windowProblemFields,
} from '@diet/core';
import { schedule } from '@diet/core/copy/health';
import { Card, ChoiceList, DayBar, Notice, Switch, TextField } from '@diet/ui';
import { type ReactElement, type ReactNode, type Ref, useId } from 'react';
import type { ScheduleDraft } from '../drafts';

const WINDOW_ERRORS = {
  'invalid-time': schedule.errors.invalidTime,
  'same-time': schedule.errors.sameTime,
  'too-short': schedule.errors.tooShort,
} as const;

function presetDetail(id: FastingPresetId): string {
  const window = presetWindow(id);
  const times = { start: formatClockTime(window.start), end: formatClockTime(window.end) };
  return id === '22:2' || id === '23:1'
    ? fillTemplate(schedule.presetDetailNamed, { name: schedule.presetNames[id], ...times })
    : fillTemplate(schedule.presetDetail, times);
}

export interface ScheduleFormProps {
  /** Settings: no Kickstart note, only the "3 weeks" line under the untouched Kickstart default. */
  readonly mode: 'onboarding' | 'settings';
  readonly draft: ScheduleDraft;
  readonly onDraftChange: (draft: ScheduleDraft) => void;
  /** Kickstart is chosen: 23:1 carries the Kickstart chip. */
  readonly kickstartChosen: boolean;
  /**
   * Who the draft would be recorded as chosen by if saved now (drafts.ts scheduleDraftSavedAs).
   * The Kickstart note ("23:1 for the 3 weeks … 22:2 on any other day") shows only for the
   * untouched Kickstart default, which is the only pattern it is true of (E19).
   */
  readonly savedAs: 'kickstart-default' | 'default' | 'user' | null;
  /** The protein figure in the Kickstart line (C65). */
  readonly proteinG: number;
  /** Answer 4: the pharmacist note above the choices (C07). */
  readonly pharmacistNote: boolean;
  /** Answer 3 yes with the prescriber's agreement (E53). */
  readonly diabetesNote: boolean;
  /** Settings: a Kickstart default stored before answer 4 turned yes, which is not used (C07). */
  readonly kickstartDefaultSetAside?: boolean | undefined;
  /** After a refused Continue or Save. */
  readonly showErrors: boolean;
  readonly listRef?: Ref<HTMLInputElement> | undefined;
  /** The first time field with a problem, for focus after a refused Continue or Save. */
  readonly windowRef?: Ref<HTMLInputElement> | undefined;
  readonly top?: ReactNode;
}

/**
 * The eating schedule (UX 1e; mock-up Schedule; item 13 design section 3.9), at setup and in
 * Settings. The window is always worked out from the clock times by the core formatter (C101,
 * HS-17), and "No fasting plan for now" is always offered (E50).
 */
export function ScheduleForm({
  mode,
  draft,
  onDraftChange,
  kickstartChosen,
  savedAs,
  proteinG,
  pharmacistNote,
  diabetesNote,
  kickstartDefaultSetAside = false,
  showErrors,
  listRef,
  windowRef,
  top,
}: ScheduleFormProps): ReactElement {
  const windowErrorId = useId();
  const set = (patch: Partial<ScheduleDraft>) => {
    onDraftChange({ ...draft, ...patch });
  };
  const window = checkEatingWindowForm(draft.start, draft.end);
  // The time fields the window's message belongs to: marked invalid and described by it.
  const faulty = window.ok ? [] : windowProblemFields(draft.start, draft.end, window.problem);
  const timeField = (field: 'start' | 'end') => {
    const at = faulty.indexOf(field);
    return {
      sharedErrorId: at === -1 ? undefined : windowErrorId,
      ref: at === 0 ? windowRef : undefined,
    };
  };
  const showsTimes = draft.choice !== null && draft.choice !== 'none';
  const options = [
    ...FASTING_PRESETS.map((p) => ({
      value: p.id,
      label: p.id,
      detail: presetDetail(p.id),
      chip: p.id === '23:1' && kickstartChosen ? schedule.kickstartChip : undefined,
    })),
    {
      value: 'custom',
      label: schedule.custom,
      detail:
        draft.choice === 'custom' && window.ok
          ? fillTemplate(schedule.presetDetail, {
              start: formatClockTime(window.window.start),
              end: formatClockTime(window.window.end),
            })
          : undefined,
    },
    { value: 'none', label: schedule.none, detail: schedule.noneDetail },
  ];
  const choose = (value: string) => {
    if (value === 'none') {
      set({ choice: 'none' });
      return;
    }
    if (value === 'custom') {
      set({ choice: 'custom' });
      return;
    }
    const preset = FASTING_PRESETS.find((p) => p.id === value);
    if (preset === undefined) return;
    // Choosing a preset resets the times to its default window.
    set({ choice: preset.id, start: preset.window.start, end: preset.window.end });
  };
  const moveTime = (patch: { start?: string; end?: string }) => {
    const next = { start: patch.start ?? draft.start, end: patch.end ?? draft.end };
    const selected = draft.choice === null || draft.choice === 'none' ? 'custom' : draft.choice;
    set({ ...next, choice: presetForWindow(selected, next) });
  };

  return (
    <div className="ui-card__body">
      {top}
      {mode === 'onboarding' && savedAs === 'kickstart-default' ? (
        <Notice tone="info">
          <p className="ui-text-strong">{schedule.kickstartTitle}</p>
          <p>{schedule.kickstartWhen}</p>
          <p>{fillTemplate(schedule.kickstartLine, { proteinG })}</p>
        </Notice>
      ) : null}
      {mode === 'onboarding' && kickstartChosen && savedAs === 'user' ? (
        <Notice tone="info">
          <p data-testid="schedule-own-pattern">{schedule.ownPattern}</p>
        </Notice>
      ) : null}
      {mode === 'settings' && savedAs === 'kickstart-default' ? (
        <p className="ui-text-muted">{schedule.kickstartWhen}</p>
      ) : null}
      {mode === 'settings' && kickstartDefaultSetAside ? (
        <p className="ui-text-muted">{schedule.kickstartDefaultSetAside}</p>
      ) : null}
      {pharmacistNote ? (
        <Notice>
          <p>{schedule.pharmacistNote}</p>
        </Notice>
      ) : null}
      {diabetesNote ? (
        <Notice>
          <p>{schedule.diabetesNote}</p>
        </Notice>
      ) : null}
      <ChoiceList
        legend={schedule.presetsLegend}
        name="schedule-pattern"
        options={options}
        value={draft.choice}
        onChange={choose}
        error={showErrors && draft.choice === null ? schedule.errors.choosePattern : undefined}
        firstInputRef={listRef}
      />
      {draft.choice === null ? <p className="ui-text-muted">{schedule.chooseFirst}</p> : null}
      {showsTimes ? (
        <Card label={schedule.windowTitle}>
          <div className="ui-field-pair">
            <TextField
              {...timeField('start')}
              label={schedule.startLabel}
              type="time"
              step={60}
              value={draft.start}
              onChange={(event) => {
                moveTime({ start: event.currentTarget.value });
              }}
            />
            <TextField
              {...timeField('end')}
              label={schedule.endLabel}
              type="time"
              step={60}
              value={draft.end}
              onChange={(event) => {
                moveTime({ end: event.currentTarget.value });
              }}
            />
          </div>
          {window.ok ? (
            <>
              <DayBar segments={dayBarSegments(window.window)} labels={schedule.dayBarLabels} />
              <p className="ui-text-lead" data-testid="window-summary">
                {describeEatingWindow(window.window).summary}
              </p>
            </>
          ) : (
            <p id={windowErrorId} className="ui-field__error" role="alert">
              {WINDOW_ERRORS[window.problem]}
            </p>
          )}
          <p className="ui-text-muted">{schedule.neverInsist}</p>
        </Card>
      ) : null}
      <Switch
        label={schedule.refluxLabel}
        hint={schedule.refluxHint}
        checked={draft.reflux}
        onChange={(on) => {
          set({ reflux: on });
        }}
      />
    </div>
  );
}
