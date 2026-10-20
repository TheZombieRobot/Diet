import type { ReactElement } from 'react';

export interface NutrientTableRow {
  readonly key: string;
  readonly label: string;
  /** The figure as core's figureText wrote it ("19 g", "at least 17 g", "not known"). */
  readonly text: string;
  /** False for a figure that is not fully known; shown quieter. */
  readonly known: boolean;
}

export interface NutrientTableProps {
  /** Names the table, such as "Nutrition per 100 g, raw". */
  caption: string;
  rows: readonly NutrientTableRow[];
}

/**
 * Nutrient figures, one row each. It formats nothing itself: the text comes from core, so a
 * figure that is not known can never become "0" here (HS-36).
 */
export function NutrientTable({ caption, rows }: NutrientTableProps): ReactElement {
  return (
    <table className="ui-nutrients">
      <caption>{caption}</caption>
      <tbody>
        {rows.map((row) => (
          <tr key={row.key}>
            <th scope="row">{row.label}</th>
            <td data-known={row.known}>{row.text}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
