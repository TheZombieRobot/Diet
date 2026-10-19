import type { ReactElement, ReactNode } from 'react';

/**
 * Inline stroke icons from the mock-up (24 x 24 grid, drawn in the current text colour). Icons are
 * decorative: the control that holds one carries the accessible name.
 */
export interface IconProps {
  /** Width and height in CSS pixels. */
  size?: number;
}

function Svg({
  size,
  strokeWidth,
  children,
}: {
  size: number;
  strokeWidth: number;
  children: ReactNode;
}): ReactElement {
  return (
    <svg
      aria-hidden="true"
      focusable="false"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {children}
    </svg>
  );
}

export function TodayIcon({ size = 26 }: IconProps): ReactElement {
  return (
    <Svg size={size} strokeWidth={2.2}>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
    </Svg>
  );
}

export function FoodIcon({ size = 26 }: IconProps): ReactElement {
  return (
    <Svg size={size} strokeWidth={2}>
      <path d="M4 11h16a8 8 0 0 1-16 0z" />
      <path d="M9 3c-1 1.5-1 3 0 4.5" />
      <path d="M14 3c-1 1.5-1 3 0 4.5" />
    </Svg>
  );
}

export function MoveIcon({ size = 26 }: IconProps): ReactElement {
  return (
    <Svg size={size} strokeWidth={2}>
      <path d="M3 12h4l3-8 4 16 3-8h4" />
    </Svg>
  );
}

export function DrinksIcon({ size = 26 }: IconProps): ReactElement {
  return (
    <Svg size={size} strokeWidth={2}>
      <path d="M6 3h12l-1.6 17.1a1 1 0 0 1-1 .9H8.6a1 1 0 0 1-1-.9z" />
      <path d="M6.6 9h10.8" />
    </Svg>
  );
}

export function ListIcon({ size = 26 }: IconProps): ReactElement {
  return (
    <Svg size={size} strokeWidth={2}>
      <path d="M10 6h10M10 12h10M10 18h10" />
      <path d="M3.5 6l1.5 1.5L7.5 5M3.5 12l1.5 1.5 2.5-2.5M3.5 18l1.5 1.5 2.5-2.5" />
    </Svg>
  );
}

export function SettingsIcon({ size = 24 }: IconProps): ReactElement {
  return (
    <Svg size={size} strokeWidth={2}>
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </Svg>
  );
}

export function PlusIcon({ size = 28 }: IconProps): ReactElement {
  return (
    <Svg size={size} strokeWidth={2.4}>
      <path d="M12 5v14M5 12h14" />
    </Svg>
  );
}

export function CloseIcon({ size = 22 }: IconProps): ReactElement {
  return (
    <Svg size={size} strokeWidth={2.2}>
      <path d="M6 6l12 12M18 6L6 18" />
    </Svg>
  );
}

export function CloudIcon({ size = 16 }: IconProps): ReactElement {
  return (
    <Svg size={size} strokeWidth={2.2}>
      <path d="M7 18h10a4 4 0 0 0 .6-7.95A6 6 0 0 0 6.2 9.2 4.5 4.5 0 0 0 7 18z" />
    </Svg>
  );
}

export function CloudOffIcon({ size = 16 }: IconProps): ReactElement {
  return (
    <Svg size={size} strokeWidth={2.2}>
      <path d="M7 18h10a4 4 0 0 0 .6-7.95A6 6 0 0 0 6.2 9.2 4.5 4.5 0 0 0 7 18z" />
      <path d="M4 4l16 16" />
    </Svg>
  );
}

export function PhoneIcon({ size = 20 }: IconProps): ReactElement {
  return (
    <Svg size={size} strokeWidth={2.2}>
      <path d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2" />
    </Svg>
  );
}

export function MessageIcon({ size = 20 }: IconProps): ReactElement {
  return (
    <Svg size={size} strokeWidth={2.2}>
      <path d="M4 5h16v11H9l-5 4z" />
    </Svg>
  );
}

export function InstallIcon({ size = 20 }: IconProps): ReactElement {
  return (
    <Svg size={size} strokeWidth={2.2}>
      <path d="M12 4v11M7 10l5 5 5-5M5 20h14" />
    </Svg>
  );
}

export function ChevronIcon({ size = 20 }: IconProps): ReactElement {
  return (
    <Svg size={size} strokeWidth={2.2}>
      <path d="M9 6l6 6-6 6" />
    </Svg>
  );
}

export function MinusIcon({ size = 22 }: IconProps): ReactElement {
  return (
    <Svg size={size} strokeWidth={2.4}>
      <path d="M5 12h14" />
    </Svg>
  );
}

/** The shield with a tick on the first-run safety note (mock-up Notice). */
export function ShieldIcon({ size = 32 }: IconProps): ReactElement {
  return (
    <Svg size={size} strokeWidth={2}>
      <path d="M12 21s-7-4.4-7-10.2V5.2L12 2.5l7 2.7v5.6C19 16.6 12 21 12 21z" />
      <path d="M9 11.5l2.2 2.2L15.5 9.4" />
    </Svg>
  );
}
