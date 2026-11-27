// Adjustable values: VW adaptation channels on the 2007 SEAT Leon (PQ35),
// each a number a module keeps. Rows are from replica/vag-tweaks.md, section
// "SEAT Leon II 1P1 Cupra 2007 (PQ35)", type adaptation, confidence High, and
// only rows that give a channel number and a range or named values. Ranges and
// meanings are copied from that file. Rows for 09 channels 4, 7 and 8 and the
// cluster channels 3 and 4 were added on 27 Nov 2026 from the Ross-Tech wiki pages
// (replica/leon-mods-2026-11-27.md). Left out on purpose: remote key matching
// or clearing (comfort channels 0 and 1), the alarm horn pattern, load
// management, service interval channels, and anything the file marks RISK.
// The step is the file's where it gives one, otherwise 1.
import type { AdaptationSave } from '../obd/kwpAdapt';

export interface AdaptationChoice {
  value: number;
  label: string;
}

export interface AdaptationItem {
  id: string;
  // Module id from src/obd/modules.ts.
  module: string;
  channel: number;
  title: string;
  // Plain words for what the value does.
  summary: string;
  // What the source says it needs in the coding, shown in the open detail only.
  needs?: string;
  unit?: string;
  min: number;
  max: number;
  step: number;
  choices?: AdaptationChoice[];
  confidence: 'high';
  platforms: string[];
  sources: { label: string; url: string }[];
}

const CENTRAL = { label: 'Ross-Tech wiki: SEAT Leon (1P) central electronics', url: 'https://wiki.ross-tech.com/wiki/index.php/Seat_Leon_(1P)_Central_Electronics' };
const CLUSTER = { label: 'Ross-Tech wiki: SEAT Leon (1P) instrument cluster', url: 'https://wiki.ross-tech.com/wiki/index.php/Seat_Leon_(1P)_Instrument_Cluster' };
const COMFORT = { label: 'Ross-Tech wiki: VW Golf (1K) comfort system (linked from the Leon 1P page)', url: 'https://wiki.ross-tech.com/wiki/index.php/VW_Golf_(1K)_Comfort_System' };
const ON_OFF: AdaptationChoice[] = [
  { value: 0, label: 'Off' },
  { value: 1, label: 'On' },
];
const CONFIRM: AdaptationChoice[] = [
  { value: 0, label: 'None' },
  { value: 1, label: 'Flash' },
  { value: 2, label: 'Horn' },
  { value: 3, label: 'Both' },
];

type Row = Omit<AdaptationItem, 'confidence' | 'platforms' | 'min' | 'max' | 'step' | 'id'> & Partial<Pick<AdaptationItem, 'min' | 'max' | 'step'>>;
const row = (r: Row): AdaptationItem => ({
  min: 0,
  max: 1,
  step: 1,
  ...r,
  id: `${r.module}:${r.channel}`,
  confidence: 'high',
  platforms: ['PQ35'],
});

export const ADAPTATIONS: AdaptationItem[] = [
  row({ module: 'vag-09', channel: 1, title: 'Coming home time', summary: 'The coming home duration, 10 to 60 seconds in steps of 10.', needs: 'Needs byte 0 bit 7 of the coding.', unit: 's', min: 10, max: 60, step: 10, sources: [CENTRAL] }),
  row({ module: 'vag-09', channel: 2, title: 'Leaving home time', summary: 'The leaving home duration, 10 to 60 seconds in steps of 10.', needs: 'Needs byte 0 bit 5 of the coding.', unit: 's', min: 10, max: 60, step: 10, sources: [CENTRAL] }),
  row({ module: 'vag-09', channel: 3, title: 'Heated rear window and mirror run time', summary: 'The run time of the heated rear window and mirror, 1 to 254 minutes.', unit: 'min', min: 1, max: 254, step: 1, sources: [CENTRAL] }),
  row({ module: 'vag-09', channel: 4, title: 'Headlight washer run time', summary: 'The run time of the headlight washers, 50 to 10000 milliseconds in steps of 50.', needs: 'Needs byte 1 bit 1 of the coding (headlight washers fitted).', unit: 'ms', min: 50, max: 10000, step: 50, sources: [CENTRAL] }),
  row({ module: 'vag-09', channel: 5, title: 'Footwell light dimming', summary: 'The footwell light dimming, 20 to 100 percent.', needs: 'Sources disagree on which coding bit it needs: Ross-Tech says byte 0 bit 1, label dumps say byte 0 bit 2 (Footwell Lights installed). Check the Long Coding Helper label.', unit: '%', min: 20, max: 100, step: 1, sources: [CENTRAL] }),
  row({ module: 'vag-09', channel: 7, title: 'High beam with the automatic headlights', summary: 'Lets the high beam work with the automatic headlight function, on or off.', choices: ON_OFF, sources: [CENTRAL] }),
  row({ module: 'vag-09', channel: 8, title: 'Automatic headlight delay', summary: 'The delay before the automatic headlights switch on or off, 0 to 10200 milliseconds in steps of 40.', unit: 'ms', min: 0, max: 10200, step: 40, sources: [CENTRAL] }),
  row({ module: 'vag-17', channel: 3, title: 'Fuel consumption display correction', summary: 'Scales the consumption shown in the cluster, 85 to 115 percent. 100 is the standard.', unit: '%', min: 85, max: 115, step: 1, sources: [CLUSTER] }),
  row({
    module: 'vag-17',
    channel: 4,
    title: 'Cluster language',
    summary: 'The language of the cluster messages.',
    min: 1,
    max: 8,
    choices: [
      { value: 1, label: 'German' },
      { value: 2, label: 'English' },
      { value: 3, label: 'French' },
      { value: 4, label: 'Italian' },
      { value: 5, label: 'Spanish' },
      { value: 6, label: 'Portuguese' },
      { value: 7, label: 'No text' },
      { value: 8, label: 'Czech' },
    ],
    sources: [CLUSTER],
  }),
  row({ module: 'vag-46', channel: 3, title: 'Selective unlock', summary: 'Selective unlock, on or off.', choices: ON_OFF, sources: [COMFORT] }),
  row({ module: 'vag-46', channel: 4, title: 'Auto lock at 15 km/h', summary: 'Auto lock at 15 km/h, on or off.', choices: ON_OFF, sources: [COMFORT] }),
  row({ module: 'vag-46', channel: 5, title: 'Auto unlock when key removed', summary: 'Auto unlock when the key is removed, on or off.', choices: ON_OFF, sources: [COMFORT] }),
  row({ module: 'vag-46', channel: 7, title: 'Unlock confirmation with the remote', summary: 'Unlock confirmation with the remote: none, flash, horn or both.', choices: CONFIRM, max: 3, sources: [COMFORT] }),
  row({ module: 'vag-46', channel: 8, title: 'Unlock confirmation with the key', summary: 'Unlock confirmation with the key: none, flash, horn or both.', choices: CONFIRM, max: 3, sources: [COMFORT] }),
  row({ module: 'vag-46', channel: 10, title: 'Lock confirmation with the remote', summary: 'Lock confirmation with the remote: none, flash, horn or both.', choices: CONFIRM, max: 3, sources: [COMFORT] }),
  row({ module: 'vag-46', channel: 11, title: 'Lock confirmation with the key', summary: 'Lock confirmation with the key: none, flash, horn or both.', choices: CONFIRM, max: 3, sources: [COMFORT] }),
  row({ module: 'vag-46', channel: 12, title: 'Deadlock (SAFE) confirmation', summary: 'Deadlock (SAFE) confirmation: none, flash, horn or both.', choices: CONFIRM, max: 3, sources: [COMFORT] }),
  row({ module: 'vag-46', channel: 17, title: 'Comfort functions by remote', summary: 'The comfort functions through the remote master switch. No effect if comfort functions are off in the long coding.', choices: ON_OFF, sources: [COMFORT] }),
  row({
    module: 'vag-46',
    channel: 18,
    title: 'Alarm delay on the driver door',
    summary: 'Choose no delay to remove the alarm delay on the driver door, or delay to keep it.',
    choices: [
      { value: 0, label: 'Delay' },
      { value: 1, label: 'No delay' },
    ],
    sources: [COMFORT],
  }),
];

export function adaptationsFor(group: string | undefined, platform: string | null | undefined): AdaptationItem[] {
  if (group !== 'vag' || !platform) return [];
  return ADAPTATIONS.filter((a) => a.platforms.some((p) => p.toLowerCase() === platform.toLowerCase()));
}

// The key under which the original and the change timeline hold this value:
// module:ADAPT<channel>. It has a colon, so it is never taken for a module.
export const adaptationKey = (a: Pick<AdaptationItem, 'module' | 'channel'>) => `${a.module}:ADAPT${String(a.channel).padStart(2, '0')}`;
export const isAdaptationKey = (key: string) => /^[^:]+:ADAPT\d+$/.test(key);
export function itemForKey(key: string): AdaptationItem | undefined {
  return ADAPTATIONS.find((a) => adaptationKey(a) === key);
}

// Two bytes as the module sends them, for the original and the timeline.
export const valueHex = (n: number) => (n & 0xffff).toString(16).toUpperCase().padStart(4, '0');
export const valueFromHex = (h: string) => parseInt(h, 16);

export function formatAdaptation(a: AdaptationItem, value: number): string {
  const named = a.choices?.find((c) => c.value === value);
  if (named) return named.label;
  return a.unit ? `${value} ${a.unit}` : String(value);
}

export function inRange(a: AdaptationItem, value: number): boolean {
  if (a.choices) return a.choices.some((c) => c.value === value);
  return Number.isInteger(value) && value >= a.min && value <= a.max;
}

// One step up or down from a value, on the grid that starts at min, kept
// inside min and max. A value off the grid moves to the next grid value.
export function stepValue(a: Pick<AdaptationItem, 'min' | 'max' | 'step'>, value: number, dir: 1 | -1): number {
  const k = (value - a.min) / a.step;
  const next = dir > 0 ? Math.floor(k + 1e-9) + 1 : Math.ceil(k - 1e-9) - 1;
  const to = Math.min(a.max, Math.max(a.min, a.min + next * a.step));
  // Outside the range, the button that points away from it does nothing.
  return (dir > 0 && to < value) || (dir < 0 && to > value) ? value : to;
}

// Whether a step button has anywhere to go from this value.
export function canStep(a: Pick<AdaptationItem, 'min' | 'max' | 'step'>, value: number, dir: 1 | -1): boolean {
  return stepValue(a, value, dir) !== value;
}

// A typed value brought onto the row's grid and inside min and max. Null when
// it is not a whole number, or lies outside 0 to 65535, so nothing is sent.
export function clampToRow(a: Pick<AdaptationItem, 'min' | 'max' | 'step'>, value: number): number | null {
  if (!Number.isInteger(value) || value < 0 || value > 0xffff) return null;
  const onGrid = a.min + Math.round((value - a.min) / a.step) * a.step;
  return Math.min(a.max, Math.max(a.min, onGrid));
}

// A row with too many values for a list opens a typed field instead.
export function isWideRow(a: Pick<AdaptationItem, 'min' | 'max' | 'step' | 'choices'>): boolean {
  return !a.choices && (a.max - a.min) / a.step > 12;
}

// A typed value checked against the row's own min, max and step. Only a whole
// number inside the range and on the step grid passes; nothing else is sent.
export function typedValueCheck(a: Pick<AdaptationItem, 'min' | 'max' | 'step' | 'unit'>, text: string): { ok: true; value: number } | { ok: false; text: string } {
  const range = `${a.min} to ${a.max}${a.unit ? ` ${a.unit}` : ''}${a.step > 1 ? `, in steps of ${a.step}` : ''}`;
  if (!/^[0-9]+$/.test(text.trim())) return { ok: false, text: `Type a whole number from ${range}.` };
  const n = Number(text.trim());
  if (n < a.min || n > a.max) return { ok: false, text: `${n} is outside ${range}.` };
  if ((n - a.min) % a.step !== 0) {
    const near = clampToRow(a, n);
    return { ok: false, text: `${n} is not on the steps of ${a.step}. The nearest value is ${near}.` };
  }
  return { ok: true, value: n };
}

// The line under the row after a save.
export function adaptationResultText(a: AdaptationItem, wanted: number, res: AdaptationSave | null): { ok: boolean; text: string } {
  if (!res) return { ok: false, text: `${a.title}: the module did not answer on the older protocol. Nothing was changed.` };
  if (!res.accepted && !res.reason) return { ok: false, text: `${a.title}: the module did not accept the save.` };
  if (res.ok) return { ok: true, text: `${a.title} is now ${formatAdaptation(a, wanted)}${res.before != null ? ` (was ${formatAdaptation(a, res.before)})` : ''}. Switch the ignition off and on to see it.` };
  const now = res.after != null ? ` The module reads ${formatAdaptation(a, res.after)}.` : '';
  return { ok: false, text: `Did not take. ${res.reason ?? 'The module did not keep the value.'}${now}`.replace(/\s+/g, ' ').trim() };
}
