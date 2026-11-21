// VW KWP2000 adaptation, basic settings and fault detail over an open TP2.0
// session. Every byte below is from the Listen recordings of a working tool on
// a 2007 SEAT Leon, 21 Nov 2026 (replica/leon-listen-2026-11-21.md and
// replica/findings/cupra-listen-2026-11-21/2026-11-21T12-38-24.dec).
import { ObdError } from './elm';
import { describeKwp, MeasuringCell, parseKwpIdent, parseMeasuringBlock, Tp20Session, tp20Identity } from './tp20';
import { LinkLost } from './transport';

// A request whose failure (other than a lost adapter) is not fatal.
async function soft(s: Tp20Session, payload: number[], waitMs?: number): Promise<number[] | null> {
  try {
    return await s.request(payload, waitMs);
  } catch (e) {
    if (e instanceof LinkLost) throw e;
    return null;
  }
}

// ---- Adaptation

export interface Adaptation {
  channel: number;
  value: number;
  raw: number[];
}

// 32 B8 01 03 (answered 72 B8 01 03 62): sent on every exit path.
async function leaveAdaptation(s: Tp20Session): Promise<void> {
  await soft(s, [0x32, 0xb8, 0x01, 0x03]);
}

type Selected = { ok: true } | { ok: false; reason: string; missing: boolean };

// 31 B8 01 03, 31 BA 01 03, then 31 B9 01 03 <channel>. A module without the
// channel answers 7F 31 31.
async function enterAndSelect(s: Tp20Session, channel: number): Promise<Selected> {
  const a = await s.request([0x31, 0xb8, 0x01, 0x03]);
  if (a[0] !== 0x71) return { ok: false, reason: describeKwp(a), missing: false };
  const b = await s.request([0x31, 0xba, 0x01, 0x03]);
  if (b[0] !== 0x71) return { ok: false, reason: describeKwp(b), missing: false };
  const c = await s.request([0x31, 0xb9, 0x01, 0x03, channel & 0xff]);
  if (c[0] === 0x71) return { ok: true };
  return { ok: false, reason: describeKwp(c), missing: c[0] === 0x7f && c[2] === 0x31 };
}

// 71 BA 01 03 82 03 <hi> <lo> ... FF
export function parseAdaptationAnswer(r: number[]): number | null {
  if (r.length < 8 || r[0] !== 0x71 || r[1] !== 0xba || r[2] !== 0x01 || r[3] !== 0x03 || r[4] !== 0x82) return null;
  return (r[6] << 8) | r[7];
}

async function readSelected(s: Tp20Session, channel: number): Promise<Adaptation> {
  const r = await s.request([0x31, 0xba, 0x01, 0x03]);
  const value = parseAdaptationAnswer(r);
  if (value == null) throw new ObdError(describeKwp(r));
  return { channel, value, raw: r };
}

// Reads one adaptation channel. Null when the module has no such channel.
export async function kwpReadAdaptation(s: Tp20Session, channel: number): Promise<Adaptation | null> {
  try {
    const sel = await enterAndSelect(s, channel);
    if (!sel.ok) {
      if (sel.missing) return null;
      throw new ObdError(sel.reason);
    }
    return await readSelected(s, channel);
  } finally {
    await leaveAdaptation(s);
  }
}

export interface AdaptationSave {
  // True only when the module answered the save with 71 BB.
  accepted: boolean;
  ok: boolean;
  before: number | null;
  after: number | null;
  reason?: string;
}

// The workshop code is bytes 21 to 26 of the 1A 9B answer, counting the 9B as
// 0 (the slice tp20ReadCoding uses for wsc).
export function workshopCodeFrom(id: number[] | null): number[] | null {
  if (!id || id[0] !== 0x5a || id[1] !== 0x9b || id.length < 28) return null;
  return id.slice(22, 28);
}

// Says why the module that answered is not the one meant, or null when it
// is, or when nothing is known to check against (same rule as coding writes:
// no pattern or no identity text means no check).
export function identityProblem(who: string, expect: RegExp | undefined, name: string): string | null {
  if (!expect || !who || expect.test(who)) return null;
  return `The module at this address says it is "${who}", not ${name}. Nothing was changed.`;
}

const refused = (reason: string): AdaptationSave => ({ accepted: false, ok: false, before: null, after: null, reason });

// Saves one adaptation value (the oil service reset is channel 2 on the
// cluster, value 0). The save goes out once only: a repeat could be taken as
// a second change. reopen: how to open the channel again when the module hung
// up after the save (the read-back needs a channel). expect and moduleName:
// the identity the module must give before anything is written. A value that
// is not a whole number from 0 to 65535 is refused before anything is sent.
export async function kwpSaveAdaptation(
  s: Tp20Session,
  channel: number,
  value: number,
  opts: { reopen?: () => Promise<boolean>; expect?: RegExp; moduleName?: string } = {},
): Promise<AdaptationSave> {
  if (!Number.isInteger(value) || value < 0 || value > 0xffff) return refused(`${value} is not a whole number from 0 to 65535. Nothing was sent.`);
  if (!Number.isInteger(channel) || channel < 0 || channel > 0xff) return refused(`${channel} is not an adaptation channel from 0 to 255. Nothing was sent.`);
  const wanted = value;
  const hi = (wanted >> 8) & 0xff;
  const lo = wanted & 0xff;
  const ident = await soft(s, [0x1a, 0x9b]);
  const wsc = workshopCodeFrom(ident);
  if (!wsc) return refused('The module did not give its workshop code. Nothing was changed.');
  const parsed = parseKwpIdent(ident ?? []);
  const who = parsed ? [parsed.partNumber, parsed.component].filter(Boolean).join(' ') : '';
  const wrong = identityProblem(who, opts.expect, opts.moduleName ?? 'the module meant');
  if (wrong) return refused(wrong);
  await soft(s, [0x10, 0x89]);
  let before: number | null = null;
  let reason: string | undefined;
  let accepted = false;
  try {
    const sel = await enterAndSelect(s, channel);
    if (!sel.ok) {
      reason = sel.missing ? `The module has no adaptation channel ${channel}.` : sel.reason;
    } else {
      before = (await readSelected(s, channel)).value;
      const test = await s.request([0x31, 0xb9, 0x01, 0x03, hi, lo]);
      if (test[0] !== 0x71) reason = describeKwp(test);
      else {
        await s.request([0x31, 0xba, 0x01, 0x03]);
        const save = await s.request([0x31, 0xbb, 0x01, 0x03, hi, lo, ...wsc], 12000, true);
        if (save[0] !== 0x71) reason = describeKwp(save);
        else accepted = save[1] === 0xbb;
      }
    }
  } catch (e) {
    if (e instanceof LinkLost) throw e;
    reason = e instanceof Error ? e.message : String(e);
  } finally {
    await leaveAdaptation(s);
  }
  // Read back, also after a refusal or a lost answer: the module may have kept the value.
  let after: number | null = null;
  try {
    let canRead = true;
    if (s.closed && opts.reopen) {
      await new Promise((r) => setTimeout(r, 1000));
      canRead = await opts.reopen();
      if (!canRead && !reason) reason = 'The module did not answer again, so the value could not be read back.';
    }
    if (canRead) after = (await kwpReadAdaptation(s, channel))?.value ?? null;
  } catch (e) {
    if (e instanceof LinkLost) throw e;
    if (!reason) reason = e instanceof Error ? e.message : String(e);
  }
  if (!reason && after !== wanted) reason = `The module reads back ${after == null ? 'nothing' : after} instead of ${wanted}.`;
  return { accepted, ok: accepted && !reason && after === wanted, before, after, ...(reason ? { reason } : {}) };
}

// ---- Basic setting

export type BasicEnd = 'cancelled' | 'time' | 'closed' | 'refused' | 'failed' | 'wrongModule';

export interface BasicOptions {
  // Cells, or the text of a formula 5F cell.
  onUpdate: (value: MeasuringCell[] | string, raw: number[]) => void;
  cancelled: () => boolean;
  maxMs: number;
  pollMs?: number;
  // The identity the module must give before anything is started. No pattern,
  // no check.
  expect?: RegExp;
}

// The data after the answer's first byte: cells of 3 bytes (formula, a, b),
// except formula 5F, which is text: 5F <length> <text>. Text wins when present.
export function parseBasicData(data: number[]): MeasuringCell[] | string {
  const cells: MeasuringCell[] = [];
  const texts: string[] = [];
  let i = 1;
  while (i < data.length) {
    if (data[i] === 0x5f) {
      const len = data[i + 1] ?? 0;
      texts.push(String.fromCharCode(...data.slice(i + 2, i + 2 + len)));
      i += 2 + len;
      continue;
    }
    if (i + 2 >= data.length) break;
    cells.push(...(parseMeasuringBlock([0x61, 0x00, ...data.slice(i, i + 3)], 0x00) ?? []));
    i += 3;
  }
  return texts.length ? texts.join(' ').trim() : cells;
}

// Starts a basic setting group, polls its state about every pollMs (1.2 s in
// the recordings) and always ends it with 32 B8 00 <group>.
export async function kwpRunBasicSetting(s: Tp20Session, group: number, o: BasicOptions): Promise<BasicEnd> {
  const g = group & 0xff;
  const pollMs = o.pollMs ?? 1200;
  const start = Date.now();
  // Before anything is sent that starts or ends a group.
  if (o.expect && identityProblem(await tp20Identity(s), o.expect, 'the module meant')) return 'wrongModule';
  try {
    for (const step of [0xb8, 0xb9]) {
      const r = await s.request([0x31, step, 0x00, g]);
      if (r[0] !== 0x71) return 'refused';
    }
    let failed = 0;
    for (;;) {
      if (o.cancelled()) return 'cancelled';
      if (Date.now() - start >= o.maxMs) return 'time';
      if (s.closed) return 'closed';
      const t = Date.now();
      try {
        const r = await s.request([0x31, 0xba, 0x00, g]);
        if (r[0] === 0x71 && r[1] === 0xba && r[3] === g && r.length > 4) {
          failed = 0;
          o.onUpdate(parseBasicData(r.slice(4)), r);
        } else if (++failed >= 3) return 'failed';
      } catch (e) {
        if (e instanceof LinkLost) throw e;
        if (s.closed) return 'closed';
        if (++failed >= 3) return 'failed';
      }
      const wait = Math.min(pollMs - (Date.now() - t), o.maxMs - (Date.now() - start));
      if (wait > 0 && !o.cancelled()) {
        try {
          await s.idle(wait);
        } catch (e) {
          if (e instanceof LinkLost) throw e;
          if (s.closed) return 'closed';
          if (++failed >= 3) return 'failed';
        }
      }
    }
  } finally {
    // The group is ended whatever happened (a closed channel fails at once).
    await soft(s, [0x32, 0xb8, 0x00, g]);
  }
}

// ---- Fault detail

export interface FaultDetail {
  status: number;
  priority: number;
  frequency: number;
  resetCounter: number;
  km: number;
  raw: number[];
}

// 12 00 04 <dtc hi> <dtc lo> -> 52 00 6C 01 <status> <priority> <frequency>
// <reset counter> <mileage 3 bytes, km> ... The bytes after the mileage are
// not decoded. 7F 12 11 (not supported) gives 'unsupported'.
export async function kwpReadFaultDetail(s: Tp20Session, code: string): Promise<FaultDetail | 'unsupported'> {
  if (!/^\d{5}$/.test(code) || Number(code) > 0xffff) throw new ObdError(`${code} is not a 5-digit fault number.`);
  const dtc = Number(code);
  const r = await s.request([0x12, 0x00, 0x04, dtc >> 8, dtc & 0xff]);
  if (r[0] === 0x7f && r[2] === 0x11) return 'unsupported';
  if (r[0] !== 0x52 || r.length < 11) throw new ObdError(describeKwp(r));
  return { status: r[4], priority: r[5], frequency: r[6], resetCounter: r[7], km: (r[8] << 16) | (r[9] << 8) | r[10], raw: r };
}
