import { today } from '@diet/core/copy/health';
import { Card } from '@diet/ui';
import type { ReactElement } from 'react';
import type { AppStorage } from '../../db/runtime';
import { MoveReadNotice } from './MoveGateNotice';
import { MoveWeekCard } from './MoveWeekCard';
import { useMoveContext } from './useMoveContext';

/**
 * Today's Movement card (UX 2 card 6; design section 1.15), in item 16's slot: this week's plan
 * with today's sessions and their ratings. The card is there from the first render, so Today does
 * not jump; while readiness answer 6 is open it holds only the reason with 111 and Healthline
 * (RD-05), and a failed read offers Reload.
 */
export function MovementCard({ storage }: { readonly storage: AppStorage }): ReactElement {
  const read = useMoveContext(storage);
  if (read.status === 'ready') {
    return <MoveWeekCard data={read.data} ctx={read.ctx} storage={storage} place="today" />;
  }
  return (
    <Card label={today.cards.movement}>
      {read.status === 'pending' ? null : <MoveReadNotice read={read} storage={storage} />}
    </Card>
  );
}
