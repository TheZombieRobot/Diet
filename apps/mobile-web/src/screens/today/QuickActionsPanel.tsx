import { today } from '@diet/core/copy/health';
import { ActionRow, Card, FloatingActionPanel } from '@diet/ui';
import { type ReactElement, useId } from 'react';
import { appStorageStore } from '../../db/runtime';
import { GateNotice } from '../../onboarding/GateNotice';
import { useReadinessGates } from '../../onboarding/state';
import { useStore } from '../../store';
import { quickActionStates } from '../quickActions';

const copy = today.quickActions;

/** The list, once the gates have been read: ready rows act, the rest say why they do nothing. */
function QuickActionList({ close }: { readonly close: () => void }): ReactElement | null {
  const storage = useStore(appStorageStore);
  const view = useReadinessGates(storage);
  const laterNoteId = useId();
  const reasonId = useId();
  if (view === undefined) return null;
  const states = quickActionStates(view.gates);
  return (
    <>
      {/* Above the list, so it is in view however far the panel scrolls (item 16 review). */}
      {states.some(({ state }) => state.kind === 'later') ? (
        <p id={laterNoteId} className="ui-text-muted">
          {copy.laterNote}
        </p>
      ) : null}
      <ul className="ui-quick-actions">
        {states.map(({ id, state }) => {
          const label = copy.labels[id];
          if (state.kind === 'later') {
            return (
              <li key={id}>
                <ActionRow title={label} marker={copy.markerLater} describedBy={laterNoteId} />
              </li>
            );
          }
          if (state.kind === 'off') {
            const describedBy = `${reasonId}-${id}`;
            return (
              <li key={id}>
                <ActionRow title={label} marker={copy.markerOff} describedBy={describedBy} />
                <div id={describedBy}>
                  <GateNotice feature={state.feature} link={false} />
                </div>
              </li>
            );
          }
          const { action } = state;
          return (
            <li key={id}>
              {'href' in action ? (
                <ActionRow href={action.href} title={action.label} badge={action.icon} />
              ) : (
                <ActionRow
                  title={action.label}
                  badge={action.icon}
                  onSelect={() => {
                    close();
                    action.run();
                  }}
                />
              )}
            </li>
          );
        })}
      </ul>
    </>
  );
}

/**
 * The floating "+" on Today and its quick actions (UX_SCREENS section 2; design section 1.10).
 * Until the readiness answers are read, the panel shows only its title.
 */
export function QuickActions(): ReactElement {
  return (
    <FloatingActionPanel label={copy.title}>
      {(close) => (
        <Card label={copy.title}>
          <QuickActionList close={close} />
        </Card>
      )}
    </FloatingActionPanel>
  );
}
