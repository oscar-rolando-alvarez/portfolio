/** Small, failure-tolerant wrapper around localStorage (it can throw in private mode or be absent). */
export const storage = {
  read<T>(key: string): T | null {
    try {
      const raw = globalThis.localStorage?.getItem(key);
      return raw ? (JSON.parse(raw) as T) : null;
    } catch {
      return null;
    }
  },
  write(key: string, value: unknown): void {
    try {
      globalThis.localStorage?.setItem(key, JSON.stringify(value));
    } catch {
      // Ignore quota or availability errors: persistence is best effort.
    }
  },
  remove(key: string): void {
    try {
      globalThis.localStorage?.removeItem(key);
    } catch {
      // Ignore.
    }
  },
};
