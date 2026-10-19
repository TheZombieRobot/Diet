import {
  AppShell,
  DrinksIcon,
  FoodIcon,
  ListIcon,
  MoveIcon,
  TodayIcon,
  type TabItem,
} from '@diet/ui';
import { useEffect, useRef, type ReactElement } from 'react';
import { APP_NAME } from './appName';
import { type FailureStatus, type OpenStatus, openStatusStore } from './db/db';
import { appStorageStore } from './db/runtime';
import { goToTab, markEntryAboveToday } from './navigation';
import { OnboardingGate } from './onboarding/OnboardingGate';
import { takeArrivedFromSetup } from './onboarding/navigation';
import { offlineCopyStore } from './pwa/offline';
import {
  isTabRoute,
  isUnderSettings,
  ROUTE_TITLES,
  routeHref,
  TAB_ROUTES,
  type RouteId,
  type TabRouteId,
} from './routes';
import { AboutScreen } from './screens/AboutScreen';
import { DrinksScreen } from './screens/DrinksScreen';
import { FastingScreen } from './screens/fasting/FastingScreen';
import { FoodScreen } from './screens/FoodScreen';
import { ListScreen } from './screens/ListScreen';
import { MoveScreen } from './screens/MoveScreen';
import { QuickActions } from './screens/QuickActions';
import { EatingScheduleScreen } from './screens/settings/EatingScheduleScreen';
import { ProfileScreen } from './screens/settings/ProfileScreen';
import { ReadinessAnswersScreen } from './screens/settings/ReadinessAnswersScreen';
import { SettingsScreen } from './screens/SettingsScreen';
import { StorageFailureScreen } from './screens/StorageFailureScreen';
import { TargetsScreen } from './screens/targets/TargetsScreen';
import { TodayScreen } from './screens/TodayScreen';
import { UpdateBanner } from './screens/UpdateBanner';
import { KickstartReconciler } from './screens/weight/KickstartReconciler';
import { WeightScreen } from './screens/weight/WeightScreen';
import { useStore } from './store';
import { useRoute } from './useRoute';

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
  const offlineCopy = useStore(offlineCopyStore);
  const titleRef = useRef<HTMLHeadingElement>(null);
  const previousRoute = useRef<RouteId | undefined>(undefined);

  useEffect(() => {
    document.title = route === 'today' ? APP_NAME : `${ROUTE_TITLES[route]} · ${APP_NAME}`;
    document.documentElement.scrollTop = 0;
    const previous = previousRoute.current;
    previousRoute.current = route;
    // On first render the browser decides where focus starts, except straight after setup, whose
    // flow held focus; after that, a new screen moves focus to its heading, so a screen reader
    // announces it and Tab starts from the top.
    if (previous === undefined) {
      if (takeArrivedFromSetup()) titleRef.current?.focus({ preventScroll: true });
      return;
    }
    if (previous === route) return;
    markEntryAboveToday(previous, route);
    titleRef.current?.focus({ preventScroll: true });
  }, [route]);

  return (
    <AppShell
      title={ROUTE_TITLES[route]}
      titleRef={titleRef}
      tabs={TABS}
      currentTab={isTabRoute(route) ? route : undefined}
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
      {screenFor(route)}
    </AppShell>
  );
}
