import { type ExerciseData, fillTemplate, type MoveContext } from '@diet/core';
import { move, moveScreen } from '@diet/core/copy/health';
import { Button, Card, Switch } from '@diet/ui';
import { type ReactElement, useId, useState } from 'react';
import type { AppStorage } from '../../db/runtime';
import { SaveError } from '../../onboarding/SaveError';
import { useSave } from '../../onboarding/useSave';
import { walkMinutes } from './moveText';

/** The jog status lines for item 26's JogState (UX 4d; C51). */
function statusLines(ctx: MoveContext): string[] {
  const progress = fillTemplate(move.jog.progress, { count: ctx.jog.toleratedWalks });
  switch (ctx.jog.state) {
    case 'off-few':
      return [move.jog.locked, progress, move.jog.needsOptIn];
    case 'off-ready':
      return [move.jog.readyOptIn];
    case 'on-few':
      return [move.jog.locked, progress];
    case 'paused':
      return [move.jog.paused];
    case 'unlocked':
      return [move.jog.optional, move.jog.addToPlan];
  }
}

/**
 * Beach walks and jogging (UX 4d; EX-06; design section 1.12): the jog status, what a tolerated
 * walk is, and the opt-in switch. Turning the switch on never adds a jog: one is added only in
 * the weekly plan editor once jogging is unlocked (HS section 6 "No compulsory running").
 */
export function BeachCard({
  data,
  ctx,
  storage,
}: {
  readonly data: ExerciseData;
  readonly ctx: MoveContext;
  readonly storage: AppStorage;
}): ReactElement {
  const [open, setOpen] = useState(false);
  const panelId = useId();
  const save = useSave();
  return (
    <Card label={moveScreen.beach.title}>
      {statusLines(ctx).map((line) => (
        <p key={line}>{line}</p>
      ))}
      <Button
        variant="quiet"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => {
          setOpen((o) => !o);
        }}
      >
        {moveScreen.beach.toleratedButton}
      </Button>
      <div id={panelId} hidden={!open}>
        <p>{fillTemplate(move.jog.tolerated, { minutes: walkMinutes(data) })}</p>
      </div>
      <Switch
        label={move.jog.toggle.label}
        hint={move.jog.toggle.hint}
        checked={ctx.jogOptIn}
        busy={save.busy}
        onChange={(on) => {
          void save.run(() => storage.repos.profile.update({ jogOptIn: on }));
        }}
      />
      <SaveError save={save} />
    </Card>
  );
}
