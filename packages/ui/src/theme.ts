/**
 * Light or dark appearance. The app follows the phone's dark-mode setting (item 37 added no
 * setting of its own); a later settings screen can force one with applyTheme. tokens.css reads
 * the data-theme attribute this sets on <html>.
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
