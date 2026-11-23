// Live data recording: the CSV text and the per-value summary, kept out of
// the screen so they can be tested and so the summary is worked out once.
import { toUserUnits } from '../settings';
import type { LivePid } from '../obd/pids';

export type Reading = { t: number; pid: number; v: number };

// Same cap as the data logger (src/logger/format.ts).
export const MAX_REC_ROWS = 180_000;

// One row per reading time, one column per value, in the owner's units.
export function toCsv(rows: Reading[], pids: LivePid[], s: Parameters<typeof toUserUnits>[2]): string {
  const byPid = new Map<number, LivePid>();
  for (const p of pids) if (!byPid.has(p.pid)) byPid.set(p.pid, p);
  const used = [...new Set(rows.map((r) => r.pid))];
  const label = (pid: number) => {
    const p = byPid.get(pid);
    return p ? `${p.label} (${toUserUnits(0, p.unit, s).unit})` : `PID ${pid}`;
  };
  const lines = [['Time (s)', ...used.map(label)].join(',')];
  const last: Record<number, string> = {};
  for (const r of rows) {
    const p = byPid.get(r.pid);
    last[r.pid] = p ? toUserUnits(r.v, p.unit, s).value.toFixed(p.decimals) : String(r.v);
    lines.push([(r.t / 1000).toFixed(2), ...used.map((u) => last[u] ?? '')].join(','));
  }
  return lines.join('\n');
}

export interface PidStats {
  pid: number;
  min: number;
  max: number;
  avg: number;
}

// Lowest, highest and average per value, in the order values first appear.
// One pass and no spreads, so a long recording cannot overflow the stack.
export function summarise(rows: Reading[]): PidStats[] {
  const acc = new Map<number, { min: number; max: number; sum: number; n: number }>();
  for (const r of rows) {
    const a = acc.get(r.pid);
    if (!a) acc.set(r.pid, { min: r.v, max: r.v, sum: r.v, n: 1 });
    else {
      if (r.v < a.min) a.min = r.v;
      if (r.v > a.max) a.max = r.v;
      a.sum += r.v;
      a.n++;
    }
  }
  return [...acc].map(([pid, a]) => ({ pid, min: a.min, max: a.max, avg: a.sum / a.n }));
}
