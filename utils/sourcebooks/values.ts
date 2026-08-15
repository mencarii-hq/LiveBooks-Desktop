/**
 * qbXML→JSON single-vs-array quirk: one child element parses to an object,
 * many parse to an array. Normalize every such access through this helper.
 */
export function asArray<T>(value: T | T[] | undefined | null): T[] {
  if (value === undefined || value === null) {
    return [];
  }
  return Array.isArray(value) ? value : [value];
}
