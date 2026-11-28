// Keeps the screen on during long reads (Health check, sensor search, Unknown
// values, Learn my car) and on every live page: one way for the whole app.
// Releasing a lock that never took throws on some platforms, so both calls are
// guarded: a missing lock must never stop the work itself.
import { activateKeepAwakeAsync, deactivateKeepAwake } from 'expo-keep-awake';
import { useEffect } from 'react';

// Tags held right now, so a background job can tell the owner is running
// something else (src/learn/autoRead.ts).
// A count for each tag, so a release by one holder does not drop a tag another still holds.
const held = new Map<string, number>();
export function heldTags(): string[] {
  return [...held.keys()];
}

export function stayAwake(tag: string): void {
  held.set(tag, (held.get(tag) ?? 0) + 1);
  try {
    activateKeepAwakeAsync(tag).catch(() => undefined);
  } catch {
    // not available here
  }
}

export function allowSleep(tag: string): void {
  const n = (held.get(tag) ?? 0) - 1;
  if (n > 0) {
    held.set(tag, n);
    return;
  }
  held.delete(tag);
  try {
    Promise.resolve(deactivateKeepAwake(tag)).catch(() => undefined);
  } catch {
    // the lock was never taken
  }
}

// For a screen, or a part of one: awake while it is shown and on is true.
export function useStayAwake(tag: string, on = true): void {
  useEffect(() => {
    if (!on) return undefined;
    stayAwake(tag);
    return () => allowSleep(tag);
  }, [tag, on]);
}
