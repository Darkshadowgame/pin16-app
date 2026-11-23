// The last knock monitor session of each car, kept on the phone so its peaks
// and verdict can be read after the drive.
import AsyncStorage from '@react-native-async-storage/async-storage';
import { isRecord, readJsonStrict } from '../storageRead';
import type { KnockSession } from './knock';

export interface SavedKnock {
  vin: string;
  at: number;
  session: KnockSession;
}

const KEY = 'caristini.knock.v1';

// Throws when the read fails, so a writer does not save over what is stored.
function allStrict(): Promise<Record<string, SavedKnock>> {
  return readJsonStrict<Record<string, SavedKnock>>(KEY, () => ({}), isRecord);
}

async function all(): Promise<Record<string, SavedKnock>> {
  try {
    return await allStrict();
  } catch {
    return {};
  }
}

export async function loadKnock(vin: string): Promise<SavedKnock | null> {
  return (await all())[vin] ?? null;
}

// A session with no readings is not kept: it would hide the last real one.
export async function saveKnock(vin: string, session: KnockSession, at = Date.now()): Promise<SavedKnock | null> {
  if (!session.samples) return null;
  const saved: SavedKnock = { vin, at, session };
  try {
    const list = await allStrict();
    await AsyncStorage.setItem(KEY, JSON.stringify({ ...list, [vin]: saved }));
  } catch {
    // Storage unavailable, or the stored list could not be read: the session still shows on screen.
  }
  return saved;
}

// "1.5°, 0.0°, 3.0°, 0.0°": the peak of each cylinder, cylinder 1 first.
export function peaksText(session: Pick<KnockSession, 'peak'>): string {
  return session.peak.map((p) => `${p.toFixed(1)}°`).join(', ');
}

// Readings a second from the times of the last answers that held values; null
// until there are 2. A group that does not answer gives no rate.
export function answerRate(times: number[]): number | null {
  if (times.length < 2) return null;
  const span = (times[times.length - 1] - times[0]) / 1000;
  return span > 0 ? (times.length - 1) / span : null;
}
