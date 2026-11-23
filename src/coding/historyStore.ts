// Coding history on the phone, one AsyncStorage key per car
// (pin16.codingHistory.<VIN>). One write per changed coding: a coding that is
// the same as the newest one saved writes nothing.
import AsyncStorage from '@react-native-async-storage/async-storage';
import { addCoding, CodingHistory, CodingSource, codingHistoryKey, normaliseHex } from './history';

let listeners: (() => void)[] = [];
// Saves run one after another, so two quick records cannot undo each other.
let queue: Promise<unknown> = Promise.resolve();

// Throws when the read fails, so a failed read is not taken for "nothing stored".
// Stored data that cannot be parsed counts as nothing stored.
async function readCodingHistory(vin: string): Promise<CodingHistory> {
  const raw = await AsyncStorage.getItem(codingHistoryKey(vin));
  try {
    const parsed = raw ? JSON.parse(raw) : {};
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? (parsed as CodingHistory) : {};
  } catch {
    return {};
  }
}

export async function loadCodingHistory(vin: string): Promise<CodingHistory> {
  try {
    return await readCodingHistory(vin);
  } catch {
    return {};
  }
}

export interface CodingRecord {
  key: string;
  hex: string;
  source: CodingSource;
  note?: string;
  at?: number;
}

// Records codings for a car. Never throws: the history is a convenience and
// must not stop a read or a write.
export function recordCodings(vin: string, records: CodingRecord[], now: number = Date.now()): Promise<void> {
  const valid = records.filter((r) => r.key && /^([0-9A-F]{2})+$/.test(normaliseHex(r.hex)));
  if (!vin || !valid.length) return Promise.resolve();
  const job = queue.then(async () => {
    try {
      // A failed read throws here, so nothing is written over the stored list.
      const before = await readCodingHistory(vin);
      let next = before;
      for (const r of valid) next = addCoding(next, r.key, r.hex, r.at ?? now, r.source, r.note);
      if (next === before) return;
      await AsyncStorage.setItem(codingHistoryKey(vin), JSON.stringify(next));
      listeners.forEach((l) => l());
    } catch {
      // Storage unavailable: nothing is kept.
    }
  });
  queue = job;
  return job;
}

export function onCodingHistory(fn: () => void): () => void {
  listeners.push(fn);
  return () => {
    listeners = listeners.filter((l) => l !== fn);
  };
}
