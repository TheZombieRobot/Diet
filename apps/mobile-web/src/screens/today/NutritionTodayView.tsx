import { targets as copy } from '@diet/core/copy/health';
import { ActionRow, Card, Chip, ChevronIcon, MeterBar, MeterPair } from '@diet/ui';
import { Fragment, type ReactElement } from 'react';
import { routeHref } from '../../routes';
import type { NutritionTodayViewModel } from './nutritionView';

/**
 * The Nutrition today card (UX_SCREENS section 2, card 3; the mock-up's "Nutrition today"): energy,
 * protein and fibre, then net carbs and saturated fat side by side, the notes, the way to fix a
 * missing rough-guide input, and the day's entries with their source tags (read-only; editing
 * them is item 23's), and item 18's attribution footer.
 */
export function NutritionTodayView({ model }: { model: NutritionTodayViewModel }): ReactElement {
  const link = model.fixLink === null ? null : copy.links[model.fixLink];
  return (
    <Card
      label={copy.today.label}
      aside={
        model.modeName === null ? null : <span className="ui-text-muted">{model.modeName}</span>
      }
    >
      {model.rows.map((row, i) => (
        <Fragment key={row.label}>
          <MeterBar {...row} />
          {/* Item 18: under the energy row while no food figures are loaded. */}
          {i === 0 && model.energyNote !== null ? (
            <p className="ui-text-muted">{model.energyNote}</p>
          ) : null}
        </Fragment>
      ))}
      <MeterPair>
        {model.pair.map((row) => (
          <MeterBar key={row.label} {...row} />
        ))}
      </MeterPair>
      {model.notes.map((note) => (
        <p key={note.text} className="ui-text-muted" data-part={note.part}>
          {note.text}
        </p>
      ))}
      {link === null || model.fixLink === null ? null : (
        <ActionRow
          href={routeHref(model.fixLink)}
          title={link.title}
          detail={link.detail}
          badge={<ChevronIcon />}
        />
      )}
      {model.entries.length === 0 ? null : (
        <ul className="ui-entry-list">
          {model.entries.map((entry) => (
            <li key={entry.key}>
              {/* Item 23: the row opens the entry in the food log. */}
              <a className="ui-entry-list__link" href={entry.href}>
                <span className="ui-entry-list__time">{entry.time}</span>
                <span className="ui-entry-list__name">{entry.name}</span>
                {entry.tag === null ? null : <Chip tone={entry.tag.tone}>{entry.tag.text}</Chip>}
              </a>
            </li>
          ))}
        </ul>
      )}
      <p className="ui-text-small">{model.footer}</p>
    </Card>
  );
}
