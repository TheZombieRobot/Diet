import type { ReactElement } from 'react';
import { type AppStorage, appStorageStore } from '../../db/runtime';
import { useStore } from '../../store';
import { BeachCard } from './BeachCard';
import { HistoryCard } from './HistoryCard';
import { MoveReadNotice } from './MoveGateNotice';
import { MoveWeekCard } from './MoveWeekCard';
import { useMoveContext } from './useMoveContext';

/**
 * The Move tab (UX 4a, 4d; checklist item 27): this week, the beach walks and jogging card, and
 * the recent sessions. While readiness answer 6 is open, only its reason, 111 and Healthline, and
 * a line that logged sessions are kept (RD-05).
 */
export function MoveScreen(): ReactElement | null {
  const storage = useStore(appStorageStore);
  return storage === null ? null : <MoveWithStorage storage={storage} />;
}

function MoveWithStorage({ storage }: { readonly storage: AppStorage }): ReactElement | null {
  const read = useMoveContext(storage);
  if (read.status === 'pending') return null;
  if (read.status !== 'ready') return <MoveReadNotice read={read} storage={storage} />;
  const { data, ctx } = read;
  return (
    <>
      <MoveWeekCard data={data} ctx={ctx} storage={storage} place="move" />
      <BeachCard data={data} ctx={ctx} storage={storage} />
      <HistoryCard data={data} ctx={ctx} />
    </>
  );
}
