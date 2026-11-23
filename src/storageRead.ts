// Reads for stores that load a list, change it and save it again.
import AsyncStorage from '@react-native-async-storage/async-storage';

export const isList = (v: unknown): boolean => Array.isArray(v);
export const isRecord = (v: unknown): boolean => !!v && typeof v === 'object' && !Array.isArray(v);

// Throws when the read itself fails, so a failed read is not taken for "nothing
// stored" and written over the saved data. A stored value that cannot be
// parsed, or has the wrong shape, is copied to `<key>.damaged` first and then
// counts as nothing stored.
export async function readJsonStrict<T>(key: string, empty: () => T, valid: (v: unknown) => boolean = () => true): Promise<T> {
  const raw = await AsyncStorage.getItem(key);
  if (!raw) return empty();
  try {
    const v = JSON.parse(raw);
    if (valid(v)) return v as T;
  } catch {
    // fall through to the copy below
  }
  await AsyncStorage.setItem(`${key}.damaged`, raw).catch(() => undefined);
  return empty();
}
