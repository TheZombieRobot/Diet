import { targets as copy } from '@diet/core/copy/health';
import { ActionRow, Card, Chip, ChevronIcon, MeterBar, MeterPair } from '@diet/ui';
import type { ReactElement } from 'react';
import { routeHref } from '../../routes';
import type { NutritionTodayViewModel } from './nutritionView';

/**
 * The Nutrition today card (UX_SCREENS section 2, card 3; the mock-up's "Nutrition today"): energy,
 * protein and fibre, then net carbs and saturated fat side by side, the notes, the way to fix a
 * missing rough-guide input, and the day's entries with their source tags (read-only; editing
 * them is item 23's). Item 18's nutritionFooter supplies the attribution footer when it lands.
 */
export function NutritionTodayView({ model }: { model: NutritionTodayViewModel }): ReactElement {
  const link = model.fixLink === null ? null : copy.links[model.fixLink];
  return (
    <Card label={copy.today.label} aside={<span className="ui-text-muted">{model.modeName}</span>}>
      {model.rows.map((row) => (
        <MeterBar key={row.label} {...row} />
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
              <span className="ui-entry-list__time">{entry.time}</span>
              <span className="ui-entry-list__name">{entry.name}</span>
              <Chip tone={entry.tag.tone}>{entry.tag.text}</Chip>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
