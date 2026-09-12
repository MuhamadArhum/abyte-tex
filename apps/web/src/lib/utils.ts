export { cn } from "cn"

type StripNull<V> = V extends null ? undefined : V;

/** Shallow: converts `null` values to `undefined`, e.g. before feeding an API record into a react-hook-form defaultValues object (forms want `undefined`, APIs return `null`). */
export function nullsToUndefined<T extends object>(obj: T): { [K in keyof T]: StripNull<T[K]> } {
  const result = { ...obj } as Record<string, unknown>;
  for (const key of Object.keys(result)) {
    if (result[key] === null) result[key] = undefined;
  }
  return result as { [K in keyof T]: StripNull<T[K]> };
}
