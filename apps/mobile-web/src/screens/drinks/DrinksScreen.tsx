/**
 * Drinks (UX 5; item 28 design 2.1; A1): one scrolling screen with the Talk to someone card at the
 * top while a trigger shows, a row of jump buttons, then Log (5a), Trends (5b), and Guidance and
 * help (5c). The Help card, with the first-run notice and every help number, is there in every
 * state: while the records open, after a failed read, before the notice and while drink logging is
 * off (HS-13, AL-12, A12). Under 18 the help card still follows all four triggers, and nothing
 * logged is lost (RD-01, RD-06, A23). Focus is never left on <body> (focus.ts). Nothing here needs
 * the network.
 */
import { alcohol } from '@diet/core/copy/health';
import { Button, ButtonRow, Card } from '@diet/ui';
import { type ReactElement, useRef, useState } from 'react';
import { appStorageStore, type AppStorage } from '../../db/runtime';
import { GateNotice } from '../../onboarding/GateNotice';
import { useStore } from '../../store';
import { AlcoholHelpCard } from '../today/AlcoholHelpCard';
import { DayNoteCard } from './DayNoteCard';
import { DrinksHelpCard } from './DrinksHelpCard';
import { scrollToTop, useDrinksFocusRescue, useFocusNext } from './focus';
import { GuidanceCard } from './GuidanceCard';
import { LogCard } from './LogCard';
import { MilestonesCard } from './MilestonesCard';
import { PresetEditor } from './PresetEditor';
import { SummaryCard } from './SummaryCard';
import { TrendsCard } from './TrendsCard';
import { useDrinksView } from './useDrinksView';

const a = alcohol.screen;

const PARTS = [
  { id: 'drinks-log', label: a.jumpLog },
  { id: 'drinks-trends', label: a.jumpTrends },
  { id: 'drinks-guidance', label: a.jumpGuidance },
] as const;

/** Scrolls to a part and moves focus to it (buttons, not "#" links: "#" is the router). */
function jumpTo(id: string): void {
  const part = document.getElementById(id);
  if (part !== null) scrollToTop(part);
}

export function DrinksScreen(): ReactElement {
  const storage = useStore(appStorageStore);
  const screen = useRef<HTMLDivElement>(null);
  useDrinksFocusRescue(screen);
  return (
    <div ref={screen} className="ui-drinks-screen" data-testid="drinks-screen">
      {storage === null ? (
        <>
          <p className="ui-text-muted">{a.opening}</p>
          <DrinksHelpCard />
        </>
      ) : (
        <DrinksWithRecords storage={storage} />
      )}
    </div>
  );
}

function DrinksWithRecords({ storage }: { readonly storage: AppStorage }): ReactElement {
  const state = useDrinksView(storage);
  const [editingPresets, setEditingPresets] = useState(false);
  const firstJump = useRef<HTMLButtonElement>(null);
  const editPresets = useRef<HTMLButtonElement>(null);
  const focusNext = useFocusNext();

  if (state.kind !== 'ready') {
    return (
      <>
        <p className="ui-text-muted">{state.kind === 'failed' ? a.readFailed : a.opening}</p>
        <DrinksHelpCard />
      </>
    );
  }
  const { view } = state;
  const help = (
    <AlcoholHelpCard
      storage={storage}
      drinks={state}
      onHidden={() => {
        firstJump.current?.focus();
      }}
    />
  );
  if (view.access !== 'open') {
    return (
      <>
        {help}
        <Card label={a.cardLabel}>
          {view.access === 'notice-first' ? (
            <p>{alcohol.access.noticeFirst}</p>
          ) : (
            <>
              <GateNotice feature="alcoholLogging" link={false} />
              {view.hasRecords ? <p>{alcohol.access.kept}</p> : null}
            </>
          )}
        </Card>
        <DrinksHelpCard />
      </>
    );
  }
  return (
    <>
      {help}
      <nav aria-label={a.jumpTo}>
        <ButtonRow>
          {PARTS.map((part, i) => (
            <Button
              key={part.id}
              ref={i === 0 ? firstJump : undefined}
              variant="quiet"
              onClick={() => {
                jumpTo(part.id);
              }}
            >
              {part.label}
            </Button>
          ))}
        </ButtonRow>
      </nav>
      <div id="drinks-log" tabIndex={-1} className="ui-drinks-part ui-step-start">
        <LogCard
          storage={storage}
          view={view}
          editingPresets={editingPresets}
          editPresetsRef={editPresets}
          onEditPresets={() => {
            const opening = !editingPresets;
            setEditingPresets(opening);
            // The editor is drawn below the Log card, often below the fold: bring it into view.
            if (opening) {
              focusNext(() => {
                const editor = document.getElementById('drinks-presets');
                const heading = editor?.querySelector<HTMLElement>('h2');
                if (editor !== null && heading !== null && heading !== undefined) {
                  scrollToTop(editor, heading);
                }
                return null;
              });
            }
          }}
        />
        {editingPresets ? (
          <div id="drinks-presets">
            <PresetEditor
              storage={storage}
              view={view}
              onDone={() => {
                setEditingPresets(false);
                focusNext(() => editPresets.current);
              }}
            />
          </div>
        ) : null}
        <SummaryCard view={view} />
      </div>
      <div id="drinks-trends" tabIndex={-1} className="ui-drinks-part ui-step-start">
        <TrendsCard storage={storage} view={view} />
        <MilestonesCard storage={storage} view={view} />
        <DayNoteCard storage={storage} view={view} />
      </div>
      <div id="drinks-guidance" tabIndex={-1} className="ui-drinks-part ui-step-start">
        <GuidanceCard view={view} />
        <DrinksHelpCard />
      </div>
    </>
  );
}
