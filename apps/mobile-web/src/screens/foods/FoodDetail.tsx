import { Notice, NutrientTable } from '@diet/ui';
import type { ReactElement } from 'react';
import type { FoodPanelModel } from './foodsModel';

/**
 * One food's details (item 18 design 1.3): its facts, its badge only when it has a number, the
 * eight figures per 100 g ("not known" until figures are loaded), a note about them, where they
 * come from, and the footer (NU-09).
 */
export function FoodDetail({ panel }: { readonly panel: FoodPanelModel }): ReactElement {
  return (
    <>
      <dl className="ui-facts">
        {panel.facts.map((fact) => (
          <div key={fact.term}>
            <dt className="ui-facts__term">{fact.term}</dt>
            <dd className="ui-facts__value">
              {fact.lines.map((line, i) => (
                <p key={line} className={i === 0 ? undefined : 'ui-text-muted'}>
                  {line}
                </p>
              ))}
              {fact.amberNotices.map((text) => (
                <Notice key={text}>
                  <p>{text}</p>
                </Notice>
              ))}
            </dd>
          </div>
        ))}
      </dl>
      {panel.badge === null ? null : <p className="ui-text-strong">{panel.badge}</p>}
      <NutrientTable caption={panel.table.caption} rows={panel.table.rows} />
      {panel.notice === null ? null : (
        <Notice tone="info">
          <p>{panel.notice}</p>
        </Notice>
      )}
      {panel.sourceLine === null ? null : <p className="ui-text-muted">{panel.sourceLine}</p>}
      <p className="ui-text-small">{panel.footer}</p>
    </>
  );
}
