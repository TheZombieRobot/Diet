/**
 * @diet/ui: the small mobile design system shared by the phone app. Large tap targets (48 px or
 * more), high contrast, dark mode. Colours live only in styles/tokens.css; the app imports the
 * stylesheet once as `@diet/ui/styles.css`.
 */
export const PACKAGE_NAME = '@diet/ui' as const;

export { ActionRow, type ActionRowProps } from './components/ActionRow';
export { AppShell, type AppShellProps } from './components/AppShell';
export { Banner, type BannerProps } from './components/Banner';
export { Button, type ButtonProps, type ButtonVariant } from './components/Button';
export { Card, type CardProps } from './components/Card';
export {
  FloatingActionButton,
  type FloatingActionButtonProps,
} from './components/FloatingActionButton';
export {
  IconButton,
  IconLink,
  type IconButtonProps,
  type IconLinkProps,
} from './components/IconButton';
export { OFFLINE_LABEL, ONLINE_LABEL, OfflineIndicator } from './components/OfflineIndicator';
export { TabBar, type TabBarProps, type TabItem } from './components/TabBar';
export { TopBar, type TopBarProps } from './components/TopBar';
export * from './icons';
export { applyTheme, currentThemePreference, type ThemePreference } from './theme';
export {
  contrastRatio,
  over,
  parseColour,
  parseColourTokens,
  relativeLuminance,
  requireToken,
  type Rgba,
  type ThemeColour,
} from './tokens';
export { useOnlineStatus } from './useOnlineStatus';
