import {
  checkLongTermGoal,
  dailyWeightsFromRecords,
  fillTemplate,
  type GoalCheck,
  goalReferenceKgFor,
  parseWeightInput,
} from '@diet/core';
import { weight } from '@diet/core/copy/health';
import { Button, ButtonRow, Card, TextField } from '@diet/ui';
import { useId, useState, type ReactElement } from 'react';
import type { AppStorage } from '../../db/runtime';
import { GateNotice } from '../../onboarding/GateNotice';
import { formatKg } from '../../format';
import { KgValue, Stat, WriteFailure } from './parts';
import type { WeightStatusMessage } from './stores';
import type { WeightView } from './useWeightView';
import { weightWriteMessage } from './writeErrors';

type Refusal = Extract<GoalCheck, { ok: false }>['reason'] | 'not-a-number';

/** Why a goal was not saved. The floor itself is never shown (item 13 E12). */
const REFUSAL_TEXT: Readonly<Record<Refusal, string>> = {
  'not-a-number': weight.goal.notANumber,
  'out-of-range': weight.goal.outOfRange,
  'needs-height': weight.goal.needsHeight,
  'needs-weigh-in': weight.goal.needsWeighIn,
  'not-below-weight': weight.goal.notBelowWeight,
  'below-bmi-floor': weight.goal.belowBmiFloor,
};

/**
 * The long-term goal on the Weight screen (HS-01, HS-21; WT-01, WT-02; item 14 design section 2.5):
 * the goal and its next milestone, always labelled "long-term" and never drawn on the chart, and
 * the entry, refused below BMI 18.5 for the height or at or above the current weight. Hidden while
 * readiness closes goal setting or the deficit; the stored goal is kept.
 */
export function GoalCard({
  storage,
  view,
}: {
  storage: AppStorage;
  view: WeightView;
}): ReactElement {
  const { overview, inputs } = view;
  const { goal } = overview;
  const goalId = useId();
  const [text, setText] = useState('');
  const [error, setError] = useState<string | undefined>(undefined);
  const [failure, setFailure] = useState<WeightStatusMessage | null>(null);
  const [removing, setRemoving] = useState(false);

  if (goal.status === 'gated') {
    return (
      <Card label={weight.goal.label}>
        {/* The gate's own reason: a low weight or the birth year, not only the answers (F31). */}
        <GateNotice feature="goalSetting" link={false} />
        <p>{weight.goal.gatedKept}</p>
      </Card>
    );
  }

  const write = (patch: Parameters<AppStorage['repos']['profile']['update']>[0]) => {
    setFailure(null);
    storage.repos.profile.update(patch).then(
      () => {
        setText('');
        setRemoving(false);
      },
      (failed: unknown) => {
        setFailure(weightWriteMessage(failed, 'goal'));
      },
    );
  };

  const save = () => {
    const parsed = parseWeightInput(text);
    if (!parsed.ok) {
      setError(REFUSAL_TEXT[parsed.reason]);
      return;
    }
    const daily = dailyWeightsFromRecords(inputs.weights, inputs.settings.homeTimeZone);
    const currentKg = goalReferenceKgFor(daily, overview.today);
    const check = checkLongTermGoal(parsed.kg, inputs.profile.heightCm, currentKg);
    if (!check.ok || currentKg === null) {
      setError(REFUSAL_TEXT[check.ok ? 'needs-weigh-in' : check.reason]);
      return;
    }
    write({ goalKg: check.goalKg, goalSetAt: storage.env.now(), goalReferenceKg: currentKg });
  };

  return (
    <Card label={weight.goal.label}>
      {goal.status === 'none' ? <p>{weight.goal.none}</p> : null}
      {goal.status === 'needs-height' ? <p>{weight.goal.needsHeight}</p> : null}
      {goal.status === 'needs-update' ? <p>{weight.goal.needsUpdating}</p> : null}
      {goal.status === 'set' ? (
        <>
          <div className="ui-stats">
            <Stat id={goalId} label={weight.goal.label}>
              <KgValue kg={goal.goalKg} />
            </Stat>
          </div>
          {goal.milestone.kind === 'milestone' ? (
            <>
              <p className="ui-text-strong">
                {fillTemplate(weight.card.milestoneStat, { kg: formatKg(goal.milestone.kg) })}
              </p>
              <p className="ui-text-muted">
                {fillTemplate(weight.goal.milestoneExplain, { kg: formatKg(goal.milestone.kg) })}
              </p>
            </>
          ) : null}
          {goal.milestone.kind === 'is-goal' ? (
            <p className="ui-text-muted">{weight.goal.milestoneIsGoal}</p>
          ) : null}
          {goal.milestone.kind === 'needs-weigh-in' ? (
            <p className="ui-text-muted">{weight.goal.milestoneNeedsWeighIn}</p>
          ) : null}
        </>
      ) : null}
      <TextField
        label={weight.goal.fieldLabel}
        hint={weight.goal.fieldHint}
        error={error}
        inputMode="decimal"
        autoComplete="off"
        value={text}
        onChange={(event) => {
          setText(event.currentTarget.value);
          setError(undefined);
        }}
      />
      <div role="alert" className="ui-status-line">
        {failure === null ? null : <WriteFailure storage={storage} message={failure} />}
      </div>
      <Button variant="primary" block disabled={text.trim() === ''} onClick={save}>
        {weight.goal.save}
      </Button>
      {inputs.profile.goalKg === null ? null : removing ? (
        <>
          <p>{weight.goal.removeConfirm}</p>
          <ButtonRow>
            <Button
              variant="caution"
              onClick={() => {
                write({ goalKg: null, goalSetAt: null, goalReferenceKg: null });
              }}
            >
              {weight.goal.remove}
            </Button>
            <Button
              variant="quiet"
              onClick={() => {
                setRemoving(false);
              }}
            >
              {weight.goal.cancel}
            </Button>
          </ButtonRow>
        </>
      ) : (
        <Button
          variant="quiet"
          onClick={() => {
            setRemoving(true);
          }}
        >
          {weight.goal.remove}
        </Button>
      )}
    </Card>
  );
}
