/** Шляхи string-листів у JSON (формат як keys.join('.') у json-view). */
export function collectJsonStringPaths(
  value: unknown,
  keys: (string | number)[] = [],
  out: Map<string, string> = new Map(),
): Map<string, string> {
  if (typeof value === 'string') {
    if (keys.length > 0) {
      out.set(keys.join('.'), value);
    }
    return out;
  }

  if (Array.isArray(value)) {
    value.forEach((item, index) => {
      collectJsonStringPaths(item, [...keys, index], out);
    });
    return out;
  }

  if (value && typeof value === 'object') {
    for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
      collectJsonStringPaths(child, [...keys, key], out);
    }
  }

  return out;
}
