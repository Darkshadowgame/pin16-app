// Saved monitor data on the phone (AsyncStorage): performance runs per car,
// custom timer ranges, and trips per car.
import AsyncStorage from '@react-native-async-storage/async-storage';
import { isList, readJsonStrict } from '../storageRead';
import type { SavedTrip } from './trip';

const RUNS = 'caristini.perfRuns.v1';
const RANGES = 'caristini.perfRanges.v1';
const TRIPS = 'caristini.trips.v1';
const MAX_RUNS = 300;
const MAX_TRIPS = 200;

export interface SavedRun {
  vin: string;
  testId: string;
  label: string;
  seconds: number;
  // Plus or minus, in seconds (see runUncertainty in app/performance.tsx).
  plusMinus: number | null;
  rate: number;
  samples: number;
  finishKmh?: number;
  at: number;
}

export interface CustomRange {
  id: string;
  fromKmh: number;
  toKmh: number;
  // Unit the owner typed the range in, for its label.
  unit: 'mph' | 'km/h';
}

// Throws when the read fails, so a writer does not save over what is stored.
function loadStrict<T>(key: string): Promise<T[]> {
  return readJsonStrict<T[]>(key, () => [], isList);
}

async function load<T>(key: string): Promise<T[]> {
  try {
    return await loadStrict<T>(key);
  } catch {
    return [];
  }
}

// Loads the list, changes it and saves it. A failed read saves nothing.
async function change<T>(key: string, edit: (list: T[]) => T[]): Promise<void> {
  try {
    await save(key, edit(await loadStrict<T>(key)));
  } catch {
    // The stored list could not be read: it is left as it is.
  }
}

async function save<T>(key: string, list: T[]): Promise<void> {
  try {
    await AsyncStorage.setItem(key, JSON.stringify(list));
  } catch {
    // Storage unavailable: the data stays for this session only.
  }
}

export async function loadRuns(vin: string): Promise<SavedRun[]> {
  return (await load<SavedRun>(RUNS)).filter((r) => r.vin === vin).sort((a, b) => b.at - a.at);
}

export async function addRun(run: SavedRun): Promise<void> {
  await change<SavedRun>(RUNS, (list) => [run, ...list].slice(0, MAX_RUNS));
}

export async function clearRuns(vin: string): Promise<void> {
  await change<SavedRun>(RUNS, (list) => list.filter((r) => r.vin !== vin));
}

export function loadRanges(): Promise<CustomRange[]> {
  return load<CustomRange>(RANGES);
}

export async function saveRanges(list: CustomRange[]): Promise<void> {
  try {
    // A failed read means the stored ranges are unknown: save nothing.
    await loadStrict<CustomRange>(RANGES);
  } catch {
    return;
  }
  await save(RANGES, list);
}

export async function loadTrips(vin: string): Promise<SavedTrip[]> {
  return (await load<SavedTrip>(TRIPS)).filter((t) => t.vin === vin).sort((a, b) => b.startedAt - a.startedAt);
}

export async function addTrip(trip: SavedTrip): Promise<void> {
  await change<SavedTrip>(TRIPS, (list) => [trip, ...list].slice(0, MAX_TRIPS));
}

export async function removeTrip(id: string): Promise<void> {
  await change<SavedTrip>(TRIPS, (list) => list.filter((t) => t.id !== id));
}
