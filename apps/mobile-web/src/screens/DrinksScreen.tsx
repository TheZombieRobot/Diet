import type { ReactElement } from 'react';
import { GateNotice } from '../onboarding/GateNotice';
import { Placeholder } from './Placeholder';

export function DrinksScreen(): ReactElement {
  return (
    <>
      <GateNotice feature="alcoholLogging" link />
      <Placeholder coming="Drinks will hold the drinks log, daily and weekly totals in standard drinks, and help contacts." />
    </>
  );
}
