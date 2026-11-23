// MOT check in progress, per car, kept on the phone so the walk-round can be
// done over a few days and the car read once.
import AsyncStorage from '@react-native-async-storage/async-storage';
import { isRecord, readJsonStrict } from '../storageRead';
import type { Answer, CarRead } from './rules';

export interface MotDraft {
  vin: string;
  startedAt: number;
  answers: Record<string, Answer>;
  read: CarRead | null;
  // When this draft was last saved to History.
  savedAt?: number;
}

const KEY = 'caristini.mot.v1';

// Throws when the read fails, so a writer does not save over what is stored.
function allStrict(): Promise<Record<string, MotDraft>> {
  return readJsonStrict<Record<string, MotDraft>>(KEY, () => ({}), isRecord);
}

async function all(): Promise<Record<string, MotDraft>> {
  try {
    return await allStrict();
  } catch {
    return {};
  }
}

export async function loadDraft(vin: string): Promise<MotDraft | null> {
  return (await all())[vin] ?? null;
}

export async function saveDraft(d: MotDraft): Promise<void> {
  try {
    const list = await allStrict();
    await AsyncStorage.setItem(KEY, JSON.stringify({ ...list, [d.vin]: d }));
  } catch {
    // Storage unavailable: the check still works this session.
  }
}

export async function clearDraft(vin: string): Promise<void> {
  try {
    const list = await allStrict();
    delete list[vin];
    await AsyncStorage.setItem(KEY, JSON.stringify(list));
  } catch {
    // Read or write failed: the saved drafts are left as they are.
  }
}
