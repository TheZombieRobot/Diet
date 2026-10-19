/** Joins the truthy class names: classNames('a', on && 'b') is 'a b' or 'a'. */
export function classNames(...names: readonly (string | false | null | undefined)[]): string {
  return names.filter((n): n is string => typeof n === 'string' && n !== '').join(' ');
}
