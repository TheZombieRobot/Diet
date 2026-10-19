/**
 * Light or dark appearance. By default the app follows the phone's dark-mode setting; a later
 * settings screen (checklist item 37) can force one with applyTheme. tokens.css reads the
 * data-theme attribute this sets on <html>.
 */
export type ThemePreference = 'system' | 'light' | 'dark';

export function applyTheme(
  preference: ThemePreference,
  root: HTMLElement = document.documentElement,
): void {
  if (preference === 'system') root.removeAttribute('data-theme');
  else root.setAttribute('data-theme', preference);
}

export function currentThemePreference(
  root: HTMLElement = document.documentElement,
): ThemePreference {
  const value = root.getAttribute('data-theme');
  return value === 'light' || value === 'dark' ? value : 'system';
}
