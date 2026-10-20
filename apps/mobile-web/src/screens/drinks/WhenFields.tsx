/**
 * How many and when, shared by the More panel and the Other drink form (item 28 design 2.3, 2.5;
 * A21). Every field has autocomplete off and no name (D49).
 */
import type { LocalDate } from '@diet/core';
import { alcohol } from '@diet/core/copy/health';
import { SegmentedControl, TextField } from '@diet/ui';
import type { ReactElement } from 'react';
import type { WhenDraft, WhenProblems } from './drinkForm';

const a = alcohol.log;

export function WhenFields({
  draft,
  onChange,
  problems,
  maxDate,
}: {
  readonly draft: WhenDraft;
  readonly onChange: (draft: WhenDraft) => void;
  readonly problems: WhenProblems;
  /** Today's local date: no later date can be chosen. */
  readonly maxDate: LocalDate;
}): ReactElement {
  return (
    <>
      <TextField
        label={a.countLabel}
        inputMode="numeric"
        autoComplete="off"
        value={draft.count}
        error={problems.count}
        onChange={(event) => {
          onChange({ ...draft, count: event.currentTarget.value });
        }}
      />
      <SegmentedControl
        legend={a.whenLabel}
        options={[
          { value: 'now', label: a.now },
          { value: 'earlier', label: a.earlier },
        ]}
        value={draft.when}
        onChange={(when) => {
          onChange({ ...draft, when });
        }}
      />
      {draft.when === 'earlier' ? (
        <div className="ui-field-pair">
          <TextField
            label={a.dateLabel}
            type="date"
            autoComplete="off"
            max={maxDate}
            value={draft.date}
            onChange={(event) => {
              onChange({ ...draft, date: event.currentTarget.value });
            }}
          />
          <TextField
            label={a.timeLabel}
            type="time"
            autoComplete="off"
            value={draft.time}
            error={problems.time}
            onChange={(event) => {
              onChange({ ...draft, time: event.currentTarget.value });
            }}
          />
        </div>
      ) : null}
    </>
  );
}
