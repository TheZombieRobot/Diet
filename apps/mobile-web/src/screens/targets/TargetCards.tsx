/**
 * The Protein, Carbs, Saturated fat, and Fibre and water cards of Diet and targets (item 21
 * design sections 2.2.3 to 2.2.6; C50, C65, C70, C71, T18, T25, T34). A number field saves with its
 * card's Save button only after parseTargetEdit accepts it: a value out of range is refused with a
 * message and never clamped. Each control shows the value the engine uses.
 */
import {
  checkProteinPair,
  type DayTargetRecords,
  type DayTargetsView,
  fibreGuide,
  fillTemplate,
  parseTargetEdit,
  safeFibreOverrideG,
  safeKetoCeilingG,
  safeModerateCeilingG,
  safeSatFatPct,
  safeWaterOverrideMl,
  SAT_FAT_BUDGET_OPTIONS_PCT,
  type TargetField,
  waterGuide,
} from '@diet/core';
import { targets as copy } from '@diet/core/copy/health';
import { Button, Card, SelectField, TextField } from '@diet/ui';
import { type ReactElement, useState } from 'react';
import type { AppStorage } from '../../db/runtime';
import { formatWhole } from '../../format';
import { featureOffReasonsFor } from '../../onboarding/readinessText';
import { editMessage, hintWith, optionsWith, useCardWrite } from './form';
import { ReadinessLink, WriteStatus } from './parts';

interface CardProps {
  readonly storage: AppStorage;
  readonly view: DayTargetsView;
  readonly records: DayTargetRecords;
  readonly disabled: boolean;
}

/** Text drafts for a card's number fields: a field not being edited shows the value in use. */
function useDrafts<F extends string>() {
  const [drafts, setDrafts] = useState<Partial<Record<F, string>>>({});
  const [errors, setErrors] = useState<Partial<Record<F, string>>>({});
  return {
    shown: (field: F, used: string) => drafts[field] ?? used,
    edited: (field: F, used: string) => drafts[field] !== undefined && drafts[field] !== used,
    edit: (field: F, text: string) => {
      setDrafts((d) => ({ ...d, [field]: text }));
      setErrors((e) => ({ ...e, [field]: undefined }));
    },
    error: (field: F) => errors[field],
    fail: (next: Partial<Record<F, string>>) => {
      setErrors(next);
    },
    reset: () => {
      setDrafts({});
      setErrors({});
    },
  };
}

/** Parses each shown field; the values, or the messages to show under the refused ones. */
function parseAll<F extends TargetField>(
  fields: readonly F[],
  shown: (field: F) => string,
):
  | { ok: true; values: Record<F, number | null> }
  | { ok: false; errors: Partial<Record<F, string>> } {
  const values = {} as Record<F, number | null>;
  const errors: Partial<Record<F, string>> = {};
  for (const field of fields) {
    const parsed = parseTargetEdit(field, shown(field));
    if (parsed.ok) values[field] = parsed.value;
    else errors[field] = editMessage(parsed.error);
  }
  return Object.keys(errors).length === 0 ? { ok: true, values } : { ok: false, errors };
}

export function ProteinCard({ storage, view, disabled }: CardProps): ReactElement {
  const t = view.targets;
  const range = t.protein.rangeG;
  const write = useCardWrite();
  const drafts = useDrafts<'proteinMin' | 'proteinMax'>();
  const busy = disabled || write.busy;
  const used = { proteinMin: String(range.min), proteinMax: String(range.max) } as const;
  const shown = (field: 'proteinMin' | 'proteinMax') => drafts.shown(field, used[field]);
  const field = (name: 'proteinMin' | 'proteinMax', label: string) => (
    <TextField
      label={label}
      inputMode="numeric"
      autoComplete="off"
      value={shown(name)}
      error={drafts.error(name)}
      disabled={busy}
      onChange={(event) => {
        write.clear();
        drafts.edit(name, event.currentTarget.value);
      }}
    />
  );
  const save = () => {
    const parsed = parseAll(['proteinMin', 'proteinMax'] as const, shown);
    if (!parsed.ok) {
      drafts.fail(parsed.errors);
      return;
    }
    const min = parsed.values.proteinMin ?? range.min;
    const max = parsed.values.proteinMax ?? range.max;
    const pair = checkProteinPair(min, max);
    if (pair !== null) {
      drafts.fail({ proteinMin: editMessage(pair) });
      return;
    }
    write.run(() =>
      storage.repos.targets.update({ proteinRangeG: { min, max } }).then(drafts.reset),
    );
  };
  return (
    <Card label={copy.protein.label}>
      <div className="ui-field-pair">
        {field('proteinMin', copy.protein.minLabel)}
        {field('proteinMax', copy.protein.maxLabel)}
      </div>
      <p className="ui-field__hint">{copy.protein.hint}</p>
      <Button
        variant="primary"
        disabled={
          busy ||
          !(
            drafts.edited('proteinMin', used.proteinMin) ||
            drafts.edited('proteinMax', used.proteinMax)
          )
        }
        onClick={save}
      >
        {copy.form.save}
      </Button>
      <WriteStatus state={write.state} />
      {view.display.plainFigures ? (
        <p>{copy.protein.plainNote}</p>
      ) : (
        <>
          <p>
            {t.figures === 'kickstart'
              ? fillTemplate(copy.protein.kickstart, { max: range.max })
              : fillTemplate(copy.protein.steady, { min: range.min })}
          </p>
          <p>{copy.protein.unchanged}</p>
          <p className="ui-text-muted">{copy.protein.review}</p>
        </>
      )}
    </Card>
  );
}

type CarbField = 'netCarbCeilingG' | 'moderateNetCarbCeilingG';

export function CarbsCard({ storage, view, records, disabled }: CardProps): ReactElement {
  const t = view.targets;
  const { gates } = view;
  const stored = records.targets;
  const write = useCardWrite();
  const drafts = useDrafts<CarbField>();
  const busy = disabled || write.busy;
  const used = {
    netCarbCeilingG: safeKetoCeilingG(stored.netCarbCeilingG),
    moderateNetCarbCeilingG: safeModerateCeilingG(stored.moderateNetCarbCeilingG),
  };
  const ketoShown = gates.ketoCeilingAvailable && gates.carbCeilingBelow50Allowed;
  const moderateShown = gates.ketoCeilingAvailable;
  const fields: CarbField[] = [
    ...(ketoShown ? (['netCarbCeilingG'] as const) : []),
    ...(moderateShown ? (['moderateNetCarbCeilingG'] as const) : []),
  ];
  const shown = (field: CarbField) => drafts.shown(field, String(used[field]));
  const field = (name: CarbField, label: string, hint: string) => (
    <TextField
      label={label}
      hint={hintWith(hint, stored[name], used[name])}
      inputMode="numeric"
      autoComplete="off"
      value={shown(name)}
      error={drafts.error(name)}
      disabled={busy}
      onChange={(event) => {
        write.clear();
        drafts.edit(name, event.currentTarget.value);
      }}
    />
  );
  const save = () => {
    const parsed = parseAll(fields, shown);
    if (!parsed.ok) {
      drafts.fail(parsed.errors);
      return;
    }
    const keto = parsed.values.netCarbCeilingG ?? used.netCarbCeilingG;
    const moderate = parsed.values.moderateNetCarbCeilingG ?? used.moderateNetCarbCeilingG;
    write.run(() =>
      storage.repos.targets
        .update({ netCarbCeilingG: keto, moderateNetCarbCeilingG: moderate })
        .then(drafts.reset),
    );
  };
  return (
    <Card label={copy.carbs.label}>
      {ketoShown ? field('netCarbCeilingG', copy.carbs.ketoLabel, copy.carbs.ketoHint) : null}
      {gates.ketoCeilingAvailable && !gates.carbCeilingBelow50Allowed ? (
        <p>{copy.carbs.heldAt50}</p>
      ) : null}
      {moderateShown
        ? field('moderateNetCarbCeilingG', copy.carbs.moderateLabel, copy.carbs.moderateHint)
        : null}
      {gates.ketoCeilingAvailable ? null : (
        <p>{`${featureOffReasonsFor('ketoCeiling', view.gateInput, gates)} ${copy.carbs.offShown}`}</p>
      )}
      {fields.length === 0 ? null : (
        <Button
          variant="primary"
          disabled={busy || !fields.some((f) => drafts.edited(f, String(used[f])))}
          onClick={save}
        >
          {copy.form.save}
        </Button>
      )}
      <WriteStatus state={write.state} />
      {t.figures === 'kickstart' && t.netCarbs.kind === 'ceiling' ? (
        <p>{fillTemplate(copy.carbs.kickstart, { carbs: t.netCarbs.grams })}</p>
      ) : null}
      {records.profile.dietMode === 'balanced' && gates.ketoCeilingAvailable ? (
        <p>{copy.carbs.balanced}</p>
      ) : null}
      {!gates.ketoCeilingAvailable || !gates.carbCeilingBelow50Allowed ? <ReadinessLink /> : null}
      <p className="ui-text-muted">{copy.carbs.meaning}</p>
    </Card>
  );
}

export function SaturatedFatCard({ storage, view, records, disabled }: CardProps): ReactElement {
  const budget = view.targets.saturatedFat;
  const write = useCardWrite();
  const pct = safeSatFatPct(records.targets.saturatedFatBudgetPct);
  return (
    <Card label={copy.saturatedFat.label}>
      <SelectField
        label={copy.saturatedFat.budgetLabel}
        hint={hintWith(copy.saturatedFat.budgetHint, records.targets.saturatedFatBudgetPct, pct)}
        value={String(pct)}
        options={optionsWith(SAT_FAT_BUDGET_OPTIONS_PCT, pct, (value) =>
          fillTemplate(copy.saturatedFat.percentOption, { pct: value }),
        )}
        disabled={disabled || write.busy}
        onChange={(value) => {
          const saturatedFatBudgetPct = Number(value);
          write.run(() => storage.repos.targets.update({ saturatedFatBudgetPct }));
        }}
      />
      <WriteStatus state={write.state} />
      {view.display.plainFigures ? (
        <p>{copy.saturatedFat.plainNote}</p>
      ) : (
        <>
          <p>
            {budget.kind === 'budget'
              ? fillTemplate(copy.saturatedFat.today, {
                  g: budget.grams,
                  pct: budget.pct,
                  kj: formatWhole(budget.fromKj),
                })
              : copy.saturatedFat.noBudget}
          </p>
          <p className="ui-text-muted">{copy.saturatedFat.why}</p>
        </>
      )}
    </Card>
  );
}

type GuideField = 'fibreGuideG' | 'waterTargetMl';

export function GuidesCard({ storage, records, disabled }: CardProps): ReactElement {
  const stored = records.targets;
  const { sex } = records.profile;
  const write = useCardWrite();
  const drafts = useDrafts<GuideField>();
  const busy = disabled || write.busy;
  const used = {
    fibreGuideG: safeFibreOverrideG(stored.fibreGuideG),
    waterTargetMl: safeWaterOverrideMl(stored.waterTargetMl),
  };
  const defaults = {
    fibreGuideG: fibreGuide(sex, null).grams,
    waterTargetMl: waterGuide(sex, null).ml,
  };
  const usedText = (field: GuideField) => {
    const value = used[field];
    return value === null ? '' : String(value);
  };
  const shown = (field: GuideField) => drafts.shown(field, usedText(field));
  const field = (name: GuideField, label: string, hint: string, note: string) => (
    <>
      <TextField
        label={label}
        hint={hintWith(hint, stored[name], used[name])}
        inputMode="numeric"
        autoComplete="off"
        placeholder={String(defaults[name])}
        value={shown(name)}
        error={drafts.error(name)}
        disabled={busy}
        onChange={(event) => {
          write.clear();
          drafts.edit(name, event.currentTarget.value);
        }}
      />
      <p className="ui-text-muted">{note}</p>
    </>
  );
  const save = () => {
    const parsed = parseAll(['fibreGuideG', 'waterTargetMl'] as const, shown);
    if (!parsed.ok) {
      drafts.fail(parsed.errors);
      return;
    }
    const fibreGuideG = parsed.values.fibreGuideG;
    const waterTargetMl = parsed.values.waterTargetMl;
    write.run(() =>
      storage.repos.targets.update({ fibreGuideG, waterTargetMl }).then(drafts.reset),
    );
  };
  return (
    <Card label={copy.guides.label}>
      {field(
        'fibreGuideG',
        copy.guides.fibreLabel,
        copy.guides.fibreHint,
        fillTemplate(copy.guides.fibreDefault, { g: defaults.fibreGuideG }),
      )}
      {field(
        'waterTargetMl',
        copy.guides.waterLabel,
        copy.guides.waterHint,
        fillTemplate(copy.guides.waterDefault, { ml: formatWhole(defaults.waterTargetMl) }),
      )}
      <Button
        variant="primary"
        disabled={
          busy ||
          !(['fibreGuideG', 'waterTargetMl'] as const).some((f) => drafts.edited(f, usedText(f)))
        }
        onClick={save}
      >
        {copy.form.save}
      </Button>
      <WriteStatus state={write.state} />
    </Card>
  );
}
