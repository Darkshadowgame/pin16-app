// Names the owner gives to a value of an older VW module (by module, group and
// field), kept per car. The owner's name wins over the built-in list in
// groupLabels.ts and is marked "your name". Pure, so it is tested without a phone.

export interface ValueName {
  name: string;
  note?: string;
  at: number;
}

export type ValueNames = Record<string, ValueName>;

export const valueNamesKey = (vin: string): string => `pin16.valueNames.${vin}`;

// field is 1 to 4, as the Workshop page and Find a switch number it.
export const nameKey = (moduleId: string, group: number, field: number): string => `${moduleId}:${group}:${field}`;

// Adds a name, or renames one already there. An empty name changes nothing.
export function setValueName(names: ValueNames, key: string, name: string, note: string | undefined, at: number): ValueNames {
  const n = name.trim();
  if (!n) return names;
  const entry: ValueName = { name: n, ...(note?.trim() ? { note: note.trim() } : {}), at };
  const old = names[key];
  if (old && old.name === entry.name && old.note === entry.note) return names;
  return { ...names, [key]: entry };
}

export function removeValueName(names: ValueNames, key: string): ValueNames {
  if (!(key in names)) return names;
  const { [key]: _gone, ...rest } = names;
  return rest;
}

export const lookupValueName = (names: ValueNames, moduleId: string, group: number, field: number): ValueName | undefined => names[nameKey(moduleId, group, field)];

// The label to show: the owner's name when there is one (yours: true), else the
// built-in name, else null.
export function valueLabel(builtIn: string | null | undefined, own: ValueName | undefined): { text: string; yours: boolean } | null {
  if (own) return { text: own.name, yours: true };
  return builtIn ? { text: builtIn, yours: false } : null;
}

export const YOUR_NAME = 'your name';
