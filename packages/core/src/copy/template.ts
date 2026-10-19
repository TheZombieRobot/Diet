/**
 * Fills the {name} placeholders of a copy string from health.ts. Copy keeps its placeholders in
 * the string itself, so the scans read the whole sentence (an interpolated value reads as {}).
 * A placeholder with no value is a programming error and throws.
 */
export function fillTemplate(
  template: string,
  values: Readonly<Record<string, string | number>>,
): string {
  return template.replace(/\{(\w+)\}/g, (_match, name: string) => {
    const value = Object.hasOwn(values, name) ? values[name] : undefined;
    if (value === undefined) throw new RangeError(`No value for the placeholder {${name}}`);
    return String(value);
  });
}

/** "a", "a and b", "a, b and c": the separators come from copy (readiness.listComma, listAnd). */
export function joinList(items: readonly string[], comma: string, and: string): string {
  if (items.length <= 1) return items[0] ?? '';
  return `${items.slice(0, -1).join(comma)}${and}${items.at(-1) ?? ''}`;
}
