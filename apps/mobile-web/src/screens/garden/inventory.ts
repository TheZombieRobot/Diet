/**
 * What the garden and pantry screen's parts share (item 19 design 1.4 to 1.7): which form is open,
 * how a failed write is told, the unit choices and the order rows are listed in.
 */
import {
  type Catalogue,
  type GardenRecord,
  gardenRowStatus,
  type LocalDate,
  type PantryRecord,
  StorageInvariantError,
} from '@diet/core';
import { garden, gardenScreen } from '@diet/core/copy/health';
import type { ChoiceOption } from '@diet/ui';
import { useSyncExternalStore } from 'react';
import { StorageClosedError, StorageFullError, StorageRuleError } from '../../db/errors';
import type { WriteGate } from '../../db/gate';
import type { AppStorage } from '../../db/runtime';

/** The one form open on the screen (G30): a crop (null id: adding), the harvest panel, or a pantry item. */
export type OpenForm =
  | { readonly kind: 'crop'; readonly id: string | null }
  | { readonly kind: 'harvest' }
  | { readonly kind: 'pantry'; readonly id: string | null };

export const sameForm = (a: OpenForm | null, b: OpenForm | null): boolean =>
  a === null || b === null
    ? a === b
    : a.kind === b.kind && ('id' in a ? a.id : null) === ('id' in b ? b.id : null);

/** What every part of the screen reads. */
export interface InventoryContext {
  readonly storage: AppStorage;
  readonly today: LocalDate;
  readonly zone: string;
  readonly catalogue: Catalogue;
  /** The write gate has closed (a restore or delete-all here or in another tab): nothing saves. */
  readonly closed: boolean;
}

export type CardId = 'garden' | 'pantry';
/** The buttons that open a form, for focus when it closes. */
export type OpenerButton = 'add-harvest' | 'add-crop' | 'add-pantry';
/** Where focus goes when a form closes: a row's button, or the button that opened the form. */
export type FocusTarget = { readonly row: string } | { readonly button: OpenerButton };

/** What the cards and forms ask of the screen, which owns the open form and the messages. */
export interface InventoryActions {
  /** Opens a form, or closes the open one with null, unless it has unsaved typing (G30). */
  readonly request: (form: OpenForm | null) => void;
  /** The open form has unsaved typing. */
  readonly markDirty: () => void;
  /** Closes the open form, says `status` in the card's status line and moves focus. */
  readonly finish: (card: CardId, status: string | null, focus: FocusTarget) => void;
  /** Leaves the open form unsaved for another the owner chose (edit the duplicate listed). */
  readonly switchTo: (form: OpenForm, focus: FocusTarget) => void;
  /** Says something in a card's status line (a photo kept or removed). */
  readonly say: (card: CardId, text: string) => void;
  /** A card-level alert: a failed Ready switch, or a row removed in the meantime. */
  readonly alert: (card: CardId, problem: WriteProblem) => void;
  /** Ref callbacks for the row buttons and the opener buttons. */
  readonly rowRef: (id: string) => (element: HTMLButtonElement | null) => void;
  readonly openerRef: (button: OpenerButton) => (element: HTMLButtonElement | null) => void;
}

/** How a failed write is told (design 1.4, states table). */
export type WriteProblem = 'closed' | 'full' | 'gone' | 'failed';

export function writeProblemOf(error: unknown): WriteProblem {
  if (error instanceof StorageClosedError) return 'closed';
  if (error instanceof StorageFullError) return 'full';
  if (error instanceof StorageRuleError && error.rule === 'not-found') return 'gone';
  if (error instanceof StorageInvariantError && error.rule === 'garden-photo') return 'gone';
  return 'failed';
}

/** True once the write gate has closed; re-renders when it does. */
export function useGateClosed(gate: WriteGate): boolean {
  return useSyncExternalStore(
    (onChange) => gate.onClose(onChange),
    () => !gate.isOpen(),
    () => !gate.isOpen(),
  );
}

export const GARDEN_UNIT_OPTIONS: readonly ChoiceOption[] = [
  { value: 'g', label: garden.unitOptions.g },
  { value: 'each', label: garden.unitOptions.each },
  { value: 'bunch', label: garden.unitOptions.bunch },
];

export const PANTRY_UNIT_OPTIONS: readonly ChoiceOption[] = [
  { value: 'g', label: gardenScreen.pantryUnitOptions.g },
  { value: 'ml', label: gardenScreen.pantryUnitOptions.ml },
  { value: 'each', label: gardenScreen.pantryUnitOptions.each },
];

export const byName = (a: { readonly name: string }, b: { readonly name: string }): number =>
  a.name.localeCompare(b.name, 'en-NZ', { sensitivity: 'base' });

/** Usable crops first, then by days left (crops with a figure first), then by name. */
export function sortCrops(rows: readonly GardenRecord[], today: LocalDate): GardenRecord[] {
  const keyed = rows.map((row) => ({ row, status: gardenRowStatus(row, today) }));
  keyed.sort(
    (a, b) =>
      Number(b.status.usable) - Number(a.status.usable) ||
      (a.status.daysLeft ?? Number.POSITIVE_INFINITY) -
        (b.status.daysLeft ?? Number.POSITIVE_INFINITY) ||
      byName(a.row, b.row),
  );
  return keyed.map((k) => k.row);
}

export const sortPantry = (rows: readonly PantryRecord[]): PantryRecord[] => [...rows].sort(byName);

/** A stored number as the owner typed it ("1200", "2.5"), never the display text (G31). */
export const numberText = (value: number | null): string => (value === null ? '' : String(value));
