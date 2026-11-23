// A tiny store for the reading rate, so a rate change re-renders only the
// text that shows it and not the whole Live data page.
export type Rate = { readings: number; updates: number } | null;

export interface RateStore {
  get(): Rate;
  set(next: Rate): void;
  subscribe(fn: () => void): () => void;
}

export function createRateStore(): RateStore {
  let value: Rate = null;
  const subs = new Set<() => void>();
  return {
    get: () => value,
    set(next) {
      value = next;
      subs.forEach((f) => f());
    },
    subscribe(fn) {
      subs.add(fn);
      return () => {
        subs.delete(fn);
      };
    },
  };
}
