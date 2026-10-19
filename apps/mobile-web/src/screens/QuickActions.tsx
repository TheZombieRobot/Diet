import { Card, FloatingActionButton } from '@diet/ui';
import { useId, useState, type ReactElement } from 'react';

/** The floating "+" on Today. The quick actions themselves arrive with the Today dashboard. */
export function QuickActions(): ReactElement {
  const [open, setOpen] = useState(false);
  const panelId = useId();
  return (
    <>
      {open ? (
        <div id={panelId} className="ui-fab-panel">
          <Card label="Quick actions">
            <p>
              Quick ways to log weight, finish a meal, add a drink or open the grocery list arrive
              with the Today dashboard at a later step of the build checklist.
            </p>
          </Card>
        </div>
      ) : null}
      <FloatingActionButton
        label="Quick actions"
        aria-expanded={open}
        aria-controls={open ? panelId : undefined}
        onClick={() => {
          setOpen((wasOpen) => !wasOpen);
        }}
      />
    </>
  );
}
