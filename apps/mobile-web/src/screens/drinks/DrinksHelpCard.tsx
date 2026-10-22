import { alcohol, helpNumbers } from '@diet/core/copy/health';
import { Card } from '@diet/ui';
import type { ReactElement } from 'react';
import { HelpNumberList } from '../HelpNumbers';

/**
 * The Help card at the end of the Drinks screen (HS-13, AL-12; item 28 design 2.12, A12): the
 * first-run notice and every help number. It needs no records, so it shows in every state: while
 * the records open, after a failed read and while drink logging is off.
 */
export function DrinksHelpCard(): ReactElement {
  return (
    <Card label={alcohol.help.cardLabel}>
      <p>{alcohol.firstRunNotice}</p>
      <p className="ui-text-muted">{helpNumbers.intro}</p>
      <HelpNumberList />
    </Card>
  );
}
