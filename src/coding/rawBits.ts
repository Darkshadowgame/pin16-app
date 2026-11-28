// The "Every bit" editor in Workshop: any bit of a module's long coding, named
// where a source names it. Pure logic only; the screen calls these and writes
// through the same coding write path as the rest of the Coding tab.
import { isUnconfirmed } from './categories';
import { ALL_ITEMS, CodingItem, NUMERIC_BYTES } from './items';

// Modules whose coding is never edited bit by bit: airbags and belt tensioners
// (the restraint system), the immobiliser and the engine. The ids are those in
// src/obd/modules.ts; vag-25 (immobiliser) and vag-01 (engine) are not listed
// there today, and are named here so they stay refused if they are added.
export const RAW_REFUSED_MODULES = ['vag-15', 'vag-8f', 'vag-90', 'vag-25', 'engine', 'vag-01', 'vag-11', 'ford-rcm', 'mazda-rcm', 'ford-ocsm'];

// Why the editor is not offered for this module and coding. Null when it is.
export function rawEditorRefusal(moduleId: string, coding: number[] | null | undefined, style?: string | null): string | null {
  if (RAW_REFUSED_MODULES.includes(moduleId)) return 'The coding of this module is not edited bit by bit.';
  if (style === 'short') return 'This module has a short code, which is not edited bit by bit.';
  if (!coding || coding.length < 4) return 'This module has no long coding to edit.';
  return null;
}

// True when the byte holds a number on this module and coding length.
export const isNumericByte = (moduleId: string, length: number, byte: number): boolean => NUMERIC_BYTES.some((n) => n.module === moduleId && n.length === length && n.bytes.includes(byte));

// Why 1 bit may not be written, or null when it may.
export function rawWriteProblem(moduleId: string, coding: number[] | null | undefined, byte: number, bit: number, style?: string | null): string | null {
  const refusal = rawEditorRefusal(moduleId, coding, style);
  if (refusal) return refusal;
  if (!Number.isInteger(byte) || byte < 0 || byte >= coding!.length) return `This coding has ${coding!.length} bytes, so there is no byte ${byte}.`;
  if (!Number.isInteger(bit) || bit < 0 || bit > 7) return `A byte has bits 0 to 7, so there is no bit ${bit}.`;
  if (isNumericByte(moduleId, coding!.length, byte)) return `Byte ${byte} of this coding holds a number, not switches.`;
  return null;
}

// The coding with exactly 1 bit set or cleared. Null when the write is refused.
export function rawWithBit(moduleId: string, coding: number[], byte: number, bit: number, on: boolean, style?: string | null): number[] | null {
  if (rawWriteProblem(moduleId, coding, byte, bit, style)) return null;
  const next = [...coding];
  next[byte] = (on ? next[byte] | (1 << bit) : next[byte] & ~(1 << bit)) & 0xff;
  return next;
}

export interface RawLabel {
  // The setting at this place, or null for "Not named".
  title: string | null;
  // Set when the setting is held back, with the reason.
  held?: string;
  // One vague source or low confidence (the tag Customise shows).
  unconfirmed: boolean;
  // The setting is on when this bit is clear.
  inverted: boolean;
}

const sameLength = (i: CodingItem, length: number) => i.length == null || i.length === length;
const forPlace = (platform: string | null | undefined, moduleId: string, length: number) =>
  platform ? ALL_ITEMS.filter((i) => i.module === moduleId && i.platforms.includes(platform) && !i.short && !i.pick && sameLength(i, length)) : [];

// The known setting at 1 bit of a module's coding, from every row for this
// platform, held and not-offered ones included. A row that is not held is
// preferred when several claim the place.
export function rawBitLabel(platform: string | null | undefined, moduleId: string, length: number, byte: number, bit: number): RawLabel {
  const hits = forPlace(platform, moduleId, length).filter((i) => !i.number && i.byte === byte && (i.bits.includes(bit) || (!!i.field && ((i.field.mask >> bit) & 1) === 1)));
  const hit = hits.find((i) => !i.held) ?? hits[0];
  if (!hit) return { title: null, unconfirmed: false, inverted: false };
  return { title: hit.title, held: hit.held, unconfirmed: isUnconfirmed(hit), inverted: !!hit.field && (hit.field.on & hit.field.mask) === 0 };
}

// The number row that owns a whole byte, when there is one.
export function rawByteNumber(platform: string | null | undefined, moduleId: string, length: number, byte: number): CodingItem | null {
  return forPlace(platform, moduleId, length).find((i) => !!i.number && i.byte === byte) ?? null;
}

// The line for a byte: "Byte 8, 50" (hex), with the name of the number row when there is one.
export function rawByteLine(value: number): string {
  return value.toString(16).toUpperCase().padStart(2, '0');
}
