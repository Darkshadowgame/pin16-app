// A rolling log of what Pin16 sends to the adapter and what comes back,
// kept in memory for troubleshooting. With "Send the log automatically" on, new
// lines go to the owner's private findings store after each check or scan.

export interface LogEntry {
  t: number;
  dir: '>' | '<' | '!';
  text: string;
}

// What an upload hides. The owner's own copy of the log (text) is unchanged.
// A VIN keeps its last 8 characters; a UK registration plate becomes [plate].
const VIN_RE = /(?<![A-Za-z0-9])[A-HJ-NPR-Za-hj-npr-z0-9]{17}(?![A-Za-z0-9])/g;
const PLATE_RES = [/\b[A-Z]{2}\d{2} ?[A-Z]{3}\b/g, /\b[A-Z]\d{1,3} ?[A-Z]{3}\b/g, /\b[A-Z]{3} ?\d{1,3}[A-Z]\b/g];
export function maskPrivate(text: string): string {
  let out = text;
  for (const re of PLATE_RES) out = out.replace(re, '[plate]');
  return out.replace(VIN_RE, (v) => '*'.repeat(9) + v.slice(-8));
}

const MAX = 4000;
// Trim in blocks so the array is not copied on every line.
const SLACK = 500;
let entries: LogEntry[] = [];
let enabled = true;
// Entries already sent to the findings repo (src/share/sendLog.ts).
let sent = 0;

// Readers see at most the last MAX entries.
const first = () => Math.max(0, entries.length - MAX);

export const trafficLog = {
  setEnabled(on: boolean) {
    enabled = on;
  },
  add(dir: LogEntry['dir'], text: string) {
    if (!enabled) return;
    entries.push({ t: Date.now(), dir, text: text.replace(/\r/g, ' ').replace(/>$/, '').trim() });
    if (entries.length > MAX + SLACK) {
      const drop = entries.length - MAX;
      sent = Math.max(0, sent - drop);
      entries.splice(0, drop);
    }
  },
  count: () => entries.length - first(),
  clear() {
    entries = [];
    sent = 0;
  },
  unsentCount: () => entries.length - Math.max(sent, first()),
  // The lines not sent yet, with real clock times so separate sends line up.
  unsentText(header: string): string {
    return maskPrivate([header, ...entries.slice(Math.max(sent, first())).map((e) => `${new Date(e.t).toISOString().slice(11, 23)} ${e.dir} ${e.text}`)].join('\n'));
  },
  markSent() {
    sent = entries.length;
  },
  // Plain text, one line per entry, times in seconds from the first entry.
  text(header: string): string {
    const shown = entries.slice(first());
    const t0 = shown[0]?.t ?? Date.now();
    return [header, ...shown.map((e) => `${((e.t - t0) / 1000).toFixed(3)} ${e.dir} ${e.text}`)].join('\n');
  },
};
