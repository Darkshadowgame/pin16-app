// History per car: every scan, fault clear, setting change, service tool and
// search Pin16 runs is logged on the phone, so it can be read later with
// no adapter connected.
import AsyncStorage from '@react-native-async-storage/async-storage';
import { isList, readJsonStrict } from './storageRead';

export type HistoryKind = 'scan' | 'clear' | 'change' | 'service' | 'sensors' | 'discover' | 'mot' | 'battery' | 'calibration';

export interface HistoryFault {
  module: string;
  code: string;
  text?: string;
}

// One module write within a setting change, for the change timeline.
export interface HistoryChange {
  module: string;
  // Customise key: module id, or "moduleId:DID" for an adaptation value.
  key?: string;
  setting: string;
  // The setting's value before and after in words (On, Off), when known.
  from?: string;
  to?: string;
  // Coding or value bytes in hex, before and after.
  before: string;
  after: string;
  // The backup the module had when written (its original, from Backups).
  backup?: string;
  // Where the write was made: Customise, Workshop or Try mode.
  source?: string;
}

export interface HistoryEntry {
  id: string;
  vin: string;
  at: number; // ms
  kind: HistoryKind;
  title: string;
  detail?: string;
  // Scans: faults found, modules that answered, and whether the scan finished.
  faults?: HistoryFault[];
  modules?: number;
  complete?: boolean;
  // Scans: the car has control modules but none of them answered.
  noAnswer?: boolean;
  // Scans: the modules read (answered), so a fault in a module not read is
  // not counted as cleared.
  read?: string[];
  // Changes: before and after, for the record.
  before?: string;
  after?: string;
  // Changes: one line per module written (entries from 15 Nov 2026 on).
  changes?: HistoryChange[];
  odometerKm?: number;
  // MOT checks: the full result as shareable text.
  motText?: string;
}

export const HISTORY_LABEL: Record<HistoryKind, string> = {
  scan: 'Health check',
  clear: 'Faults cleared',
  change: 'Setting changed',
  service: 'Service reset',
  sensors: 'Find my car’s sensors',
  discover: 'Learn my car',
  mot: 'MOT check',
  battery: 'Battery test',
  calibration: 'Calibrations',
};

const KEY = 'caristini.history.v1';
const MAX = 500;
let listeners: (() => void)[] = [];

// Throws when the read fails, so a writer can tell that from an empty history.
async function readHistory(): Promise<HistoryEntry[]> {
  return readJsonStrict<HistoryEntry[]>(KEY, () => [], isList);
}

export async function loadHistory(vin?: string): Promise<HistoryEntry[]> {
  try {
    const list = await readHistory();
    return (vin ? list.filter((e) => e.vin === vin) : list).sort((a, b) => b.at - a.at);
  } catch {
    return [];
  }
}

// Each change loads the whole list, changes it and saves it. They run one
// after another, so two at once (a check finishing while a clear is logged)
// cannot save over each other.
let tail: Promise<unknown> = Promise.resolve();
function inTurn<T>(job: () => Promise<T>): Promise<T> {
  const run = tail.then(job, job);
  tail = run.catch(() => undefined);
  return run;
}

// Returns the new entry's id, so a later step can add to it (updateHistory).
export async function addHistory(entry: Omit<HistoryEntry, 'id' | 'at'> & { at?: number }): Promise<string> {
  // Any fault clear resets the emissions self-tests: drop the saved read.
  if (entry.kind === 'clear') await import('./diag/emissionsStore').then((m) => m.forgetEmissions(entry.vin)).catch(() => undefined);
  return inTurn(async () => {
    const id = `${Date.now()}-${Math.round(Math.random() * 1e6)}`;
    try {
      // A failed read throws here, so the stored list is left alone.
      const list = await readHistory();
      const next = [{ ...entry, at: entry.at ?? Date.now(), id }, ...list].slice(0, MAX);
      await AsyncStorage.setItem(KEY, JSON.stringify(next));
    } catch {
      // Storage unavailable, or the read failed: nothing is written over the saved list.
    }
    listeners.forEach((l) => l());
    return id;
  });
}

// Adds to an entry already saved: the health check's older-module search
// finishes after its entry is saved.
export function updateHistory(id: string, patch: Partial<Omit<HistoryEntry, 'id' | 'vin'>>): Promise<void> {
  return inTurn(async () => {
    try {
      const list = await readHistory();
      if (!list.some((e) => e.id === id)) return;
      await AsyncStorage.setItem(KEY, JSON.stringify(list.map((e) => (e.id === id ? { ...e, ...patch } : e))));
    } catch {
      // Read or write failed: the saved list is left as it is.
    }
    listeners.forEach((l) => l());
  });
}

export function removeHistory(id: string): Promise<void> {
  return inTurn(async () => {
    try {
      const list = await readHistory();
      await AsyncStorage.setItem(KEY, JSON.stringify(list.filter((e) => e.id !== id)));
    } catch {
      // Read or write failed: the saved list is left as it is.
    }
    listeners.forEach((l) => l());
  });
}

export function onHistory(fn: () => void): () => void {
  listeners.push(fn);
  return () => {
    listeners = listeners.filter((l) => l !== fn);
  };
}

// Faults that were in the previous scan and are gone from this one.
export function goneSince(prev: HistoryEntry | undefined, now: HistoryFault[]): HistoryFault[] {
  if (!prev?.faults) return [];
  const seen = new Set(now.map((f) => `${f.module}|${f.code}`));
  return prev.faults.filter((f) => !seen.has(`${f.module}|${f.code}`));
}
