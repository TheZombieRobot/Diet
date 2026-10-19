import {
  ACTIVITY_FACTORS,
  type ActivityLevel,
  type DayTargetRecords,
  type DayTargetsView,
  fillTemplate,
  KICKSTART_DEFICIT_OPTIONS_PCT,
  parseTargetEdit,
  safeActivityLevel,
  safeKickstartDeficitPct,
  safeSteadyDeficitPct,
  STEADY_DEFICIT_OPTIONS_PCT,
  type WeightBasis,
} from '@diet/core';
import { profile as profileCopy, targets as copy } from '@diet/core/copy/health';
import { ActionRow, Button, Card, ChevronIcon, SelectField, TextField } from '@diet/ui';
import { type ReactElement, useState } from 'react';
import type { AppStorage } from '../../db/runtime';
import { formatAboutKcal, formatKgShort, formatLocalDate, formatWhole } from '../../format';
import { routeHref } from '../../routes';
import { energyExplanation } from './energyExplanation';
import { editMessage, hintWith, optionsWith, useCardWrite } from './form';
import { ReadinessLink, WriteStatus } from './parts';

type FixRoute = 'readiness' | 'profile' | 'weight';

/** Why there is no rough guide, in words, and where it is fixed (T32). */
function unavailable(view: DayTargetsView): { line: string; route: FixRoute } | null {
  const { estimate } = view.targets;
  if (estimate.available) return null;
  const lines = copy.energy.unavailable;
  switch (estimate.reason) {
    case 'not-estimated':
      return view.display.estimateGate === 'under-18-birth-year'
        ? { line: lines.under18BirthYear, route: 'profile' }
        : view.display.estimateGate === 'unanswered'
          ? { line: lines.unanswered, route: 'readiness' }
          : { line: lines.under18Answer, route: 'readiness' };
    case 'missing-height':
      return { line: lines.missingHeight, route: 'profile' };
    case 'missing-birth-year':
      return { line: lines.missingBirthYear, route: 'profile' };
    case 'age-out-of-range':
      return { line: lines.ageOutOfRange, route: 'profile' };
    case 'height-out-of-range':
      return { line: lines.heightOutOfRange, route: 'profile' };
    case 'missing-weight':
      return { line: lines.missingWeight, route: 'weight' };
    case 'weight-out-of-range':
      return { line: lines.weightOutOfRange, route: 'weight' };
  }
}

/** "Your 7-day average weight, 100 kg, and your activity", or the weigh-in it used (C24). */
function basisText(weight: WeightBasis): string {
  const kg = formatKgShort(weight.kg);
  if (weight.at === null || weight.timeZone === null) {
    return fillTemplate(copy.energy.basisAverage, { kg });
  }
  const date = formatLocalDate(weight.at, weight.timeZone);
  return fillTemplate(
    weight.basis === 'highest-recent'
      ? copy.energy.basisHighestRecent
      : copy.energy.basisLatestOlder,
    { kg, date },
  );
}

function FixLink({ route }: { route: FixRoute }): ReactElement {
  if (route === 'readiness') return <ReadinessLink />;
  const link = copy.links[route];
  return (
    <ActionRow
      href={routeHref(route)}
      title={link.title}
      detail={link.detail}
      badge={<ChevronIcon />}
    />
  );
}

const ACTIVITY_LEVELS = Object.keys(ACTIVITY_FACTORS) as ActivityLevel[];

/**
 * The Energy card (item 21 design section 2.2.2; C10, C24, C61, C108, T3, T15, T34): the rough
 * guide and what it is based on, today's energy target, why, and the controls the gates allow. The
 * stored values are kept whatever is shown (RD-06); each control shows the value in use.
 */
export function EnergyCard({
  storage,
  view,
  records,
  disabled,
}: {
  readonly storage: AppStorage;
  readonly view: DayTargetsView;
  readonly records: DayTargetRecords;
  readonly disabled: boolean;
}): ReactElement {
  const t = view.targets;
  const { gates, display } = view;
  const stored = records.targets;
  const write = useCardWrite();
  const [floorDraft, setFloorDraft] = useState<string | null>(null);
  const [floorError, setFloorError] = useState<string | undefined>(undefined);
  const busy = disabled || write.busy;
  const missing = unavailable(view);
  const explanation = energyExplanation(view);
  const clamped = t.energy.kind === 'target' && t.energy.clampedToFloor;
  const floorKj = t.energy.floorKj;
  const floorShown = floorDraft ?? formatWhole(floorKj);
  const kickstartPct = safeKickstartDeficitPct(stored.kickstartDeficitPct);
  const steadyPct = safeSteadyDeficitPct(stored.steadyDeficitPct);
  const pctLabel = (pct: number) => fillTemplate(copy.energy.deficitOption, { pct });
  const readinessLink =
    explanation.readinessLink ||
    !gates.deficitAllowed ||
    (!gates.kickstartAvailable && gates.deficitAllowed) ||
    missing?.route === 'readiness';

  const saveFloor = () => {
    const parsed = parseTargetEdit('energyFloorKj', floorShown);
    if (!parsed.ok || parsed.value === null) {
      setFloorError(parsed.ok ? copy.form.wholeNumber : editMessage(parsed.error));
      return;
    }
    const energyFloorKj = parsed.value;
    write.run(() =>
      storage.repos.targets.update({ energyFloorKj }).then(() => {
        setFloorDraft(null);
      }),
    );
  };

  return (
    <Card label={copy.energy.label}>
      <dl className="ui-facts">
        <div>
          <dt className="ui-facts__term">{copy.energy.roughGuideTerm}</dt>
          <dd className="ui-facts__value">
            {t.estimate.available
              ? fillTemplate(copy.energy.roughGuide, {
                  kj: formatWhole(t.estimate.kj),
                  kcal: formatAboutKcal(t.estimate.kj),
                })
              : missing?.line}
          </dd>
        </div>
        {t.estimate.available ? (
          <div>
            <dt className="ui-facts__term">{copy.energy.basisTerm}</dt>
            <dd className="ui-facts__value">{basisText(t.estimate.weight)}</dd>
          </div>
        ) : null}
        {display.plainFigures ? null : (
          <div>
            <dt className="ui-facts__term">{copy.energy.targetTerm}</dt>
            <dd className="ui-facts__value">
              {t.energy.kind === 'target'
                ? fillTemplate(copy.energy.target, {
                    kj: formatWhole(t.energy.targetKj),
                    kcal: formatAboutKcal(t.energy.targetKj),
                  })
                : copy.energy.noTarget}
            </dd>
          </div>
        )}
      </dl>
      {missing === null || missing.route === 'readiness' ? null : <FixLink route={missing.route} />}
      {explanation.lines.map((line) => (
        <p key={line}>{line}</p>
      ))}
      {gates.energyEstimateAvailable ? (
        <SelectField
          label={profileCopy.activityLegend}
          hint={profileCopy.activityHint}
          value={safeActivityLevel(records.profile.activityLevel)}
          options={ACTIVITY_LEVELS.map((level) => ({
            value: level,
            label: profileCopy.activity[level],
          }))}
          disabled={busy}
          onChange={(value) => {
            const activityLevel = safeActivityLevel(value);
            write.run(() => storage.repos.profile.update({ activityLevel }));
          }}
        />
      ) : null}
      {gates.kickstartAvailable ? (
        <SelectField
          label={copy.energy.kickstartDeficitLabel}
          hint={hintWith(
            t.figures === 'kickstart' && clamped
              ? `${copy.energy.kickstartDeficitHint} ${copy.energy.deficitNotInUse}`
              : copy.energy.kickstartDeficitHint,
            stored.kickstartDeficitPct,
            kickstartPct,
          )}
          value={String(kickstartPct)}
          options={optionsWith(KICKSTART_DEFICIT_OPTIONS_PCT, kickstartPct, pctLabel)}
          disabled={busy}
          onChange={(value) => {
            const kickstartDeficitPct = Number(value);
            write.run(() => storage.repos.targets.update({ kickstartDeficitPct }));
          }}
        />
      ) : null}
      {!gates.kickstartAvailable && gates.deficitAllowed ? (
        <p>{copy.energy.kickstartUnavailable}</p>
      ) : null}
      {gates.deficitAllowed ? (
        <SelectField
          label={copy.energy.steadyDeficitLabel}
          hint={hintWith(
            t.figures === 'steady' && clamped
              ? `${copy.energy.steadyDeficitHint} ${copy.energy.deficitNotInUse}`
              : copy.energy.steadyDeficitHint,
            stored.steadyDeficitPct,
            steadyPct,
          )}
          value={String(steadyPct)}
          options={optionsWith(STEADY_DEFICIT_OPTIONS_PCT, steadyPct, pctLabel)}
          disabled={busy}
          onChange={(value) => {
            const steadyDeficitPct = Number(value);
            write.run(() => storage.repos.targets.update({ steadyDeficitPct }));
          }}
        />
      ) : (
        <p>{copy.energy.deficitOff}</p>
      )}
      <TextField
        label={copy.energy.floorLabel}
        hint={hintWith(copy.energy.floorHint, stored.energyFloorKj, floorKj)}
        error={floorError}
        inputMode="numeric"
        autoComplete="off"
        value={floorShown}
        disabled={busy}
        onChange={(event) => {
          write.clear();
          setFloorError(undefined);
          setFloorDraft(event.currentTarget.value);
        }}
      />
      <Button
        variant="primary"
        disabled={busy || floorDraft === null || floorDraft === formatWhole(floorKj)}
        onClick={saveFloor}
      >
        {copy.form.save}
      </Button>
      <WriteStatus state={write.state} />
      {readinessLink ? <ReadinessLink /> : null}
      <p className="ui-text-small">{copy.energy.how}</p>
    </Card>
  );
}
