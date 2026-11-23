// Value names on the phone, one AsyncStorage key per car (pin16.valueNames.<VIN>).
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useEffect, useState } from 'react';
import { removeValueName, setValueName, ValueNames, valueNamesKey } from './valueNames';

let listeners: (() => void)[] = [];
let queue: Promise<unknown> = Promise.resolve();

// Throws when the read fails, so a failed read is not taken for "nothing stored".
// Stored data that cannot be parsed counts as nothing stored.
async function readValueNames(vin: string): Promise<ValueNames> {
  const raw = await AsyncStorage.getItem(valueNamesKey(vin));
  try {
    const parsed = raw ? JSON.parse(raw) : {};
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? (parsed as ValueNames) : {};
  } catch {
    return {};
  }
}

export async function loadValueNames(vin: string): Promise<ValueNames> {
  try {
    return await readValueNames(vin);
  } catch {
    return {};
  }
}

function change(vin: string, fn: (n: ValueNames) => ValueNames): Promise<void> {
  const job = queue.then(async () => {
    try {
      // A failed read throws here, so nothing is written over the stored names.
      const before = await readValueNames(vin);
      const next = fn(before);
      if (next === before) return;
      await AsyncStorage.setItem(valueNamesKey(vin), JSON.stringify(next));
      listeners.forEach((l) => l());
    } catch {
      // Storage unavailable: the name is not kept.
    }
  });
  queue = job;
  return job;
}

export const saveValueName = (vin: string, key: string, name: string, note?: string): Promise<void> => change(vin, (n) => setValueName(n, key, name, note, Date.now()));
export const deleteValueName = (vin: string, key: string): Promise<void> => change(vin, (n) => removeValueName(n, key));

export function onValueNames(fn: () => void): () => void {
  listeners.push(fn);
  return () => {
    listeners = listeners.filter((l) => l !== fn);
  };
}

// The car's names, reloaded when one changes.
export function useValueNames(vin: string | undefined): ValueNames {
  const [names, setNames] = useState<ValueNames>({});
  useEffect(() => {
    if (!vin) return undefined;
    let on = true;
    const load = () => void loadValueNames(vin).then((n) => on && setNames(n));
    load();
    const off = onValueNames(load);
    return () => {
      on = false;
      off();
    };
  }, [vin]);
  return names;
}
