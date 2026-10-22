import {
  AppShell,
  DrinksIcon,
  FoodIcon,
  ListIcon,
  MoveIcon,
  TodayIcon,
  type TabItem,
} from '@diet/ui';
import { Suspense, useEffect, useRef, type ReactElement } from 'react';
import { APP_NAME } from './appName';
import { type FailureStatus, type OpenStatus, openStatusStore } from './db/db';
import { appStorageStore } from './db/runtime';
import { goToTab, markEntryAboveToday, markSubScreenEntry } from './navigation';
import { OnboardingGate } from './onboarding/OnboardingGate';
import { takeArrivedFromSetup } from './onboarding/navigation';
import { offlineCopyStore } from './pwa/offline';
import {
  isTabRoute,
  isUnderSettings,
  PARENT_TAB,
  recipeRouteOf,
  ROUTE_TITLES,
  routeDetail,
  routeHref,
  TAB_ROUTES,
  type RouteId,
  type TabRouteId,
} from './routes';
import { screenTitleStore } from './screenTitle';
import { AboutScreen } from './screens/AboutScreen';
import { swapStatusStore } from './screens/recipes/status';
import { QuickActions } from './screens/today/QuickActionsPanel';
import { StorageFailureScreen } from './screens/StorageFailureScreen';
import { TodayScreen } from './screens/today/TodayScreen';
import { lazyScreen } from './screens/lazyScreen';
import { ScreenLoading } from './screens/ScreenLoading';
import { UpdateBanner } from './screens/UpdateBanner';
import { KickstartReconciler } from './screens/weight/KickstartReconciler';
import { useStore } from './store';
import { useHash, useRoute } from './useRoute';

/**
 * Screens not needed for the first paint, each fetched when it first opens (code split): their
 * code and the data only they read stay out of the chunks the first paint loads, which are smaller
 * and change less often. Today, setup, About and the help numbers are imported above and open at
 * once; vite.config.ts arranges the chunks.
 */
const DrinksScreen = lazyScreen(() => import('./screens/drinks/DrinksScreen'), 'DrinksScreen');
const FastingScreen = lazyScreen(() => import('./screens/fasting/FastingScreen'), 'FastingScreen');
const FoodScreen = lazyScreen(() => import('./screens/FoodScreen'), 'FoodScreen');
const FoodsScreen = lazyScreen(() => import('./screens/foods/FoodsScreen'), 'FoodsScreen');
const GardenScreen = lazyScreen(() => import('./screens/garden/GardenScreen'), 'GardenScreen');
const ListScreen = lazyScreen(() => import('./screens/list/ListScreen'), 'ListScreen');
const MovePlanScreen = lazyScreen(() => import('./screens/move/MovePlanScreen'), 'MovePlanScreen');
const MoveScreen = lazyScreen(() => import('./screens/move/MoveScreen'), 'MoveScreen');
const MoveSessionScreen = lazyScreen(
  () => import('./screens/move/MoveSessionScreen'),
  'MoveSessionScreen',
);
const PairingScreen = lazyScreen(() => import('./screens/pairing/PairingScreen'), 'PairingScreen');
const StoreScreen = lazyScreen(() => import('./screens/settings/StoreScreen'), 'StoreScreen');
const PlanDayScreen = lazyScreen(() => import('./screens/planner/PlanDayScreen'), 'PlanDayScreen');
const FoodLogScreen = lazyScreen(() => import('./screens/foodLog/FoodLogScreen'), 'FoodLogScreen');
const GpSummaryScreen = lazyScreen(
  () => import('./screens/foodLog/GpSummaryScreen'),
  'GpSummaryScreen',
);
const RecipeScreen = lazyScreen(() => import('./screens/recipes/RecipeScreen'), 'RecipeScreen');
const RecipesScreen = lazyScreen(() => import('./screens/recipes/RecipesScreen'), 'RecipesScreen');
const EatingScheduleScreen = lazyScreen(
  () => import('./screens/settings/EatingScheduleScreen'),
  'EatingScheduleScreen',
);
const ProfileScreen = lazyScreen(() => import('./screens/settings/ProfileScreen'), 'ProfileScreen');
const ReadinessAnswersScreen = lazyScreen(
  () => import('./screens/settings/ReadinessAnswersScreen'),
  'ReadinessAnswersScreen',
);
const SettingsScreen = lazyScreen(() => import('./screens/SettingsScreen'), 'SettingsScreen');
const TargetsScreen = lazyScreen(() => import('./screens/targets/TargetsScreen'), 'TargetsScreen');
const WeightScreen = lazyScreen(() => import('./screens/weight/WeightScreen'), 'WeightScreen');

const TAB_ICONS: Readonly<Record<TabRouteId, ReactElement>> = {
  today: <TodayIcon />,
  food: <FoodIcon />,
  move: <MoveIcon />,
  drinks: <DrinksIcon />,
  list: <ListIcon />,
};

const TABS: readonly TabItem[] = TAB_ROUTES.map((id) => ({
  id,
  label: ROUTE_TITLES[id],
  href: routeHref(id),
  icon: TAB_ICONS[id],
}));

const isTabId = (id: string): id is TabRouteId => (TAB_ROUTES as readonly string[]).includes(id);

function screenFor(route: RouteId): ReactElement {
  switch (route) {
    case 'today':
      return <TodayScreen />;
    case 'food':
      return <FoodScreen />;
    case 'move':
      return <MoveScreen />;
    case 'drinks':
      return <DrinksScreen />;
    case 'list':
      return <ListScreen />;
    case 'settings':
      return <SettingsScreen />;
    case 'about':
      return <AboutScreen />;
    case 'readiness':
      return <ReadinessAnswersScreen />;
    case 'profile':
      return <ProfileScreen />;
    case 'eating-schedule':
      return <EatingScheduleScreen />;
    case 'weight':
      return <WeightScreen />;
    case 'fasting':
      return <FastingScreen />;
    case 'targets':
      return <TargetsScreen />;
    case 'foods':
      return <FoodsScreen />;
    case 'garden':
      return <GardenScreen />;
    case 'move-session':
      return <MoveSessionScreen />;
    case 'move-plan':
      return <MovePlanScreen />;
    case 'pairing':
      return <PairingScreen />;
    case 'store':
      return <StoreScreen />;
    case 'recipes':
      return <RecipesScreen />;
    case 'recipe':
      return <RecipeScreen />;
    case 'plan':
      return <PlanDayScreen />;
    case 'food-log':
      return <FoodLogScreen />;
    case 'gp-summary':
      return <GpSummaryScreen />;
  }
}

const isFailure = (status: OpenStatus): status is FailureStatus =>
  status !== 'opening' && status !== 'ready';

/**
 * The app. When the database cannot be used (section 7.4 of the storage spec), a storage failure
 * screen replaces everything, so Settings and delete-all cannot be reached from it. Until setup is
 * finished, the first-run flow replaces the shell (item 13; HS-20). The Kickstart reconciler (item
 * 14) runs beside it on every screen, so a Kickstart whose readiness answers went missing after
 * setup (the repair questions) is still ended; it writes nothing until setup has been finished.
 */
export function App(): ReactElement {
  const status = useStore(openStatusStore);
  const storage = useStore(appStorageStore);
  if (isFailure(status)) return <StorageFailureScreen status={status} />;
  return (
    <>
      {storage === null ? null : <KickstartReconciler storage={storage} />}
      <OnboardingGate>
        <Shell />
      </OnboardingGate>
    </>
  );
}

function Shell(): ReactElement {
  const route = useRoute();
  const hash = useHash();
  // Item 20: moving from one recipe to another is a new screen too (its heading takes focus).
  // Only the recipe page counts its detail, so the Fasting screen's sub-links keep their own focus.
  // Item 22: moving from one planned day to another is a new screen too.
  const detail = route === 'recipe' || route === 'plan' ? routeDetail(hash) : null;
  const titleOverride = useStore(screenTitleStore);
  const title =
    titleOverride !== null && titleOverride.hash === hash
      ? titleOverride.title
      : ROUTE_TITLES[route];
  const offlineCopy = useStore(offlineCopyStore);
  const titleRef = useRef<HTMLHeadingElement>(null);
  const previousRoute = useRef<{ route: RouteId; detail: string | null } | undefined>(undefined);
  // The state of the entry now shown, marks included: the next screen change reads it as the entry
  // it came from (item 19 review: Today, Food, Garden and pantry, then Today; item 20: a recipe
  // opened from Recipes or from another recipe is marked one deeper).
  const entryState = useRef<unknown>(null);

  // Its own effect, so a recipe's name reaches the tab title when it arrives after the route.
  useEffect(() => {
    document.title = route === 'today' ? APP_NAME : `${title} · ${APP_NAME}`;
  }, [route, title]);

  useEffect(() => {
    document.documentElement.scrollTop = 0;
    const previous = previousRoute.current;
    previousRoute.current = { route, detail };
    // A recipe page's status (a swap done) belongs to that recipe only.
    const status = swapStatusStore.get();
    if (status !== null && recipeRouteOf(window.location.hash)?.id !== status.recipeId)
      swapStatusStore.set(null);
    // On first render the browser decides where focus starts, except straight after setup, whose
    // flow held focus; after that, a new screen moves focus to its heading, so a screen reader
    // announces it and Tab starts from the top.
    const previousState = entryState.current;
    if (previous === undefined) {
      entryState.current = window.history.state;
      if (takeArrivedFromSetup()) titleRef.current?.focus({ preventScroll: true });
      return;
    }
    if (previous.route === route && previous.detail === detail) return;
    if (previous.route !== route) markEntryAboveToday(previous.route, route);
    markSubScreenEntry(previous.route, route, window.history, previousState);
    entryState.current = window.history.state;
    titleRef.current?.focus({ preventScroll: true });
  }, [route, detail]);

  return (
    <AppShell
      title={title}
      titleRef={titleRef}
      tabs={TABS}
      currentTab={isTabRoute(route) ? route : PARENT_TAB[route]}
      currentTabIsParent={!isTabRoute(route) && PARENT_TAB[route] !== undefined}
      onTabSelect={(id) => {
        if (isTabId(id)) goToTab(id, route);
      }}
      settingsHref={routeHref('settings')}
      settingsCurrent={
        route === 'settings' ? 'page' : isUnderSettings(route) ? 'section' : undefined
      }
      offlineReady={offlineCopy === 'ready'}
      banners={<UpdateBanner />}
      floatingAction={route === 'today' ? <QuickActions /> : undefined}
    >
      <Suspense key={route} fallback={<ScreenLoading />}>
        {screenFor(route)}
      </Suspense>
    </AppShell>
  );
}
