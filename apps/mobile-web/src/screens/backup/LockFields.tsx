import { privacy } from '@diet/core/copy/health';
import { Notice, Switch, TextField } from '@diet/ui';
import type { ReactElement } from 'react';
import type { LockChoice } from './lockChoice';

export interface LockFieldsProps {
  readonly value: LockChoice;
  readonly onChange: (next: LockChoice) => void;
  /** The refusal to show under the fields, after a tap on the save button. */
  readonly problem: string | null;
  /** Why saving the file failed, shown above the fields whether or not the file is locked. */
  readonly failure?: string | null;
  readonly disabled?: boolean;
}

/** The lock switch, the two password fields and the warnings (see lockChoice.ts). */
export function LockFields({
  value,
  onChange,
  problem,
  failure = null,
  disabled = false,
}: LockFieldsProps): ReactElement {
  const copy = privacy.exportBackup;
  const differs = problem === copy.passwordsDiffer;
  return (
    <>
      {failure === null ? null : (
        <Notice role="alert">
          <p>{failure}</p>
        </Notice>
      )}
      <Switch
        label={copy.lockLabel}
        checked={value.locked}
        disabled={disabled}
        onChange={(locked) => {
          onChange({ ...value, locked });
        }}
      />
      {value.locked ? (
        <>
          <TextField
            label={copy.passwordLabel}
            type="password"
            autoComplete="new-password"
            spellCheck={false}
            value={value.password}
            disabled={disabled}
            hint={copy.passwordRule}
            error={problem !== null && !differs ? problem : undefined}
            onChange={(event) => {
              onChange({ ...value, password: event.currentTarget.value });
            }}
          />
          <TextField
            label={copy.passwordRepeatLabel}
            type="password"
            autoComplete="new-password"
            spellCheck={false}
            value={value.repeat}
            disabled={disabled}
            error={differs ? problem : undefined}
            onChange={(event) => {
              onChange({ ...value, repeat: event.currentTarget.value });
            }}
          />
          <Notice>
            <p>{copy.forgottenWarning}</p>
          </Notice>
        </>
      ) : (
        <Notice>
          <p>{copy.plainWarning}</p>
        </Notice>
      )}
    </>
  );
}
