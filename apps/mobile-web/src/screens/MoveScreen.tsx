import type { ReactElement } from 'react';
import { GateNotice } from '../onboarding/GateNotice';
import { Placeholder } from './Placeholder';

export function MoveScreen(): ReactElement {
  return (
    <>
      <GateNotice feature="exercisePlans" link />
      <Placeholder coming="Move will hold the week's sessions, the quick check before each session, and beach walks." />
    </>
  );
}
