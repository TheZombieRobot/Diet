import { foods } from '@diet/core/copy/health';
import { Card, ExpandableRow, TextField } from '@diet/ui';
import type { ReactElement } from 'react';
import { FoodDetail } from './FoodDetail';
import type { FoodsModel } from './foodsModel';

export interface FoodsViewProps {
  readonly model: FoodsModel;
  readonly query: string;
  readonly onQuery: (query: string) => void;
  readonly onToggle: (id: string) => void;
}

/** "Foods in the app" as the model says (item 18 design 1.3); it formats nothing. */
export function FoodsView({ model, query, onQuery, onToggle }: FoodsViewProps): ReactElement {
  return (
    <>
      <Card label={foods.screen.findLabel}>
        <p className="ui-text-muted">{foods.screen.intro}</p>
        <TextField
          label={foods.screen.searchLabel}
          hint={foods.screen.searchHint}
          type="search"
          autoComplete="off"
          enterKeyHint="search"
          value={query}
          onChange={(event) => {
            onQuery(event.target.value);
          }}
        />
        <p role="status" className="ui-text-muted">
          {model.statusText}
        </p>
      </Card>
      {model.cards.map((card) => (
        <Card key={card.key} label={card.label}>
          <ul className="ui-divider-rows">
            {card.rows.map((row) => (
              <ExpandableRow
                key={row.id}
                title={row.title}
                detail={row.detail ?? undefined}
                flag={row.flag ?? undefined}
                expanded={row.panel !== null}
                onToggle={() => {
                  onToggle(row.id);
                }}
              >
                {row.panel === null ? null : <FoodDetail panel={row.panel} />}
              </ExpandableRow>
            ))}
          </ul>
        </Card>
      ))}
    </>
  );
}
