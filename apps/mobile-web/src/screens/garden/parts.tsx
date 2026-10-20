import {
  type Catalogue,
  type CatalogueEntry,
  fillTemplate,
  type RefId,
  searchCatalogue,
} from '@diet/core';
import { gardenScreen, privacy } from '@diet/core/copy/health';
import { Button, Notice, TextField } from '@diet/ui';
import type { ReactElement, Ref } from 'react';
import type { WriteProblem } from './inventory';

/**
 * A crop or pantry item name with the matching foods under it (design 1.5; G12): picking one fills
 * the name and links the row; "Matched to …" shows while the row is linked to a food in the
 * catalogue.
 */
export function NameField({
  label,
  hint,
  value,
  error,
  catalogue,
  linked,
  gardenFirst = true,
  inputRef,
  onChange,
  onPick,
}: {
  readonly label: string;
  readonly hint: string;
  readonly value: string;
  readonly error: string | undefined;
  readonly catalogue: Catalogue;
  /** The ingredient id the row would be stored with now (core linkFor). */
  readonly linked: RefId | null;
  readonly gardenFirst?: boolean;
  readonly inputRef?: Ref<HTMLInputElement> | undefined;
  readonly onChange: (name: string) => void;
  readonly onPick: (entry: CatalogueEntry) => void;
}): ReactElement {
  const suggestions = searchCatalogue(catalogue, value, { gardenFirst });
  const match = catalogue.entries.find((entry) => entry.id === linked);
  return (
    <>
      <TextField
        ref={inputRef}
        label={label}
        hint={hint}
        autoComplete="off"
        value={value}
        error={error}
        onChange={(event) => {
          onChange(event.currentTarget.value);
        }}
      />
      {suggestions.length === 0 ? null : (
        <div role="group" aria-label={gardenScreen.suggestions} className="ui-suggestions">
          {suggestions.map((entry) => (
            <Button
              key={entry.id}
              variant="tint"
              onClick={() => {
                onPick(entry);
              }}
            >
              {entry.name}
            </Button>
          ))}
        </div>
      )}
      {match === undefined ? null : (
        <p className="ui-text-muted">
          {fillTemplate(gardenScreen.matchedTo, { food: match.name })}
        </p>
      )}
    </>
  );
}

/** A failed write that leaves the form open: a full phone, or any other failure (design 1.4). */
export function WriteProblemNotice({
  problem,
}: {
  readonly problem: WriteProblem | null;
}): ReactElement | null {
  if (problem === null || problem === 'closed') return null;
  const text =
    problem === 'full'
      ? privacy.storageFull
      : problem === 'gone'
        ? gardenScreen.gone
        : gardenScreen.errors.saveFailed;
  return (
    <Notice role="alert">
      <p>{text}</p>
    </Notice>
  );
}
