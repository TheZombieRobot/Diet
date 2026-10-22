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
export { BarChart, type BarChartBar, type BarChartProps } from './components/BarChart';
export { ButtonRow } from './components/ButtonRow';
export { CameraView, type CameraViewProps } from './components/CameraView';
export { Card, type CardProps } from './components/Card';
export { Checkbox, type CheckboxProps } from './components/Checkbox';
export { CheckList, type CheckListProps } from './components/CheckList';
export { Chip, type ChipProps } from './components/Chip';
export { ChoiceList, type ChoiceListProps, type ChoiceOption } from './components/ChoiceList';
export { DayBar, type DayBarProps } from './components/DayBar';
export { ExpandableRow, type ExpandableRowProps } from './components/ExpandableRow';
export { FastMeter, type FastMeterProps } from './components/FastMeter';
export { LineItem, type LineItemProps, LineList } from './components/LineItem';
export { LinkList, LinkRow, type LinkRowProps } from './components/LinkRow';
export {
  FloatingActionButton,
  type FloatingActionButtonProps,
} from './components/FloatingActionButton';
export {
  FloatingActionPanel,
  type FloatingActionPanelProps,
} from './components/FloatingActionPanel';
export { ItemRow, type ItemRowProps } from './components/ItemRow';
export {
  IconButton,
  IconLink,
  type IconButtonProps,
  type IconLinkProps,
} from './components/IconButton';
export {
  OFFLINE_LABEL,
  OFFLINE_NOT_READY_LABEL,
  ONLINE_LABEL,
  OfflineIndicator,
  type OfflineIndicatorProps,
} from './components/OfflineIndicator';
export {
  MeterBar,
  type MeterBarProps,
  MeterPair,
  type MeterSegment,
  type MeterTone,
} from './components/MeterBar';
export { type MeterRect, meterRects } from './components/meterRects';
export { Notice, type NoticeProps } from './components/Notice';
export {
  NutrientTable,
  type NutrientTableProps,
  type NutrientTableRow,
} from './components/NutrientTable';
export { SegmentedControl, type SegmentedControlProps } from './components/SegmentedControl';
export { SelectField, type SelectFieldProps } from './components/SelectField';
export { StatGrid, StatTile, type StatTileProps } from './components/StatTile';
export { StepFrame, type StepBar, type StepFrameProps } from './components/StepFrame';
export { Stepper, type StepperProps } from './components/Stepper';
export { Switch, type SwitchProps } from './components/Switch';
export { TabBar, type TabBarProps, type TabItem } from './components/TabBar';
export { TagList, type TagListProps } from './components/TagList';
export { TextArea, type TextAreaProps } from './components/TextArea';
export { TextField, type TextFieldProps } from './components/TextField';
export { Thumbnail, type ThumbnailProps } from './components/Thumbnail';
export { TickRow, type TickRowProps } from './components/TickRow';
export { TopBar, type TopBarProps } from './components/TopBar';
export { CHART_MIN_SPAN_KG, TrendChart, type TrendChartProps } from './components/TrendChart';
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
