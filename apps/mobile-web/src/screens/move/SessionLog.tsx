import {
  appendMovement,
  beachPromptLines,
  cuesFor,
  type DoseReason,
  type ExerciseData,
  fillTemplate,
  heatElectrolyteLines,
  isBeachTemplate,
  type LayoutMovement,
  layoutSession,
  type MoveContext,
  planSession,
  type SessionRecord,
  SESSION_LIMITS,
  type SessionTemplate,
  storedVariants,
  switchVariants,
  tickSet,
  toSessionMovement,
  untickSet,
  replaceMovement,
  type VariantKey,
  variantOf,
} from '@diet/core';
import { move, moveScreen } from '@diet/core/copy/health';
import { Button, ButtonRow, Card, ChoiceList, Stepper } from '@diet/ui';
import { type ReactElement, type Ref, useEffect, useId, useRef, useState } from 'react';
import { StorageRuleError } from '../../db/errors';
import type { AppStorage } from '../../db/runtime';
import { SaveError } from '../../onboarding/SaveError';
import { useSave } from '../../onboarding/useSave';
import { amountText, displayStep, heatWaterText } from './moveText';
import { MoveWriteRefused, moveSaveMessage, writeSession } from './sessionWrites';

/** The dose reasons that explain the amount shown (item 26 4.2); the others need no line. */
const DOSE_LINES: Partial<Record<DoseReason, string>> = {
  capped: move.progression.capped,
  'week-reached': move.progression.weekReached,
  'session-done': move.progression.sessionDone,
  hold: move.progression.hold,
  restart: move.progression.restart,
  'new-variant': move.progression.newVariant,
};

interface PanelProps {
  readonly data: ExerciseData;
  readonly ctx: MoveContext;
  readonly storage: AppStorage;
  readonly template: SessionTemplate;
  readonly row: SessionRecord;
  readonly mode: 'planned' | 'lighter';
  readonly movement: LayoutMovement;
}

/** The set being done: a stepper from the suggested amount, and the big tick. */
function ActiveSet({
  n,
  initial,
  unit,
  perSide,
  step,
  walk,
  busy,
  onTick,
  tickRef,
}: {
  readonly n: number;
  readonly initial: number;
  readonly unit: 'reps' | 'seconds';
  readonly perSide: boolean;
  readonly step: number;
  readonly walk: boolean;
  readonly busy: boolean;
  readonly onTick: (amount: number) => void;
  readonly tickRef: Ref<HTMLButtonElement>;
}): ReactElement {
  const min = unit === 'seconds' ? step : SESSION_LIMITS.reps.min;
  const max = Math.floor(SESSION_LIMITS[unit].max / step) * step;
  const [value, setValue] = useState(() => Math.min(max, Math.max(min, initial)));
  const s = moveScreen.session;
  return (
    <li className="ui-set ui-set--next">
      <Stepper
        label={walk ? s.walkAmountLabel : fillTemplate(s.amountLabel, { n })}
        value={value}
        min={min}
        max={max}
        step={step}
        formatValue={(v) => amountText(unit, v, perSide)}
        decreaseLabel={walk ? s.walkLess : fillTemplate(s.less, { n })}
        increaseLabel={walk ? s.walkMore : fillTemplate(s.more, { n })}
        onChange={setValue}
      />
      <Button
        ref={tickRef}
        variant="primary"
        className="ui-button--tall"
        block
        disabled={busy}
        onClick={() => {
          onTick(value);
        }}
      >
        {walk ? s.walkDone : fillTemplate(s.setDone, { n })}
      </Button>
    </li>
  );
}

/**
 * One movement of the session (design section 1.9, MovementPanel): its version and how to do it,
 * why the amount is what it is, a stepper and a big tick per set, Undo, an extra set, and "Log a
 * set anyway" once the week's amount is reached (C76: the cap never blocks logging). The version
 * switch is offered only before the movement's first tick and never in a lighter session.
 */
function MovementPanel({
  data,
  ctx,
  storage,
  template,
  row,
  mode,
  movement,
}: PanelProps): ReactElement {
  const { exercise, planned, stored, slot, index, toDo } = movement;
  const save = useSave(moveSaveMessage);
  const [extra, setExtra] = useState(false);
  const [howOpen, setHowOpen] = useState(false);
  const [versionsOpen, setVersionsOpen] = useState(false);
  const howId = useId();
  const tickRef = useRef<HTMLButtonElement>(null);
  const extraRef = useRef<HTMLButtonElement>(null);
  const focusNext = useRef(false);
  const ticked = stored?.done ?? [];
  useEffect(() => {
    if (!focusNext.current) return;
    focusNext.current = false;
    (tickRef.current ?? extraRef.current)?.focus();
  }, [ticked.length]);
  const s = moveScreen.session;
  const variantKey: VariantKey = stored?.variant ?? planned?.variant ?? 'standard';
  const variant = exercise === null ? null : variantOf(exercise, variantKey);
  const perSide = variant?.perSide ?? false;
  const setText = (set: { reps: number | null; seconds: number | null }) =>
    set.reps === null
      ? amountText('seconds', set.seconds ?? 0, perSide)
      : amountText('reps', set.reps, perSide);

  if (exercise === null) {
    return (
      <div className="ui-movement" data-testid={`movement-${stored?.exerciseId ?? ''}`}>
        <h3 className="ui-text-strong">{s.unknownMovement}</h3>
        <ul className="ui-plain-list">
          {ticked.map((set, i) => (
            <li key={i}>{fillTemplate(s.setLine, { n: i + 1, amount: setText(set) })}</li>
          ))}
        </ul>
      </div>
    );
  }

  const walk = template.kind === 'walk' && movement.block === 'main';
  const step = displayStep(exercise, slot);
  const versions = switchVariants(exercise, ctx.equipment, mode);
  const canSwitch =
    movement.block === 'main' && planned !== null && ticked.length === 0 && versions.length > 1;
  const lastAmount = ticked.at(-1);
  const fallback = slot?.min ?? exercise.step;

  const run = (change: (fresh: SessionRecord) => SessionRecord['movements'] | null) =>
    save.run(async () => {
      const fresh = await storage.repos.sessions.get(row.id);
      if (fresh === undefined) throw new StorageRuleError('sessions', 'not-found');
      const movements = change(fresh);
      if (movements !== null) await writeSession(storage, data, row.id, { movements });
    });
  const atIndex = (fresh: SessionRecord): number => {
    if (index === null || fresh.movements[index]?.exerciseId !== exercise.id) {
      throw new MoveWriteRefused('changed');
    }
    return index;
  };
  const tick = (amount: number) => {
    focusNext.current = true;
    void run((fresh) =>
      index === null
        ? appendMovement(
            fresh.movements,
            { exerciseId: exercise.id, variant: planned?.variant ?? 'easier', unit: exercise.unit },
            amount,
          )
        : tickSet(fresh.movements, atIndex(fresh), amount),
    ).then((ok) => {
      if (ok) setExtra(false);
      else focusNext.current = false;
    });
  };
  const changeVersion = (key: VariantKey) => {
    void run((fresh) => {
      if (fresh.preCheck === null) throw new MoveWriteRefused('no-pre-check');
      if (fresh.movements.some((m) => m.exerciseId === exercise.id && m.done.length > 0)) {
        return null;
      }
      const overrides = new Map(storedVariants(fresh));
      overrides.set(exercise.id, key);
      const next = planSession(data, template, {
        preCheck: fresh.preCheck,
        choice: mode,
        equipment: ctx.equipment,
        sessions: ctx.sessions,
        week: ctx.week,
        today: ctx.today,
        sessionId: fresh.id,
        variantOverrides: overrides,
      }).movements.find((m) => m.block === 'main' && m.exerciseId === exercise.id);
      if (next === undefined || !versions.includes(next.variant)) return null;
      return replaceMovement(fresh.movements, exercise.id, toSessionMovement(next));
    }).then(() => {
      setVersionsOpen(false);
    });
  };

  const shownSets = ticked.length + toDo.length;
  const restLine =
    planned !== null && planned.restSeconds > 0 && shownSets > 1
      ? fillTemplate(
          template.kind !== 'jog'
            ? s.restBetween
            : mode === 'lighter' || variantKey === 'easier'
              ? s.walkBetweenBrisk
              : s.walkBetween,
          { amount: amountText('seconds', planned.restSeconds, false) },
        )
      : null;
  const doseLine =
    planned?.dose === null || planned === null ? null : DOSE_LINES[planned.dose.reason];
  const tryNext = planned?.dose?.next ?? null;
  const activeTarget =
    toDo[0] ?? (extra ? (lastAmount?.reps ?? lastAmount?.seconds ?? fallback) : null);

  return (
    <div className="ui-movement" data-testid={`movement-${exercise.id}`}>
      <h3 className="ui-text-strong">{exercise.name}</h3>
      {exercise.safetyKeys.includes('painFreeOnly') ? (
        <p className="ui-text-strong">{move.safety.painFreeOnly.body}</p>
      ) : null}
      <p>
        <span className="ui-text-strong">{variant?.name ?? exercise.name}</span>
        {variant === null ? null : ` ${variant.how}`}
      </p>
      {canSwitch ? (
        <>
          <Button
            variant="quiet"
            aria-expanded={versionsOpen}
            onClick={() => {
              setVersionsOpen((o) => !o);
            }}
          >
            {s.changeVersion}
          </Button>
          {versionsOpen ? (
            <ChoiceList
              legend={fillTemplate(s.versionLegend, { name: exercise.name })}
              name={`version-${exercise.id}`}
              options={versions.map((key) => ({
                value: key,
                label: variantOf(exercise, key)?.name ?? key,
                detail: variantOf(exercise, key)?.how,
              }))}
              value={variantKey}
              disabled={save.busy}
              onChange={(key) => {
                if (key !== variantKey) changeVersion(key as VariantKey);
              }}
            />
          ) : null}
        </>
      ) : null}
      <Button
        variant="quiet"
        aria-expanded={howOpen}
        aria-controls={howId}
        onClick={() => {
          setHowOpen((o) => !o);
        }}
      >
        {s.howTo}
      </Button>
      <ul id={howId} className="ui-plain-list" hidden={!howOpen}>
        {cuesFor(exercise, variantKey).map((cue) => (
          <li key={cue}>{cue}</li>
        ))}
      </ul>
      {doseLine === undefined || doseLine === null ? null : (
        <p className="ui-text-muted">{doseLine}</p>
      )}
      {tryNext === null ? null : (
        <p className="ui-text-muted">
          {fillTemplate(move.progression.tryNext, {
            variant: variantOf(exercise, tryNext)?.name ?? tryNext,
          })}
        </p>
      )}
      {restLine === null ? null : <p className="ui-text-muted">{restLine}</p>}
      <ol className="ui-sets">
        {ticked.map((set, i) => (
          <li key={`done-${i}`} className="ui-set ui-set--done">
            <span>
              {walk
                ? fillTemplate(s.walkLine, { amount: setText(set) })
                : fillTemplate(s.setLine, { n: i + 1, amount: setText(set) })}
            </span>
            <span aria-hidden="true">✓</span>
            <span className="ui-visually-hidden">{s.doneMark}</span>
          </li>
        ))}
        {activeTarget === null ? null : (
          <ActiveSet
            key={`${ticked.length}-${activeTarget}`}
            n={ticked.length + 1}
            initial={activeTarget}
            unit={exercise.unit}
            perSide={perSide}
            step={step}
            walk={walk}
            busy={save.busy}
            onTick={tick}
            tickRef={tickRef}
          />
        )}
        {toDo.slice(1).map((amount, i) => (
          <li key={`later-${i}`} className="ui-set ui-set--later ui-text-muted">
            {fillTemplate(s.setLine, {
              n: ticked.length + i + 2,
              amount: amountText(exercise.unit, amount, perSide),
            })}
          </li>
        ))}
      </ol>
      {ticked.length > 0 ? (
        <Button
          variant="quiet"
          disabled={save.busy}
          onClick={() => {
            void run((fresh) => untickSet(fresh.movements, atIndex(fresh)));
          }}
        >
          {walk ? s.undoWalk : fillTemplate(s.undoSet, { n: ticked.length })}
        </Button>
      ) : null}
      {!walk &&
      stored !== null &&
      toDo.length === 0 &&
      !extra &&
      ticked.length > 0 &&
      ticked.length < SESSION_LIMITS.maxSets ? (
        <Button
          ref={extraRef}
          variant="quiet"
          onClick={() => {
            setExtra(true);
          }}
        >
          {s.extraSet}
        </Button>
      ) : null}
      {planned !== null && stored === null && toDo.length === 0 && !extra ? (
        <Button
          variant="quiet"
          onClick={() => {
            setExtra(true);
          }}
        >
          {s.logAnyway}
        </Button>
      ) : null}
      <SaveError save={save} />
    </div>
  );
}

/**
 * The session (design section 1.9): the session card with the lighter chip, the progression rule
 * for strength, the heat water line on a beach or hot day, the electrolytes lines for a hot-day
 * strength session (item 26's beachPromptLines gating), the beach prompts one tap away during a
 * beach session, and the jog's ratings line; then a card per block and the actions. The amounts
 * come from a fresh plan for this row (N6).
 */
export function SessionLog({
  data,
  ctx,
  storage,
  template,
  row,
  mode,
  onFinish,
  onRest,
  restDisabled,
}: Omit<PanelProps, 'movement'> & {
  readonly onFinish: () => void;
  readonly onRest: () => void;
  readonly restDisabled: boolean;
}): ReactElement | null {
  const [promptsOpen, setPromptsOpen] = useState(false);
  const promptsId = useId();
  const { preCheck } = row;
  // The flow shows the log only for a row with its check (an in-progress row).
  if (preCheck === null) return null;
  const plan = planSession(data, template, {
    preCheck,
    choice: mode,
    equipment: ctx.equipment,
    sessions: ctx.sessions,
    week: ctx.week,
    today: ctx.today,
    sessionId: row.id,
    variantOverrides: storedVariants(row),
  });
  const blocks = layoutSession(data, template, plan, row);
  const beach = isBeachTemplate(data, template);
  const hot = preCheck.heatOrSun !== 'no';
  const anyTicked = row.movements.some((m) => m.done.length > 0);
  const gateInput = { dietMode: ctx.dietMode, gates: ctx.gates };
  return (
    <>
      <Card
        label={template.name}
        aside={
          mode === 'lighter' ? (
            <span className="ui-chip">{moveScreen.session.lighterChip}</span>
          ) : undefined
        }
      >
        {mode === 'lighter' ? <p>{move.lighter}</p> : null}
        {template.kind === 'strength' ? (
          <p className="ui-text-muted">{move.progression.rule}</p>
        ) : null}
        {beach || hot ? <p>{heatWaterText(data, template, ctx)}</p> : null}
        {!beach && hot
          ? heatElectrolyteLines(gateInput).map((line) => <p key={line}>{line}</p>)
          : null}
        {beach ? (
          <>
            <Button
              variant="quiet"
              aria-expanded={promptsOpen}
              aria-controls={promptsId}
              onClick={() => {
                setPromptsOpen((o) => !o);
              }}
            >
              {move.safety.beachPrompts.title}
            </Button>
            <ul id={promptsId} className="ui-plain-list" hidden={!promptsOpen}>
              {beachPromptLines(gateInput).map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
          </>
        ) : null}
        {template.kind === 'jog' ? (
          <p className="ui-text-muted">{moveScreen.finish.jogRatings}</p>
        ) : null}
      </Card>
      {blocks.map((block) => (
        <Card key={block.block} label={move.structure[block.block]}>
          {block.movements.map((m, i) => (
            <MovementPanel
              key={`${m.exercise?.id ?? m.stored?.exerciseId ?? ''}-${i}`}
              data={data}
              ctx={ctx}
              storage={storage}
              template={template}
              row={row}
              mode={mode}
              movement={m}
            />
          ))}
        </Card>
      ))}
      <ButtonRow stacked>
        <Button variant="primary" block onClick={onFinish}>
          {moveScreen.session.finish}
        </Button>
        {anyTicked ? null : (
          <Button variant="quiet" block disabled={restDisabled} onClick={onRest}>
            {move.choices.skip}
          </Button>
        )}
      </ButtonRow>
    </>
  );
}
