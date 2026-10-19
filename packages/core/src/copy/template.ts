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
