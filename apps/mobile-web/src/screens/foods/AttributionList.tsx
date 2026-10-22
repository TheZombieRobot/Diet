import { fillTemplate } from '@diet/core';
import { foods } from '@diet/core/copy/health';
import type { ReactElement } from 'react';

export interface AttributionSource {
  readonly name: string;
  readonly edition: string;
  /** Word for word from the approved licence (DECISIONS, checklist item 10). */
  readonly text: string;
}

/** Each food database in use, with its edition and attribution (C97); nothing while none is used. */
export function AttributionList({
  sources,
}: {
  readonly sources: readonly AttributionSource[];
}): ReactElement | null {
  if (sources.length === 0) return null;
  return (
    <>
      {sources.map((source) => (
        <div key={source.name}>
          <p className="ui-text-strong">
            {fillTemplate(foods.about.sourceEdition, {
              name: source.name,
              edition: source.edition,
            })}
          </p>
          <p>{source.text}</p>
        </div>
      ))}
    </>
  );
}
