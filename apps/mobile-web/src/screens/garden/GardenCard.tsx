import { fillTemplate, type GardenRecord, gardenRowView } from '@diet/core';
import { gardenScreen } from '@diet/core/copy/health';
import { Button, Card, ItemRow, Notice, Switch, Thumbnail } from '@diet/ui';
import { type ReactElement, type Ref, useState } from 'react';
import type { AppStorage } from '../../db/runtime';
import { usePhotoUrl } from '../../garden/photoStore';
import type { PhotoPlatform } from '../../garden/preparePhoto';
import { CropPanel } from './CropPanel';
import { HarvestPanel } from './HarvestPanel';
import {
  type InventoryActions,
  type InventoryContext,
  type OpenForm,
  sortCrops,
  writeProblemOf,
} from './inventory';

const copy = gardenScreen;

/** The thumbnail of a crop with a photo: only these rows read photo bytes. */
function CropPhoto({
  storage,
  gardenId,
}: {
  readonly storage: AppStorage;
  readonly gardenId: string;
}): ReactElement {
  return <Thumbnail src={usePhotoUrl(storage, gardenId)} alt="" size="row" />;
}

/**
 * The Ready switch on a crop row (G28): beside the row button, named with the crop, saved at once.
 * While the save runs it shows the new state; a failed save puts the stored one back and the card
 * says why.
 */
function ReadySwitch({
  ctx,
  row,
  actions,
}: {
  readonly ctx: InventoryContext;
  readonly row: GardenRecord;
  readonly actions: InventoryActions;
}): ReactElement {
  const [pending, setPending] = useState<boolean | null>(null);
  return (
    <Switch
      label={copy.readySwitch}
      accessibleName={fillTemplate(copy.readySwitchName, { crop: row.name })}
      checked={pending ?? row.harvestReady}
      busy={pending !== null}
      disabled={ctx.closed}
      onChange={(on) => {
        setPending(on);
        ctx.storage.repos.garden
          .update(row.id, { harvestReady: on })
          .catch((failed: unknown) => {
            actions.alert('garden', writeProblemOf(failed));
          })
          .finally(() => {
            setPending(null);
          });
      }}
    />
  );
}

export interface GardenCardProps {
  readonly ctx: InventoryContext;
  readonly rows: readonly GardenRecord[] | null;
  readonly photoIds: ReadonlySet<string> | undefined;
  readonly open: OpenForm | null;
  readonly dirty: boolean;
  readonly status: string;
  readonly alert: string | null;
  readonly photoPlatform: PhotoPlatform;
  readonly actions: InventoryActions;
  /** The harvest panel's first control, focused when the panel opens from its button. */
  readonly harvestFirstRef: Ref<HTMLInputElement>;
}

/**
 * The Garden card (design 1.4): Add harvest, the crops (usable first, then by days left, then by
 * name), Add a crop. Each row opens its panel in place; only one form is open on the screen.
 */
export function GardenCard({
  ctx,
  rows,
  photoIds,
  open,
  dirty,
  status,
  alert,
  photoPlatform,
  actions,
  harvestFirstRef,
}: GardenCardProps): ReactElement {
  const at = { today: ctx.today, zone: ctx.zone, hasDataset: ctx.catalogue.hasDataset };
  const views =
    rows === null
      ? []
      : sortCrops(rows, ctx.today).map((row) => ({ row, view: gardenRowView(row, at) }));
  const usable = views.filter((v) => v.view.usable).length;
  const harvestOpen = open?.kind === 'harvest';
  const addOpen = open?.kind === 'crop' && open.id === null;
  const done = (id: string, text: string) => {
    actions.finish('garden', text, { row: id });
  };
  const panel = (row: GardenRecord | null) => (
    <CropPanel
      ctx={ctx}
      row={row}
      rows={rows ?? []}
      hasPhoto={row !== null && (photoIds?.has(row.id) ?? false)}
      photoPlatform={photoPlatform}
      dirty={dirty}
      onDirty={actions.markDirty}
      onSaved={(id) => {
        done(id, copy.saved);
      }}
      onRemoved={() => {
        actions.finish('garden', copy.removed, { button: 'add-crop' });
      }}
      onCancel={() => {
        actions.finish('garden', null, row === null ? { button: 'add-crop' } : { row: row.id });
      }}
      onGone={() => {
        actions.alert('garden', 'gone');
      }}
      onEditExisting={(id) => {
        actions.switchTo({ kind: 'crop', id }, { row: id });
      }}
      onStatus={(text) => {
        actions.say('garden', text);
      }}
    />
  );

  return (
    <Card
      label={copy.gardenCard}
      aside={
        usable === 0 ? undefined : (
          <span className="ui-pill" data-testid="garden-ready-pill">
            {fillTemplate(copy.readyPill, { count: usable })}
          </span>
        )
      }
    >
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
          <Button
            ref={actions.openerRef('add-harvest')}
            variant="primary"
            block
            aria-expanded={harvestOpen}
            onClick={() => {
              actions.request(harvestOpen ? null : { kind: 'harvest' });
            }}
          >
            {copy.addHarvest}
          </Button>
          {harvestOpen ? (
            <HarvestPanel
              ctx={ctx}
              rows={rows}
              firstControlRef={harvestFirstRef}
              onDirty={actions.markDirty}
              onSaved={done}
              onCancel={() => {
                actions.finish('garden', null, { button: 'add-harvest' });
              }}
              onGone={() => {
                actions.alert('garden', 'gone');
              }}
            />
          ) : null}
          {views.length === 0 ? (
            <p className="ui-text-muted">{copy.emptyGarden}</p>
          ) : (
            <ul className="ui-item-list" data-testid="garden-crops">
              {views.map(({ row, view }) => {
                const expanded = open?.kind === 'crop' && open.id === row.id;
                return (
                  <ItemRow
                    key={row.id}
                    buttonRef={actions.rowRef(row.id)}
                    thumbnail={
                      photoIds?.has(row.id) === true ? (
                        <CropPhoto storage={ctx.storage} gardenId={row.id} />
                      ) : (
                        <Thumbnail src={null} alt="" size="row" />
                      )
                    }
                    title={row.name}
                    value={view.value}
                    detail={view.detail}
                    detailTone={view.detailTone}
                    note={view.note}
                    expanded={expanded}
                    onToggle={() => {
                      actions.request(expanded ? null : { kind: 'crop', id: row.id });
                    }}
                    trailing={
                      expanded ? undefined : <ReadySwitch ctx={ctx} row={row} actions={actions} />
                    }
                  >
                    {expanded ? panel(row) : null}
                  </ItemRow>
                );
              })}
            </ul>
          )}
          <Button
            ref={actions.openerRef('add-crop')}
            block
            aria-expanded={addOpen}
            onClick={() => {
              actions.request(addOpen ? null : { kind: 'crop', id: null });
            }}
          >
            {copy.addCrop}
          </Button>
          {addOpen ? panel(null) : null}
        </>
      )}
    </Card>
  );
}
