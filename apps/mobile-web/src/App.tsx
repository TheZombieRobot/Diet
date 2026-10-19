import {
  AppShell,
  DrinksIcon,
  FoodIcon,
  ListIcon,
  MoveIcon,
  TodayIcon,
  type TabItem,
} from '@diet/ui';
import { useEffect, type ReactElement } from 'react';
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
import { FoodScreen } from './screens/FoodScreen';
import { ListScreen } from './screens/ListScreen';
import { MoveScreen } from './screens/MoveScreen';
import { QuickActions } from './screens/QuickActions';
import { SettingsScreen } from './screens/SettingsScreen';
import { TodayScreen } from './screens/TodayScreen';
import { UpdateBanner } from './screens/UpdateBanner';
import { useRoute } from './useRoute';

/** The name in the browser tab and the app switcher (the manifest's short_name). */
export const APP_NAME = 'Diet';

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
  }
}

export function App(): ReactElement {
  const route = useRoute();

  useEffect(() => {
    document.title = route === 'today' ? APP_NAME : `${ROUTE_TITLES[route]} · ${APP_NAME}`;
    document.documentElement.scrollTop = 0;
  }, [route]);

  return (
    <AppShell
      title={ROUTE_TITLES[route]}
      tabs={TABS}
      currentTab={isTabRoute(route) ? route : undefined}
      settingsHref={routeHref('settings')}
      settingsCurrent={isUnderSettings(route)}
      banners={<UpdateBanner />}
      floatingAction={route === 'today' ? <QuickActions /> : undefined}
    >
      {screenFor(route)}
    </AppShell>
  );
}
