import type { ReactElement } from 'react';
import { GateNotice } from '../onboarding/GateNotice';
import { Placeholder } from './Placeholder';

export function FoodScreen(): ReactElement {
  return (
    <>
      <GateNotice feature="ketoCeiling" link />
      <Placeholder coming="Food will hold the week's meal plan, recipes, the food log, and the garden and pantry lists." />
    </>
  );
}
