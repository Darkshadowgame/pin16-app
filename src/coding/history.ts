// Coding history: every coding Pin16 reads from or writes to a module, kept per
// car so an earlier coding can be compared and put back. Pure, so it is tested
// without a phone. Storage is in historyStore.ts.

export type CodingSource = 'read' | 'written' | 'typed';

export interface CodingEntry {
  // The coding as upper case hex, no spaces.
  hex: string;
  // When it was read, written or (for a typed one) the date given, in ms.
  at: number;
  source: CodingSource;
  note?: string;
}

// By module key (the module id, as Customise and Workshop use it), newest first.
export type CodingHistory = Record<string, CodingEntry[]>;

export const MAX_PER_MODULE = 30;

export const codingHistoryKey = (vin: string): string => `pin16.codingHistory.${vin}`;

export const SOURCE_TEXT: Record<CodingSource, string> = {
  read: 'Read from the car',
  written: 'Written by Pin16',
  typed: 'Typed in',
};

export const normaliseHex = (hex: string): string => hex.replace(/\s+/g, '').toUpperCase();

// Adds an entry in time order (newest first). Nothing is added when the coding
// is the same as the entry it would sit beside, so reading the same coding
// again keeps one entry. The list keeps the newest 30.
export function addCoding(history: CodingHistory, moduleKey: string, hex: string, at: number, source: CodingSource, note?: string): CodingHistory {
  const h = normaliseHex(hex);
  if (!h) return history;
  const list = history[moduleKey] ?? [];
  const found = list.findIndex((e) => e.at <= at);
  const index = found < 0 ? list.length : found;
  if (list[index - 1]?.hex === h || list[index]?.hex === h) return history;
  const entry: CodingEntry = { hex: h, at, source, ...(note?.trim() ? { note: note.trim() } : {}) };
  return { ...history, [moduleKey]: [...list.slice(0, index), entry, ...list.slice(index)].slice(0, MAX_PER_MODULE) };
}

export interface ByteChange {
  byte: number;
  from: number;
  to: number;
  // Bits (0 to 7, bit 0 is the lowest) that went from off to on, and on to off.
  bitsOn: number[];
  bitsOff: number[];
}

export type CodingDiff = { lengthChanged: false; changes: ByteChange[] } | { lengthChanged: true; olderLength: number; newerLength: number; changes: [] };

const toBytes = (hex: string): number[] => (normaliseHex(hex).match(/../g) ?? []).map((h) => parseInt(h, 16));

// What changed between an older coding and a newer one, byte by byte.
export function diffCodings(olderHex: string, newerHex: string): CodingDiff {
  const a = toBytes(olderHex);
  const b = toBytes(newerHex);
  if (a.length !== b.length) return { lengthChanged: true, olderLength: a.length, newerLength: b.length, changes: [] };
  const changes: ByteChange[] = [];
  a.forEach((from, byte) => {
    const to = b[byte];
    if (from === to) return;
    const bits = [0, 1, 2, 3, 4, 5, 6, 7];
    changes.push({ byte, from, to, bitsOn: bits.filter((k) => !(from & (1 << k)) && to & (1 << k)), bitsOff: bits.filter((k) => from & (1 << k) && !(to & (1 << k))) });
  });
  return { lengthChanged: false, changes };
}

const hex2 = (n: number) => n.toString(16).toUpperCase().padStart(2, '0');

// "Byte 0: 98 to 90 (bit 3 off)"
export function changeLine(c: ByteChange): string {
  const part = (bits: number[], word: string) => (bits.length ? `${bits.length > 1 ? 'bits' : 'bit'} ${bits.join(', ')} ${word}` : '');
  const bits = [part(c.bitsOn, 'on'), part(c.bitsOff, 'off')].filter(Boolean).join(', ');
  return `Byte ${c.byte}: ${hex2(c.from)} to ${hex2(c.to)}${bits ? ` (${bits})` : ''}`;
}

// A 3-byte (short) coding as the number other tools show: 00 19 01 is 0006401.
export function shortNumber(hex: string): string | null {
  const h = normaliseHex(hex);
  return /^[0-9A-F]{6}$/.test(h) ? String(parseInt(h, 16)).padStart(7, '0') : null;
}

// Spaced hex for display: "E3 0E 1E".
export const spacedHex = (hex: string): string => normaliseHex(hex).match(/../g)?.join(' ') ?? '';

// One text line per change; none when the two codings are the same.
export function diffLines(olderHex: string, newerHex: string): string[] {
  const d = diffCodings(olderHex, newerHex);
  if (d.lengthChanged) return [`Length changed: ${d.olderLength} bytes to ${d.newerLength} bytes`];
  const lines = d.changes.map(changeLine);
  const a = shortNumber(olderHex);
  const b = shortNumber(newerHex);
  return a && b && a !== b ? [`Coding ${a} to ${b}`, ...lines] : lines;
}

export type HexCheck = { ok: true; hex: string } | { ok: false; reason: string };

// A coding typed by hand: spaces allowed, whole bytes, the same length as the
// coding the module has now.
export function validateCodingHex(input: string, length: number): HexCheck {
  const h = normaliseHex(input);
  if (!h) return { ok: false, reason: 'Type the coding as hex, for example 98 80 08.' };
  if (!/^[0-9A-F]+$/.test(h)) return { ok: false, reason: 'Use only the digits 0 to 9 and the letters A to F.' };
  if (h.length % 2) return { ok: false, reason: 'A coding is whole bytes of 2 hex digits each. One digit is missing or extra.' };
  if (h.length / 2 !== length) return { ok: false, reason: `This module's coding has ${length} byte${length === 1 ? '' : 's'}. This one has ${h.length / 2}.` };
  return { ok: true, hex: h };
}

// True when an entry with this date would fall past the newest 30 of the list
// and be dropped by addCoding.
export function droppedByCap(list: CodingEntry[] | undefined, at: number): boolean {
  const l = list ?? [];
  const found = l.findIndex((e) => e.at <= at);
  return (found < 0 ? l.length : found) >= MAX_PER_MODULE;
}

export type WhenCheck = { ok: true; at: number } | { ok: false; reason: string };

// The optional date of a typed coding: 2026-11-20 or 2026-11-20 14:30, local
// time. Empty means now.
export function parseWhen(input: string, now: number): WhenCheck {
  const s = input.trim();
  if (!s) return { ok: true, at: now };
  const m = /^(\d{4})-(\d{1,2})-(\d{1,2})(?:[ T](\d{1,2}):(\d{2}))?$/.exec(s);
  const bad: WhenCheck = { ok: false, reason: 'Type the date as 2026-11-20, or 2026-11-20 14:30.' };
  if (!m) return bad;
  const [y, mo, d, h, mi] = [m[1], m[2], m[3], m[4] ?? '12', m[5] ?? '00'].map(Number);
  const date = new Date(y, mo - 1, d, h, mi);
  if (date.getFullYear() !== y || date.getMonth() !== mo - 1 || date.getDate() !== d || h > 23 || mi > 59) return bad;
  return { ok: true, at: date.getTime() };
}

// The date of a typed coding, checked for the screen: it must parse, must not be
// in the future, and must not be so old that the cap of 30 would drop it.
// A date with no time that is today counts as now.
export function checkTypedWhen(input: string, now: number, list: CodingEntry[] | undefined): WhenCheck {
  const w = parseWhen(input, now);
  if (!w.ok) return w;
  const hasTime = /[ T]\d{1,2}:\d{2}$/.test(input.trim());
  const sameDay = new Date(w.at).toDateString() === new Date(now).toDateString();
  const at = !hasTime && sameDay ? Math.min(w.at, now) : w.at;
  if (at > now) return { ok: false, reason: 'That date is in the future. Type a date that has passed.' };
  if (droppedByCap(list, at)) return { ok: false, reason: `This date is older than the ${MAX_PER_MODULE} codings kept for this module, so it would be dropped. Type a newer date.` };
  return { ok: true, at };
}
