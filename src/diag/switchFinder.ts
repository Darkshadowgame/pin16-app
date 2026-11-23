// Find a switch (older VW modules): every value group of a module is read round
// after round. The first full round is the baseline; a field that later shows
// a different value is listed, with how often it changed. Pure, so it is tested
// without a phone.

export interface SwitchCell {
  value: number | string;
  unit: string;
}

export interface SwitchField {
  group: number;
  // 1 to 4, as the Workshop page numbers them.
  field: number;
  unit: string;
  isBits: boolean;
  baseline: string;
  now: string;
  changes: number;
  lastChangeAt: number;
}

export interface SwitchTracker {
  groups: number[];
  fields: Record<string, SwitchField>;
  // Groups asked in the round in progress (answered or not).
  seen: number[];
  rounds: number;
  roundStartedAt: number;
  lastRoundMs: number | null;
}

export const fieldKey = (group: number, field: number) => `${group}.${field}`;

// How a value reads: bits as 8 binary digits, numbers rounded to 2 places with
// their unit. The text is also what two readings are compared by.
export function cellText(c: SwitchCell): string {
  if (c.unit === 'bits') return String(c.value).padStart(8, '0');
  if (typeof c.value === 'number') {
    const n = Math.round(c.value * 100) / 100;
    return c.unit === 'raw' || !c.unit ? String(n) : `${n} ${c.unit}`;
  }
  return `${c.value} ${c.unit}`.trim();
}

export function newTracker(groups: number[], at: number): SwitchTracker {
  return { groups: [...groups], fields: {}, seen: [], rounds: 0, roundStartedAt: at, lastRoundMs: null };
}

// Forget the baseline and the changes: the next full round becomes the baseline.
export function resetBaseline(t: SwitchTracker, at: number): SwitchTracker {
  return { ...newTracker(t.groups, at) };
}

// One group answered (cells) or did not (null). A group's first answer is its
// baseline; later answers are compared with the one before.
export function addReading(t: SwitchTracker, group: number, cells: SwitchCell[] | null, at: number): SwitchTracker {
  let fields = t.fields;
  if (cells?.length) {
    const next: Record<string, SwitchField> = {};
    cells.forEach((c, i) => {
      const key = fieldKey(group, i + 1);
      const text = cellText(c);
      const old = fields[key];
      if (!old) {
        next[key] = { group, field: i + 1, unit: c.unit, isBits: c.unit === 'bits', baseline: text, now: text, changes: 0, lastChangeAt: 0 };
      } else if (old.now !== text) {
        next[key] = { ...old, now: text, changes: old.changes + 1, lastChangeAt: at };
      }
    });
    if (Object.keys(next).length) fields = { ...fields, ...next };
  }
  let seen = t.seen.includes(group) ? t.seen : [...t.seen, group];
  let { rounds, roundStartedAt, lastRoundMs } = t;
  if (t.groups.every((g) => seen.includes(g))) {
    rounds += 1;
    lastRoundMs = Math.max(0, at - roundStartedAt);
    roundStartedAt = at;
    seen = [];
  }
  return { ...t, fields, seen, rounds, roundStartedAt, lastRoundMs };
}

// The fields that have changed since the baseline, the latest change first.
export function changedFields(t: SwitchTracker): SwitchField[] {
  return Object.values(t.fields)
    .filter((f) => f.changes > 0)
    .sort((a, b) => b.lastChangeAt - a.lastChangeAt || a.group - b.group || a.field - b.field);
}

// The baseline is set once every group has been asked once.
export const baselineReady = (t: SwitchTracker): boolean => t.rounds > 0;
