import type { ReactElement } from 'react';
import { InstallBanner } from './InstallBanner';
import { Placeholder } from './Placeholder';

export function TodayScreen(): ReactElement {
  return (
    <>
      <InstallBanner />
      <Placeholder coming="Today will show the day at a glance: weight, the current fast, food so far, water, steps, movement and drinks, with quick ways to log each." />
    </>
  );
}
