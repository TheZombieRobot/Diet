/**
 * Your milestones (HEALTH_SAFETY.md section 5; item 28 design 2.9; HS-19; A15, A16, A47, A50). A
 * milestone is a weekly figure the owner, or their GP or another health professional, chose: the
 * app never suggests, prefills or reacts to one. A new milestone's form starts empty whatever the
 * records hold, and always shows the safety notice and the helpline call, text and 111 above Save,
 * whatever is typed, so help is one tap away while a change is planned. Every row is headed "Your
 * milestone"; the owner's own words appear only underneath, in quotation marks.
 *
 * The only place a milestone is created or changed (the alcoholStructure scan).
 */
import {
  type AlcoholMilestoneRecord,
  fillTemplate,
  isLocalDate,
  MILESTONE_BY_HEALTH_PROFESSIONAL,
  MILESTONE_BY_SELF,
  parseOptionalNumber,
} from '@diet/core';
import { alcohol } from '@diet/core/copy/health';
import { Button, ButtonRow, Card, ChoiceList, Notice, TextArea, TextField } from '@diet/ui';
import { type ReactElement, useId, useState } from 'react';
import type { AppStorage } from '../../db/runtime';
import { formatShortDate, formatStd1 } from '../../format';
import { NoticeHelpRows } from '../../onboarding/NoticeHelpRows';
import { WriteError } from '../today/WriteError';
import { useDrinksWrite } from './useDrinksWrite';
import type { DrinksView } from './view';

const m = alcohol.milestones;

type EnteredBy = AlcoholMilestoneRecord['enteredBy'];

interface Draft {
  readonly weekly: string;
  readonly from: string;
  readonly name: string;
  readonly who: EnteredBy | null;
  readonly note: string;
}

/** A new milestone starts empty (A16); an edit starts from its own record. */
const draftOf = (stored: AlcoholMilestoneRecord | null): Draft =>
  stored === null
    ? { weekly: '', from: '', name: '', who: null, note: '' }
    : {
        weekly: String(stored.weeklyStdDrinks),
        from: stored.fromDate,
        name: stored.label === m.nameDefault ? '' : stored.label,
        who: stored.enteredBy,
        note: stored.note ?? '',
      };

type Problems = Partial<Record<'weekly' | 'from' | 'who' | 'name' | 'note', string>>;

function readDraft(
  draft: Draft,
): { readonly ok: true; readonly weekly: number; readonly who: EnteredBy } | Problems {
  const problems: Problems = {};
  let weekly: number | undefined;
  try {
    weekly = parseOptionalNumber(draft.weekly);
  } catch {
    weekly = undefined;
  }
  if (weekly === undefined || weekly < 0 || weekly > 200) problems.weekly = m.errors.weekly;
  if (!isLocalDate(draft.from)) problems.from = m.errors.from;
  if (draft.who === null) problems.who = m.errors.who;
  if (draft.name.trim().length > 80) problems.name = m.errors.name;
  if (draft.note.trim().length > 280) problems.note = m.errors.note;
  if (Object.keys(problems).length > 0 || weekly === undefined || draft.who === null) {
    return problems;
  }
  return { ok: true, weekly, who: draft.who };
}

function MilestoneForm({
  storage,
  stored,
  onDone,
}: {
  readonly storage: AppStorage;
  readonly stored: AlcoholMilestoneRecord | null;
  readonly onDone: (saved: boolean) => void;
}): ReactElement {
  const write = useDrinksWrite();
  const name = useId();
  const [draft, setDraft] = useState<Draft>(() => draftOf(stored));
  const [problems, setProblems] = useState<Problems>({});
  const save = async (): Promise<void> => {
    const read = readDraft(draft);
    if (!('ok' in read)) {
      setProblems(read);
      return;
    }
    setProblems({});
    const fields = {
      label: draft.name.trim() === '' ? m.nameDefault : draft.name.trim(),
      weeklyStdDrinks: read.weekly,
      fromDate: draft.from,
      enteredBy: read.who,
      note: draft.note.trim() === '' ? null : draft.note.trim(),
    };
    const done = await write.run(() =>
      stored === null
        ? storage.repos.alcoholMilestones.create(fields)
        : storage.repos.alcoholMilestones.update(stored.id, fields),
    );
    if (done !== null) onDone(true);
  };
  return (
    <div className="ui-subpanel">
      <TextField
        label={m.weeklyLabel}
        inputMode="decimal"
        autoComplete="off"
        value={draft.weekly}
        error={problems.weekly}
        onChange={(event) => {
          setDraft({ ...draft, weekly: event.currentTarget.value });
        }}
      />
      <TextField
        label={m.fromLabel}
        type="date"
        autoComplete="off"
        value={draft.from}
        error={problems.from}
        onChange={(event) => {
          setDraft({ ...draft, from: event.currentTarget.value });
        }}
      />
      <TextField
        label={m.nameLabel}
        autoComplete="off"
        maxLength={80}
        value={draft.name}
        error={problems.name}
        onChange={(event) => {
          setDraft({ ...draft, name: event.currentTarget.value });
        }}
      />
      <ChoiceList
        legend={m.whoLabel}
        name={name}
        options={[
          { value: MILESTONE_BY_SELF, label: m.whoSelf },
          { value: MILESTONE_BY_HEALTH_PROFESSIONAL, label: m.whoClinician },
        ]}
        value={draft.who}
        error={problems.who}
        onChange={(value) => {
          setDraft({
            ...draft,
            who: value === MILESTONE_BY_SELF ? MILESTONE_BY_SELF : MILESTONE_BY_HEALTH_PROFESSIONAL,
          });
        }}
      />
      <TextArea
        label={m.noteLabel}
        autoComplete="off"
        value={draft.note}
        error={problems.note}
        onChange={(event) => {
          setDraft({ ...draft, note: event.currentTarget.value });
        }}
      />
      <Notice tone="info">
        <p>{alcohol.firstRunNotice}</p>
      </Notice>
      <NoticeHelpRows />
      <ButtonRow>
        <Button variant="primary" aria-disabled={write.busy} onClick={() => void save()}>
          {m.save}
        </Button>
        <Button
          variant="quiet"
          onClick={() => {
            onDone(false);
          }}
        >
          {m.cancel}
        </Button>
      </ButtonRow>
      <WriteError write={write} />
    </div>
  );
}

function MilestoneRow({
  storage,
  milestone,
  editing,
  onEdit,
  onDone,
}: {
  readonly storage: AppStorage;
  readonly milestone: AlcoholMilestoneRecord;
  readonly editing: boolean;
  readonly onEdit: () => void;
  readonly onDone: (saved: boolean) => void;
}): ReactElement {
  const write = useDrinksWrite();
  const [confirming, setConfirming] = useState(false);
  return (
    <li>
      <p className="ui-text-strong">{m.rowTitle}</p>
      <p>
        {fillTemplate(m.row, {
          weekly: formatStd1(milestone.weeklyStdDrinks),
          date: formatShortDate(milestone.fromDate),
        })}
      </p>
      <p className="ui-text-muted">
        {milestone.enteredBy === MILESTONE_BY_HEALTH_PROFESSIONAL ? m.byClinician : m.bySelf}
      </p>
      {milestone.label === m.nameDefault ? null : (
        <p className="ui-text-muted">{fillTemplate(m.ownWords, { label: milestone.label })}</p>
      )}
      {milestone.note === null ? null : <p className="ui-text-muted">{milestone.note}</p>}
      {editing ? (
        <MilestoneForm storage={storage} stored={milestone} onDone={onDone} />
      ) : confirming ? (
        <>
          <p>{m.deleteConfirm}</p>
          <ButtonRow>
            <Button
              variant="caution"
              aria-disabled={write.busy}
              onClick={() => {
                void write.run(() => storage.repos.alcoholMilestones.remove(milestone.id));
              }}
            >
              {m.delete}
            </Button>
            <Button
              variant="quiet"
              onClick={() => {
                setConfirming(false);
                write.clear();
              }}
            >
              {m.cancel}
            </Button>
          </ButtonRow>
        </>
      ) : (
        <ButtonRow>
          <Button onClick={onEdit}>{m.edit}</Button>
          <Button
            variant="caution"
            onClick={() => {
              setConfirming(true);
            }}
          >
            {m.delete}
          </Button>
        </ButtonRow>
      )}
      <WriteError write={write} />
    </li>
  );
}

export function MilestonesCard({
  storage,
  view,
}: {
  readonly storage: AppStorage;
  readonly view: DrinksView;
}): ReactElement {
  const [editing, setEditing] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const done = (didSave: boolean): void => {
    setEditing(null);
    setSaved(didSave);
  };
  return (
    <Card label={m.cardLabel}>
      <p>{m.intro}</p>
      {view.milestones.length === 0 ? (
        <p className="ui-text-muted">{m.none}</p>
      ) : (
        <ul className="ui-drinks-entries">
          {view.milestones.map((milestone) => (
            <MilestoneRow
              key={milestone.id}
              storage={storage}
              milestone={milestone}
              editing={editing === milestone.id}
              onEdit={() => {
                setEditing(milestone.id);
                setSaved(false);
              }}
              onDone={done}
            />
          ))}
        </ul>
      )}
      {editing === 'new' ? (
        <MilestoneForm storage={storage} stored={null} onDone={done} />
      ) : (
        <Button
          onClick={() => {
            setEditing('new');
            setSaved(false);
          }}
        >
          {m.add}
        </Button>
      )}
      <p role="status" className="ui-status-line">
        {saved ? m.saved : ''}
      </p>
    </Card>
  );
}
