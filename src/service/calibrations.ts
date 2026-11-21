// Calibrations Pin16 repeats from the recording of another tool on the owner's
// 2007 SEAT Leon, 21 Nov 2026 (replica/leon-listen-2026-11-21.md). Pure parts
// only: the list, the English lines for the module's German text, and the
// words for how a run ended. Tested in __tests__/carFeatures2026-11-21.test.ts.
import type { BasicEnd } from '../obd/kwpAdapt';
import type { MeasuringCell } from '../obd/tp20';

export interface Calibration {
  id: 'heater-flap' | 'throttle-body';
  title: string;
  // Module id from src/obd/modules.ts.
  module: string;
  // Basic setting group.
  group: number;
  // About how long it takes, and the longest Pin16 lets it run, in seconds.
  aboutSeconds: number;
  maxSeconds: number;
  summary: string;
  // Group number and address, shown behind "Technical".
  technical: string;
}

export const CALIBRATIONS_NOTE = 'Pin16 repeats a calibration recorded from another tool on this car and shows what the module reports. It does not judge the result, and it does not know what state the car needs to be in.';

export const CALIBRATIONS: Calibration[] = [
  {
    id: 'heater-flap',
    title: 'Heater flap calibration',
    module: 'vag-08',
    group: 1,
    aboutSeconds: 30,
    maxSeconds: 45,
    summary: 'Calibrates the heater flaps in the climate control. Takes about 30 seconds.',
    technical: 'Basic setting group 1 on the climate module (address 2C).',
  },
  {
    id: 'throttle-body',
    title: 'Throttle body calibration',
    module: 'engine',
    group: 60,
    aboutSeconds: 120,
    maxSeconds: 150,
    summary: 'Calibrates the throttle body in the engine. Takes about 2 minutes.',
    technical: 'Basic setting group 60 (0x3C) on the engine (address 01).',
  },
];

const ENGLISH: Record<string, string> = {
  'endanschlaege lernen': 'Learning the end stops',
};

const fold = (s: string) =>
  s
    .toLowerCase()
    .replace(/ä/g, 'ae')
    .replace(/ö/g, 'oe')
    .replace(/ü/g, 'ue')
    .replace(/ß/g, 'ss')
    .replace(/\s+/g, ' ')
    .trim();

// A plain English line for a German text the module sends, or null when Pin16
// has none. The German text itself is always shown as sent.
export function englishFor(text: string): string | null {
  return ENGLISH[fold(text)] ?? null;
}

// What the module reports in one update: text as sent, or cells as lines.
export function reportLines(value: MeasuringCell[] | string): string[] {
  if (typeof value === 'string') return value ? [value] : [];
  return value.map((c) => `${c.value}${c.unit ? ` ${c.unit}` : ''}`);
}

// Elapsed time as m:ss.
export function clock(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

// How a run ended, with no judgement on the result.
export function endText(end: BasicEnd | null, maxSeconds: number): string {
  switch (end) {
    case null:
      return 'Pin16 could not reach the module on the older protocol. Nothing was started.';
    case 'cancelled':
      return 'You finished the run. Pin16 ended the basic setting.';
    case 'time':
      return `Stopped at the longest run time, ${maxSeconds} seconds. Pin16 ended the basic setting.`;
    case 'closed':
      return 'The module closed the link.';
    case 'refused':
      return 'The module did not accept the start.';
    case 'failed':
      return 'The module stopped answering.';
    case 'wrongModule':
      return 'The module at this address is not the one meant. Nothing was started.';
  }
}

// True when the start itself failed, so no run happened.
export function didNotStart(end: BasicEnd | null): boolean {
  return end === null || end === 'refused' || end === 'wrongModule';
}

// The History entry for a finished attempt: a run that did not start says so
// with the reason and has no run time.
export function historyFor(title: string, end: BasicEnd | null, text: string, ranMs: number, last: string[]): { title: string; detail: string } {
  if (didNotStart(end)) return { title: `${title}: did not start`, detail: text };
  const ran = ranMs >= 2000 ? ` Ran ${clock(ranMs)}.` : '';
  return { title, detail: `${text}${ran}${last.length ? ` Last report: ${last.join(', ')}.` : ' The module reported nothing.'}` };
}
