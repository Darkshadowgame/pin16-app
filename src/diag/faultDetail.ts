// The extra line under a fault read from an older-protocol module: mileage when
// it was logged, how many times it has happened, and priority. Pure, tested in
// __tests__/carFeatures2026-11-21.test.ts.
import type { FaultDetail } from '../obd/kwpAdapt';

export function faultDetailLines(d: Pick<FaultDetail, 'km' | 'frequency' | 'priority'>, miles: boolean): string[] {
  const dist = miles ? Math.round(d.km / 1.609344) : d.km;
  return [`Logged at ${dist.toLocaleString('en-GB')} ${miles ? 'mi' : 'km'}`, `Happened ${d.frequency} time${d.frequency === 1 ? '' : 's'}`, `Priority ${d.priority}`];
}

export type DetailState = FaultDetail | 'unsupported' | 'failed' | undefined;

// Only "the module does not support it" is remembered, per car, module and
// fault, for the life of the app. A failed read is never kept, and a read that
// worked is not kept either, so a fault that came back shows its new figures.
const unsupported = new Set<string>();

export function knownDetail(key: string): DetailState {
  return unsupported.has(key) ? 'unsupported' : undefined;
}

// What a read gave (null: it failed or had no route) as the state to show.
export function settleDetail(key: string, read: FaultDetail | 'unsupported' | null): DetailState {
  if (read === 'unsupported') unsupported.add(key);
  return read ?? 'failed';
}

// Whether opening the row should read: nothing good is held yet (a failed read is tried again).
export const needsDetailRead = (state: DetailState) => state === undefined || state === 'failed';

export function forgetDetails(): void {
  unsupported.clear();
}
