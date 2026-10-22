import {
  type ExerciseData,
  fillTemplate,
  type MoveContext,
  ratingPatch,
  restedSessionDraft,
  restUndo,
  sessionMinutes,
  startGateFor,
  type TodayItem,
  templateSlug,
} from '@diet/core';
import { move, moveScreen } from '@diet/core/copy/health';
import { Button, ButtonRow } from '@diet/ui';
import { type ReactElement, type ReactNode, useEffect, useId, useRef, useState } from 'react';
import type { AppStorage } from '../../db/runtime';
import { SaveError } from '../../onboarding/SaveError';
import { useSave } from '../../onboarding/useSave';
import { ReplaceLink } from './links';
import { ratingsNote, sessionHref } from './moveText';
import { RatingGroups } from './RatingGroups';
import { moveSaveMessage, removeRestedSession, writeSession } from './sessionWrites';

function Link({
  href,
  primary,
  replace,
  children,
}: {
  readonly href: string;
  readonly primary: boolean;
  readonly replace: boolean;
  readonly children: ReactNode;
}): ReactElement {
  const className = `ui-button ui-button--block ui-button--${primary ? 'primary' : 'secondary'}`;
  return replace ? (
    <ReplaceLink href={href} className={className}>
      {children}
    </ReplaceLink>
  ) : (
    <a className={className} href={href}>
      {children}
    </a>
  );
}

/**
 * One of today's sessions (design section 1.5). Every Start, Continue and Finish is a link to the
 * session screen, which shows the stop signs first; nothing starts, ticks or finishes here
 * (HS-28). A session the start gate refuses shows why and no Start. "Rest instead" writes a rest
 * without the check, which can be undone all day; a done session's ratings can be changed here.
 */
function TodayItemRow({
  data,
  ctx,
  storage,
  item,
  replace,
}: {
  readonly data: ExerciseData;
  readonly ctx: MoveContext;
  readonly storage: AppStorage;
  readonly item: TodayItem;
  readonly replace: boolean;
}): ReactElement {
  const nameId = useId();
  const nameRef = useRef<HTMLParagraphElement>(null);
  const save = useSave(moveSaveMessage);
  // Disabled from the tap until the live item changes or the write fails (N31).
  const key = `${item.state}:${item.row?.id ?? ''}`;
  const [pending, setPending] = useState<string | null>(null);
  if (pending !== null && pending !== key) setPending(null);
  const busy = pending !== null || save.busy;
  // The tapped button goes with the change, so focus goes to the session's name (section 1.17).
  const focusName = useRef(false);
  useEffect(() => {
    if (!focusName.current) return;
    focusName.current = false;
    nameRef.current?.focus();
  }, [key]);
  const name = item.template?.name ?? moveScreen.today.unknownTemplate;
  const slug = templateSlug(item.templateId);
  const { row } = item;

  const write = (change: () => Promise<unknown>) => {
    setPending(key);
    focusName.current = true;
    void save.run(change).then((ok) => {
      if (ok) return;
      setPending(null);
      focusName.current = false;
    });
  };
  const restInstead =
    item.template === null ? null : (
      <Button
        variant="quiet"
        disabled={busy}
        onClick={() => {
          write(() =>
            row === null
              ? writeSession(
                  storage,
                  data,
                  null,
                  restedSessionDraft({
                    today: ctx.today,
                    templateId: item.templateId,
                    preCheck: null,
                  }),
                )
              : writeSession(storage, data, row.id, { status: 'rested' }, 'unchecked'),
          );
        }}
      >
        {fillTemplate(moveScreen.today.restInstead, { name })}
      </Button>
    );

  let detail: ReactNode = null;
  let actions: ReactNode = null;
  if (item.state === 'not-started') {
    const gate = startGateFor(data, ctx, item.templateId, row?.id ?? null);
    if (gate.kind === 'ready' && item.template !== null) {
      detail = fillTemplate(moveScreen.today.minutes, {
        minutes: sessionMinutes(data, item.template, ctx.equipment),
      });
      actions = (
        <>
          {slug === null ? null : (
            <Link href={sessionHref(slug)} primary replace={replace}>
              {fillTemplate(moveScreen.today.start, { name })}
            </Link>
          )}
          {restInstead}
        </>
      );
    } else {
      detail = gate.kind === 'refused' ? move.start.problems[gate.problem] : null;
      actions = restInstead;
    }
  } else if (item.state === 'in-progress' && row !== null) {
    const gate = startGateFor(data, ctx, item.templateId, row.id);
    const ready = gate.kind === 'ready';
    detail = ready ? (
      moveScreen.today.inProgress
    ) : (
      <>
        {gate.kind === 'refused' ? move.start.problems[gate.problem] : null}{' '}
        {moveScreen.session.refusedKept}
      </>
    );
    actions =
      slug === null ? null : (
        <>
          <Link href={sessionHref(slug, true)} primary={ready} replace={replace}>
            {fillTemplate(moveScreen.today.finish, { name })}
          </Link>
          {ready ? (
            <Link href={sessionHref(slug)} primary={false} replace={replace}>
              {fillTemplate(moveScreen.today.continue, { name })}
            </Link>
          ) : null}
        </>
      );
  } else if (item.state === 'done' && row !== null) {
    detail = move.week.dayDone;
    const note = ratingsNote(data, item.templateId);
    // A done row with no check (only from a backup) is read-only: its ratings cannot be written.
    actions =
      row.preCheck === null ? null : (
        <div role="group" aria-labelledby={nameId}>
          <RatingGroups
            rowId={row.id}
            values={row}
            busy={save.busy}
            onRate={(field, value) => {
              void save.run(() =>
                writeSession(storage, data, row.id, ratingPatch(field, value), 'done'),
              );
            }}
          />
          {note === null ? null : <p className="ui-text-muted">{note}</p>}
        </div>
      );
  } else if (item.state === 'rested' && row !== null) {
    detail = move.rest.rested;
    const undo = restUndo(data, ctx, row);
    const label = fillTemplate(moveScreen.today.undoRest, { name });
    if (undo === 'remove') {
      actions = (
        <Button
          variant="quiet"
          disabled={busy}
          onClick={() => {
            write(() => removeRestedSession(storage, row.id));
          }}
        >
          {label}
        </Button>
      );
    } else if (undo === 'reopen' && slug !== null) {
      // Opens the rested session, whose button offers the same choice again (section 1.11).
      actions = (
        <a className="ui-button ui-button--quiet" href={sessionHref(slug)}>
          {fillTemplate(moveScreen.today.changeChoice, { name })}
        </a>
      );
    }
  }

  return (
    <li className="ui-move-item" data-testid={`today-item-${slug ?? item.templateId}`}>
      <p ref={nameRef} className="ui-text-strong" id={nameId} tabIndex={-1}>
        {name}
      </p>
      {detail === null ? null : <p className="ui-text-muted">{detail}</p>}
      {actions === null ? null : <ButtonRow stacked>{actions}</ButtonRow>}
      <SaveError save={save} />
    </li>
  );
}

/** Today's sessions, in todaySessions order (design section 1.5). */
export function TodayItems({
  data,
  ctx,
  storage,
  links,
}: {
  readonly data: ExerciseData;
  readonly ctx: MoveContext;
  readonly storage: AppStorage;
  /** 'replace' on the Complete workout chooser, so Back never returns to it. */
  readonly links: 'push' | 'replace';
}): ReactElement | null {
  if (ctx.items.length === 0) return null;
  return (
    <ul className="ui-rows">
      {ctx.items.map((item) => (
        <TodayItemRow
          key={item.templateId}
          data={data}
          ctx={ctx}
          storage={storage}
          item={item}
          replace={links === 'replace'}
        />
      ))}
    </ul>
  );
}
