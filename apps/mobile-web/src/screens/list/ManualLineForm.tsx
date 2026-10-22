/**
 * Add an item, or edit one the owner added (item 24 design 1.10; GL-05). A name typed by the owner,
 * an optional amount with its unit, and an aisle; catalogue suggestions link the line to a food,
 * which sets the aisle and gives it the food's substitute hint (J35). Typing after a pick drops the
 * link. No price, stock or cart wording in the name (J37).
 */
import {
  catalogueEntriesFrom,
  fillTemplate,
  type GroceryItem,
  type IngredientView,
  matchKey,
  OTHER_AISLE,
  type RefId,
  SEED_AISLES,
  searchFoods,
} from '@diet/core';
import { grocery } from '@diet/core/copy/health';
import {
  checkManualLine,
  type ManualLineValue,
  type ManualProblem,
  type ManualUnit,
} from '@diet/grocery';
import { Button, ButtonRow, Card, ChoiceList, TextField } from '@diet/ui';
import { type ReactElement, useEffect, useId, useRef, useState } from 'react';
import type { FoodsState } from '../../foods/useFoods';

const copy = grocery.manual;
const UNITS: readonly ManualUnit[] = ['g', 'ml', 'each', 'pack'];

const ERRORS: Readonly<Record<string, string>> = {
  'name:required': copy.errors.nameRequired,
  'name:length': copy.errors.nameLength,
  'name:price-text': copy.errors.nameNoPrice,
  'amount:not-a-number': copy.errors.digitsOnly,
  'amount:range': copy.errors.amountRange,
  'unit:required': copy.errors.unitRequired,
};
const errorFor = (field: string, problem: ManualProblem | undefined): string | undefined =>
  problem === undefined ? undefined : ERRORS[`${field}:${problem}`];

export function ManualLineForm({
  foods,
  editing,
  onSave,
  onCancel,
}: {
  readonly foods: FoodsState;
  /** The line being edited, or null to add one. */
  readonly editing: GroceryItem | null;
  /** Writes the value; resolves to an error message, or null when saved. */
  readonly onSave: (value: Omit<ManualLineValue, 'substituteHint'>) => Promise<string | null>;
  readonly onCancel: () => void;
}): ReactElement {
  const name = useId();
  const [text, setText] = useState(editing?.text ?? '');
  const [linked, setLinked] = useState<{ readonly id: RefId; readonly aisle: string } | null>(
    editing === null || editing.ingredientId === null
      ? null
      : { id: editing.ingredientId, aisle: editing.aisle },
  );
  const [amount, setAmount] = useState(
    editing === null || editing.quantity === null ? '' : String(editing.quantity),
  );
  const [unit, setUnit] = useState<ManualUnit | null>(editing?.unit ?? null);
  const [aisle, setAisle] = useState(editing?.aisle ?? OTHER_AISLE);
  const [problems, setProblems] = useState<
    Partial<Record<'name' | 'amount' | 'unit', ManualProblem>>
  >({});
  const [failure, setFailure] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const nameRef = useRef<HTMLInputElement>(null);
  const amountRef = useRef<HTMLInputElement>(null);
  const unitRef = useRef<HTMLInputElement>(null);
  // The button that opened the form has gone, so focus starts in the form (design 1.13).
  useEffect(() => {
    nameRef.current?.focus();
  }, []);

  const suggestions: readonly IngredientView[] =
    foods.status === 'ready' && linked === null && matchKey(text).length >= 2
      ? searchFoods(catalogueEntriesFrom(foods.views, foods.own), text, { limit: 6 })
          .map((entry) => foods.resolve(entry.id))
          .filter((view): view is IngredientView => view !== null)
      : [];
  const extraAisle = [linked?.aisle, editing?.aisle].find(
    (a): a is string =>
      a !== undefined && a !== OTHER_AISLE && !(SEED_AISLES as readonly string[]).includes(a),
  );
  const aisles = [...SEED_AISLES, ...(extraAisle === undefined ? [] : [extraAisle]), OTHER_AISLE];

  const save = async () => {
    const result = checkManualLine({
      name: text,
      ingredientId: linked?.id ?? null,
      amount,
      unit,
      aisle,
    });
    if (!result.ok) {
      setProblems(result.problems);
      (result.problems.name !== undefined
        ? nameRef
        : result.problems.amount !== undefined
          ? amountRef
          : unitRef
      ).current?.focus();
      return;
    }
    setProblems({});
    setSaving(true);
    const message = await onSave(result.value);
    setSaving(false);
    setFailure(message);
  };

  return (
    <Card
      label={
        editing === null ? copy.addTitle : fillTemplate(copy.editTitle, { item: editing.text })
      }
    >
      <TextField
        ref={nameRef}
        label={copy.name}
        hint={copy.nameHint}
        autoComplete="off"
        value={text}
        error={errorFor('name', problems.name)}
        onChange={(event) => {
          setText(event.currentTarget.value);
          setLinked(null);
        }}
      />
      {suggestions.length === 0 ? null : (
        <div aria-labelledby={`${name}-suggestions`}>
          <p id={`${name}-suggestions`} className="ui-text-muted">
            {copy.suggestions}
          </p>
          {suggestions.map((view) => (
            <Button
              key={view.id}
              variant="quiet"
              onClick={() => {
                setText(view.name);
                setLinked({ id: view.id, aisle: view.aisle });
                setAisle(view.aisle);
                nameRef.current?.focus();
              }}
            >
              {view.name}
            </Button>
          ))}
        </div>
      )}
      <TextField
        ref={amountRef}
        label={copy.amount}
        hint={copy.amountHint}
        inputMode="decimal"
        autoComplete="off"
        value={amount}
        error={errorFor('amount', problems.amount)}
        onChange={(event) => {
          setAmount(event.currentTarget.value);
        }}
      />
      <ChoiceList
        legend={copy.unitLegend}
        name={`${name}-unit`}
        firstInputRef={unitRef}
        options={UNITS.map((u) => ({ value: u, label: copy.units[u] }))}
        value={unit}
        error={errorFor('unit', problems.unit)}
        onChange={(value) => {
          setUnit(value as ManualUnit);
        }}
      />
      <ChoiceList
        legend={copy.aisleLegend}
        name={`${name}-aisle`}
        options={aisles.map((a) => ({ value: a, label: a }))}
        value={aisle}
        onChange={setAisle}
      />
      {failure === null ? null : (
        <p className="ui-text-strong" role="alert">
          {failure}
        </p>
      )}
      <ButtonRow>
        <Button variant="primary" disabled={saving} onClick={() => void save()}>
          {editing === null ? copy.add : copy.save}
        </Button>
        <Button variant="quiet" onClick={onCancel}>
          {copy.cancel}
        </Button>
      </ButtonRow>
    </Card>
  );
}
