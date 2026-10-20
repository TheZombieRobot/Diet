/**
 * Every repository (storage spec section 8). Later items add query helpers on top of these, and
 * must go through the same preparation and validators. No repository writes an audit row for an
 * ordinary owner edit: audit is for automatic changes (grocery deductions, migrations).
 */
import type { RepoContext } from './context';
import { type CardStateRepo, cardStateRepo } from './cardState';
import { type CrudRepo, crudRepo } from './crud';
import { type DrinksRepo, drinksRepo } from './drinks';
import { type FastsRepo, fastsRepo } from './fasts';
import { type GardenPhotosRepo, gardenPhotosRepo } from './gardenPhotos';
import { type KickstartRepo, kickstartRepo } from './kickstart';
import { type PairingRepo, pairingRepo } from './pairing';
import { type PhaseRepo, phaseRepo } from './phase';
import { type PlanDaysRepo, planDaysRepo } from './planDays';
import { type ReadinessRepo, readinessRepo } from './readiness';
import { type SettingsRepo, type SingletonRepo, settingsRepo, singletonRepo } from './singletons';
import { type WeightsRepo, weightsRepo } from './weights';

export interface Repos {
  readonly profile: SingletonRepo<'profile'>;
  readonly targets: SingletonRepo<'targets'>;
  readonly settings: SettingsRepo;
  readonly readiness: ReadinessRepo;
  readonly kickstart: KickstartRepo;
  /** The fasting-preset moves tied to Kickstart (item 14). */
  readonly phase: PhaseRepo;
  readonly weights: WeightsRepo;
  readonly fasts: FastsRepo;
  readonly symptoms: CrudRepo<'symptom_log'>;
  readonly water: CrudRepo<'water_log'>;
  readonly steps: CrudRepo<'steps_log'>;
  readonly ingredients: CrudRepo<'ingredients'>;
  readonly ingredientOverrides: CrudRepo<'ingredient_overrides'>;
  readonly recipes: CrudRepo<'recipes'>;
  readonly planDays: PlanDaysRepo;
  readonly foodLog: CrudRepo<'food_log'>;
  readonly garden: CrudRepo<'garden'>;
  readonly gardenPhotos: GardenPhotosRepo;
  readonly pantry: CrudRepo<'pantry'>;
  readonly sessions: CrudRepo<'sessions'>;
  readonly beverages: CrudRepo<'beverages'>;
  readonly drinks: DrinksRepo;
  readonly alcoholDayNotes: CrudRepo<'alcohol_day_notes'>;
  readonly alcoholMilestones: CrudRepo<'alcohol_milestones'>;
  readonly groceryLists: CrudRepo<'grocery_lists'>;
  /** The laptop pairing (item 30). */
  readonly pairing: PairingRepo;
  readonly cardState: CardStateRepo;
  readonly audit: CrudRepo<'audit'>;
}

export function createRepos(ctx: RepoContext): Repos {
  return {
    profile: singletonRepo(ctx, 'profile'),
    targets: singletonRepo(ctx, 'targets'),
    settings: settingsRepo(ctx),
    readiness: readinessRepo(ctx),
    kickstart: kickstartRepo(ctx),
    phase: phaseRepo(ctx),
    weights: weightsRepo(ctx),
    fasts: fastsRepo(ctx),
    symptoms: crudRepo(ctx, 'symptom_log'),
    water: crudRepo(ctx, 'water_log'),
    steps: crudRepo(ctx, 'steps_log'),
    ingredients: crudRepo(ctx, 'ingredients'),
    ingredientOverrides: crudRepo(ctx, 'ingredient_overrides'),
    recipes: crudRepo(ctx, 'recipes'),
    planDays: planDaysRepo(ctx),
    foodLog: crudRepo(ctx, 'food_log'),
    garden: crudRepo(ctx, 'garden'),
    gardenPhotos: gardenPhotosRepo(ctx),
    pantry: crudRepo(ctx, 'pantry'),
    sessions: crudRepo(ctx, 'sessions'),
    beverages: crudRepo(ctx, 'beverages'),
    drinks: drinksRepo(ctx),
    alcoholDayNotes: crudRepo(ctx, 'alcohol_day_notes'),
    alcoholMilestones: crudRepo(ctx, 'alcohol_milestones'),
    groceryLists: crudRepo(ctx, 'grocery_lists'),
    pairing: pairingRepo(ctx),
    cardState: cardStateRepo(ctx),
    audit: crudRepo(ctx, 'audit'),
  };
}

export type { RepoContext, RepoHooks } from './context';
export { type CreateInput, type CrudRepo, crudRepo, type UpdatePatch } from './crud';
