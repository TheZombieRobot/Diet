/**
 * The paste code panel (checklist item 31 design 1.6; C12, TR-07): the locked list as text, to copy
 * and carry to the laptop. The code is held only in this page's session: never stored, logged or
 * put in a URL. Copying goes through item 24's clipboard helper (L38), with a plain fallback.
 */
import { fillTemplate, type Instant } from '@diet/core';
import { transfer } from '@diet/core/copy/health';
import { Button, ButtonRow, Card, CodeBox, Notice } from '@diet/ui';
import { type ReactElement, type Ref, useState } from 'react';
import { copyToClipboard } from '../../clipboard';
import { formatLocalTime } from '../../format';

const copy = transfer.send.paste;

export function PastePanel({
  code,
  madeAt,
  zone,
  onDone,
  startRef,
}: {
  readonly code: string;
  readonly madeAt: Instant;
  readonly zone: string;
  readonly onDone: () => void;
  readonly startRef: Ref<HTMLParagraphElement>;
}): ReactElement {
  const [copied, setCopied] = useState<boolean | null>(null);
  return (
    <Card label={copy.title}>
      <p ref={startRef} className="ui-step-start" tabIndex={-1}>
        {copy.intro}
      </p>
      <CodeBox label={copy.codeLabel} value={code} />
      <p className="ui-text-muted">
        {fillTemplate(copy.madeAt, { time: formatLocalTime(madeAt, zone) })}
      </p>
      <p>{copy.keyNote}</p>
      <ButtonRow>
        <Button
          variant="primary"
          onClick={() => {
            void copyToClipboard(code).then(setCopied);
          }}
        >
          {copy.copy}
        </Button>
        <Button variant="quiet" onClick={onDone}>
          {copy.done}
        </Button>
      </ButtonRow>
      {copied === null ? null : copied ? (
        <Notice tone="info" role="status">
          {copy.copied}
        </Notice>
      ) : (
        <Notice tone="amber" role="status">
          {copy.copyFailed}
        </Notice>
      )}
    </Card>
  );
}
