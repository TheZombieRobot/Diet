import {
  type CompleteTarget,
  completeWorkoutTarget,
  type ExerciseData,
  type MoveContext,
  templateIdFromSlug,
  templateSlug,
  todayHeadline,
} from '@diet/core';
import { moveScreen, readiness } from '@diet/core/copy/health';
import { Card } from '@diet/ui';
import { type ReactElement, useEffect, useRef, useState } from 'react';
import { type AppStorage, appStorageStore } from '../../db/runtime';
import { replaceHash } from '../../navigation';
import { moveSessionLink, parseRoute } from '../../routes';
import { useStore } from '../../store';
import { useLocationHash } from '../../useRoute';
import { MoveTabLink } from './links';
import { MoveReadNotice } from './MoveGateNotice';
import { headlineText, sessionHref } from './moveText';
import { SessionFlow } from './SessionFlow';
import { StopSignsCard } from './StopSignsCard';
import { TodayItems } from './TodayItems';
import { useMoveContext } from './useMoveContext';

/**
 * `#/move-session` with no slug: the Complete workout target (design section 1.6). It opens a
 * started session at its finish, the one session not started at its start (both by replacing the
 * address, so Back never returns here), a chooser for two, or a calm line otherwise. It never
 * writes a row (item 26 3.14 point 6).
 */
function Resolver({
  data,
  ctx,
  storage,
}: {
  readonly data: ExerciseData;
  readonly ctx: MoveContext;
  readonly storage: AppStorage;
}): ReactElement | null {
  // Worked out once, when the context first arrives.
  const [target] = useState<CompleteTarget>(() => completeWorkoutTarget(ctx.items));
  const slug =
    target.kind === 'finish' || target.kind === 'start' ? templateSlug(target.templateId) : null;
  useEffect(() => {
    // Only while the address is still the bare session route (never after Back or a tab tap).
    const live = window.location.hash;
    if (
      slug !== null &&
      parseRoute(live) === 'move-session' &&
      moveSessionLink(live).slug === null
    ) {
      replaceHash(sessionHref(slug, target.kind === 'finish'));
    }
  }, [slug, target.kind]);
  if (slug !== null) return null;
  const restDay = todayHeadline(ctx.items).kind === 'rest-day';
  return (
    <Card label={moveScreen.chooser.title}>
      {target.kind === 'choose' ? (
        <TodayItems data={data} ctx={ctx} storage={storage} links="replace" />
      ) : (
        <>
          <p className="ui-text-lead">{headlineText(data, ctx)}</p>
          {restDay ? null : <p className="ui-text-muted">{moveScreen.chooser.nothing}</p>}
        </>
      )}
      <MoveTabLink from="move-session" />
    </Card>
  );
}

function SessionRoute({
  storage,
  slug,
  finish,
}: {
  readonly storage: AppStorage;
  readonly slug: string | null;
  readonly finish: boolean;
}): ReactElement {
  const read = useMoveContext(storage);
  const [reported, setReported] = useState(false);
  const reportedRef = useRef<HTMLParagraphElement>(null);
  const box = useRef<HTMLDivElement>(null);
  const firstSlug = useRef(slug);
  useEffect(() => {
    if (reported && read.status === 'blocked') reportedRef.current?.focus();
  }, [reported, read.status]);
  // A new slug on the same route (the chooser, the resolver): focus the first card after the stop
  // signs, as Shell does for a new screen (section 1.17).
  useEffect(() => {
    if (slug === firstSlug.current) return;
    firstSlug.current = slug;
    box.current?.querySelector('h2')?.focus();
  }, [slug, read.status]);

  let body: ReactElement | null = null;
  if (read.status === 'read-error' || read.status === 'data-error') {
    body = <MoveReadNotice read={read} storage={storage} />;
  } else if (read.status === 'blocked') {
    body = (
      <>
        {reported ? (
          <p ref={reportedRef} role="status" tabIndex={-1}>
            {readiness.changedDone.q6}
          </p>
        ) : null}
        {/* The 111 and Healthline rows are already in the stop-signs card above. */}
        <MoveReadNotice read={read} storage={storage} safetyRows={false} />
      </>
    );
  } else if (read.status === 'ready') {
    body =
      slug === null ? (
        <Resolver data={read.data} ctx={read.ctx} storage={storage} />
      ) : (
        <SessionFlow
          key={slug}
          data={read.data}
          ctx={read.ctx}
          storage={storage}
          templateId={templateIdFromSlug(slug)}
          startAtFinish={finish}
        />
      );
  }
  return (
    <>
      <StopSignsCard
        storage={storage}
        canReport={read.status === 'ready'}
        onReported={() => {
          setReported(true);
        }}
      />
      <div ref={box} className="ui-move-flow">
        {body}
      </div>
    </>
  );
}

/**
 * The session screen (`#/move-session…`; design section 1.6). The stop signs come first in every
 * state, loading, errors and RD-05 included, with 111 and Healthline (HS-28); the rest goes under
 * them. Every way into a session lands here, and only item 26's start gate lets one begin.
 */
export function MoveSessionScreen(): ReactElement | null {
  const storage = useStore(appStorageStore);
  const hash = useLocationHash();
  // On Back or a tab tap the browser can let this screen read the new address a moment before the
  // shell swaps it out: an address of another route is never read as the Complete workout target.
  if (parseRoute(hash) !== 'move-session') return null;
  const { slug, finish } = moveSessionLink(hash);
  if (storage === null) {
    return <StopSignsCard storage={null} canReport={false} onReported={() => undefined} />;
  }
  return <SessionRoute storage={storage} slug={slug} finish={finish} />;
}
