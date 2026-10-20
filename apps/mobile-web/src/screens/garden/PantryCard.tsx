import { type PantryRecord, pantryRowView } from '@diet/core';
import { gardenScreen } from '@diet/core/copy/health';
import { Button, Card, ItemRow, Notice } from '@diet/ui';
import type { ReactElement } from 'react';
import {
  type InventoryActions,
  type InventoryContext,
  type OpenForm,
  sortPantry,
} from './inventory';
import { PantryForm } from './PantryForm';

const copy = gardenScreen;

/** The Pantry card (design 1.4): the items by name, each opening its form in place; Add to pantry. */
export function PantryCard({
  ctx,
  rows,
  open,
  status,
  alert,
  actions,
}: {
  readonly ctx: InventoryContext;
  readonly rows: readonly PantryRecord[] | null;
  readonly open: OpenForm | null;
  readonly status: string;
  readonly alert: string | null;
  readonly actions: InventoryActions;
}): ReactElement {
  const at = { today: ctx.today, zone: ctx.zone, hasDataset: ctx.catalogue.hasDataset };
  const addOpen = open?.kind === 'pantry' && open.id === null;
  const form = (row: PantryRecord | null) => (
    <PantryForm
      ctx={ctx}
      row={row}
      rows={rows ?? []}
      onDirty={actions.markDirty}
      onSaved={(id) => {
        actions.finish('pantry', copy.saved, { row: id });
      }}
      onRemoved={() => {
        actions.finish('pantry', copy.removed, { button: 'add-pantry' });
      }}
      onCancel={() => {
        actions.finish('pantry', null, row === null ? { button: 'add-pantry' } : { row: row.id });
      }}
      onGone={() => {
        actions.alert('pantry', 'gone');
      }}
      onEditExisting={(id) => {
        actions.switchTo({ kind: 'pantry', id }, { row: id });
      }}
    />
  );
  return (
    <Card label={copy.pantryCard}>
      <p role="status" className="ui-status-line">
        {status}
      </p>
      {alert === null ? null : (
        <Notice role="alert">
          <p>{alert}</p>
        </Notice>
      )}
      {rows === null ? (
        <p className="ui-text-muted">{copy.loading}</p>
      ) : (
        <>
          {rows.length === 0 ? (
            <p className="ui-text-muted">{copy.emptyPantry}</p>
          ) : (
            <ul className="ui-item-list" data-testid="pantry-items">
              {sortPantry(rows).map((row) => {
                const view = pantryRowView(row, at);
                const expanded = open?.kind === 'pantry' && open.id === row.id;
                return (
                  <ItemRow
                    key={row.id}
                    buttonRef={actions.rowRef(row.id)}
                    title={row.name}
                    value={view.value}
                    detail={view.detail}
                    note={view.note}
                    expanded={expanded}
                    onToggle={() => {
                      actions.request(expanded ? null : { kind: 'pantry', id: row.id });
                    }}
                  >
                    {expanded ? form(row) : null}
                  </ItemRow>
                );
              })}
            </ul>
          )}
          <Button
            ref={actions.openerRef('add-pantry')}
            block
            aria-expanded={addOpen}
            onClick={() => {
              actions.request(addOpen ? null : { kind: 'pantry', id: null });
            }}
          >
            {copy.addPantry}
          </Button>
          {addOpen ? form(null) : null}
        </>
      )}
    </Card>
  );
}
