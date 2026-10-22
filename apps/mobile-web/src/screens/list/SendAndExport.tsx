/**
 * Send and export, the List screen's last section (checklist item 31 design 1.1 to 1.10; UX_SCREENS
 * 6b; the List mock-up): Send to laptop (or Pair with laptop), Paste code, item 24's Copy text, CSV
 * and JSON, a note that those files are not locked, and one status line. The exports are always
 * there and need no network (TR-12). Only the grocery list's to-buy lines leave the phone, locked
 * with the pairing key, and only after a tap (HS-14); "Received on laptop" follows only a verified
 * acknowledgement of this send (C52). No readiness gate touches the section: the list is not
 * health data.
 */
import type { GroceryListRecord, Id } from '@diet/core';
import { transfer } from '@diet/core/copy/health';
import { Button, LockIcon } from '@diet/ui';
import { type ReactElement, useEffect, useMemo, useRef } from 'react';
import { useLiveQuery } from '../../db/liveQuery';
import { type AppStorage, appStorageStore } from '../../db/runtime';
import { routeHref } from '../../routes';
import { useStore } from '../../store';
import { dispatchSession, transferSessionStore } from '../../transfer/session';
import { useSendList, useTransferView } from '../../transfer/useTransfer';
import { Progress } from '../backup/Progress';
import { useGateOpen } from '../backup/focus';
import { usePairing } from '../pairing/usePairing';
import { ListExportButtons } from './ListExportButtons';
import { PastePanel } from './PastePanel';

const copy = transfer.send;

export function SendAndExport({ listId }: { readonly listId: Id }): ReactElement | null {
  const storage = useStore(appStorageStore);
  return storage === null ? null : <SendWithRecords storage={storage} listId={listId} />;
}

function SendWithRecords({
  storage,
  listId,
}: {
  readonly storage: AppStorage;
  readonly listId: Id;
}): ReactElement | null {
  const readList = useMemo(
    () => (s: AppStorage) => s.repos.groceryLists.get(listId).then((row) => row ?? null),
    [listId],
  );
  const list = useLiveQuery(storage, readList);
  // The list is gone: its session goes with it (any send stops sending, any listening stops).
  useEffect(() => {
    if (list === null && transferSessionStore.get().listId === listId) {
      dispatchSession({ type: 'reset' });
    }
  }, [list, listId]);
  return list === undefined || list === null ? null : <Section storage={storage} list={list} />;
}

function Section({
  storage,
  list,
}: {
  readonly storage: AppStorage;
  readonly list: GroceryListRecord;
}): ReactElement {
  const pairing = usePairing();
  const recordsOpen = useGateOpen(storage.gate);
  const view = useTransferView(storage, list, pairing, recordsOpen);
  const { send, paste } = useSendList(storage);
  const { actions, panel } = view;

  // A panel that opens while the section is on screen takes focus (design 1.4 step 11); one
  // already open when the screen is shown again does not.
  const panelStart = useRef<HTMLParagraphElement | null>(null);
  const shown = useRef(panel?.code ?? null);
  useEffect(() => {
    const code = panel?.code ?? null;
    if (code !== null && code !== shown.current) {
      const start = panelStart.current;
      start?.focus({ preventScroll: true });
      if (typeof start?.scrollIntoView === 'function') start.scrollIntoView({ block: 'start' });
    }
    shown.current = code;
  }, [panel]);

  // Done returns focus to the button that opened the panel (Send for one that opened by itself),
  // as the List screen's other panels do, or to the line when that button cannot take it.
  const sendRef = useRef<HTMLButtonElement | null>(null);
  const pasteRef = useRef<HTMLButtonElement | null>(null);
  const lineRef = useRef<HTMLParagraphElement | null>(null);
  const opener = useRef<'send' | 'paste'>('send');

  const paired = pairing === undefined || pairing === null ? null : pairing;
  return (
    <section aria-label={copy.sectionLabel} className="ui-send">
      {pairing === undefined ? null : actions.primary === 'pair' ? (
        // Until item 33 builds the side panel there is nothing to pair with (the line says so), so
        // Pair with laptop is not the main button; item 33 makes it tall and tinted again.
        <a className="ui-button ui-button--secondary ui-button--block" href={routeHref('pairing')}>
          {copy.pair}
        </a>
      ) : (
        <Button
          ref={sendRef}
          variant="primary"
          block
          className="ui-button--tall"
          disabled={!actions.sendEnabled}
          onClick={() => {
            opener.current = 'send';
            if (paired !== null) void send(list, paired);
          }}
        >
          <LockIcon />
          {copy.send}
        </Button>
      )}
      {pairing === undefined || actions.pasteCode === 'hidden' ? null : (
        <Button
          ref={pasteRef}
          variant="tint"
          block
          disabled={actions.pasteCode === 'disabled'}
          onClick={() => {
            opener.current = 'paste';
            if (paired !== null) void paste(list, paired);
          }}
        >
          {copy.pasteCode}
        </Button>
      )}
      <ListExportButtons list={list} />
      <p className="ui-text-muted ui-send__note">{copy.exportsNote}</p>
      {view.progress === null ? (
        <p ref={lineRef} className="ui-status-line" role="status" tabIndex={-1}>
          {view.line}
        </p>
      ) : (
        <Progress text={view.progress} />
      )}
      {panel === null ? null : (
        <PastePanel
          code={panel.code}
          madeAt={panel.sentAt}
          zone={storage.env.timeZone()}
          startRef={panelStart}
          onDone={() => {
            dispatchSession({ type: 'done' });
            const button = (opener.current === 'paste' ? pasteRef : sendRef).current;
            if (button !== null && !button.disabled) button.focus();
            else lineRef.current?.focus();
          }}
        />
      )}
    </section>
  );
}
