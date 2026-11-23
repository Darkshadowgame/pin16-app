// Car diary: service and repair log, stored on the phone.
import AsyncStorage from '@react-native-async-storage/async-storage';
import { isList, readJsonStrict } from './storageRead';

export interface DiaryEntry {
  id: string;
  vin: string | null;
  vehicleName: string;
  date: string; // YYYY-MM-DD
  kind: string;
  mileage: number | null;
  // The unit the mileage was typed in; entries saved before it was kept use
  // the unit set in Settings.
  unit?: 'mi' | 'km';
  notes: string;
}

// Written for you when Customise, Workshop or Try mode changes a setting.
export const SETTING_CHANGED = 'Setting changed';

export const DIARY_KINDS = ['Oil service', 'Inspection', 'Service reset', 'Faults cleared', 'Brakes', 'Tyres', 'Battery', 'Repair', SETTING_CHANGED, 'Other'];

const KEY = 'gauge.diary.v1';

// Throws when the read fails, so a writer can tell that from an empty diary.
async function readDiary(): Promise<DiaryEntry[]> {
  return readJsonStrict<DiaryEntry[]>(KEY, () => [], isList);
}

export async function loadDiary(): Promise<DiaryEntry[]> {
  try {
    const list = await readDiary();
    return list.sort((a, b) => b.date.localeCompare(a.date));
  } catch {
    return [];
  }
}

// Diary changes run one after another, so two quick ones cannot undo each other.
let diaryTail: Promise<unknown> = Promise.resolve();
function inTurn<T>(job: () => Promise<T>): Promise<T> {
  const run = diaryTail.then(job, job);
  diaryTail = run.catch(() => undefined);
  return run;
}

// Resolves true when the entry was saved. False means it was not: the stored
// diary could not be read, or storage refused the write. Nothing is written
// over the saved diary then.
export function addDiary(entry: Omit<DiaryEntry, 'id'>): Promise<boolean> {
  return inTurn(async () => {
    try {
      const list = await readDiary();
      const next = [{ ...entry, id: `${Date.now()}-${Math.round(Math.random() * 1e6)}` }, ...list];
      await AsyncStorage.setItem(KEY, JSON.stringify(next));
      return true;
    } catch {
      return false;
    }
  });
}

export function removeDiary(id: string): Promise<boolean> {
  return inTurn(async () => {
    try {
      const list = await readDiary();
      await AsyncStorage.setItem(KEY, JSON.stringify(list.filter((e) => e.id !== id)));
      return true;
    } catch {
      return false;
    }
  });
}

export function today(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// UK date for display and typing: 2026-11-15 shows as 15/11/2026.
export function ukDate(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : iso;
}

// A typed UK date (15/11/2026, 15-11-2026, 15.11.2026 or 5/1/2026) as
// 2026-11-15 for storage, or null when it is not a real date.
export function parseUkDate(text: string): string | null {
  const m = /^\s*(\d{1,2})[/.\-](\d{1,2})[/.\-](\d{4})\s*$/.exec(text);
  if (!m) return null;
  const [d, mo, y] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const date = new Date(y, mo - 1, d);
  if (date.getFullYear() !== y || date.getMonth() !== mo - 1 || date.getDate() !== d) return null;
  return `${y}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

// The day before or after an ISO date, for the date stepper.
export function shiftDate(iso: string, days: number): string {
  const [y, m, d] = iso.split('-').map(Number);
  const date = new Date(y, m - 1, d + days);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}
