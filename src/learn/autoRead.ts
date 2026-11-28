// Auto read: after the app connects to a car it reads every module by itself.
// A car never learnt gets Learn my car (src/learn/runLearn.ts); a known car
// gets a quick refresh of each module's details, coding and adjustable values.
// Read-only: nothing here sends a write, a fault clear or a reset, and nothing
// here holds the screen awake (the owner's own jobs do that, and auto read
// steps aside for them). No React in this file; the hook is useAutoRead.tsx.
import { adaptationKey, adaptationsFor, valueHex } from '../coding/adaptations';
import { recordCodings } from '../coding/historyStore';
import { codingItemsFor } from '../coding/items';
import { heldTags } from '../keepAwake';
import { engineLast } from '../obd/elm';
import type { ElmClient, ModuleDef, ModuleDetails } from '../obd/elm';
import { LinkLost } from '../obd/transport';
import { toHex } from '../obd/uds';
import type { Settings } from '../settings';
import { mergeCodingBackup, mergeModuleIds } from '../vehicle/ids';
import type { Vehicle } from '../vehicle/garage';
import { LEARN_ORDER, runLearn, silentToSkip } from './runLearn';
import type { LearnDeps, LearnSummary } from './runLearn';

// What the job is known as in the keep-awake registry. Auto read never takes
// this tag itself (taking one prompts for location and marks the reader busy);
// the name only says which tag is ignored when checking for other jobs.
export const AUTO_READ_TAG = 'auto-read';
// A car read this recently (in this session) is not read again.
export const COOLDOWN_MS = 10 * 60 * 1000;
// Retries of a Learn that stepped aside for the owner, per connection.
export const LEARN_RETRIES = 2;

export type AutoReadPlan = 'learn' | 'refresh' | 'skip';

// Learn when the car was never fully learnt, refresh when it was, skip when
// the setting is off, the car is not known or the adapter cannot reach modules.
export function planAutoRead(vehicle: Pick<Vehicle, 'learnFullAt'> | null | undefined, settings: Pick<Settings, 'autoRead'>, supportsModules = true): AutoReadPlan {
  if (!vehicle || settings.autoRead === false || !supportsModules) return 'skip';
  return vehicle.learnFullAt ? 'refresh' : 'learn';
}

// "Reading modules, 4 of 12".
export function autoReadLabel(done: number, total: number): string {
  if (total <= 0) return 'Reading modules';
  return `Reading modules, ${Math.max(0, Math.min(done, total))} of ${total}`;
}

// ---- Progress, for the Car tab

export interface AutoReadProgress {
  vin: string;
  done: number;
  total: number;
  label: string;
}

let progress: AutoReadProgress | null = null;
let listeners: (() => void)[] = [];

export const getAutoReadProgress = (): AutoReadProgress | null => progress;

export function setAutoReadProgress(next: AutoReadProgress | null): void {
  progress = next;
  listeners.forEach((l) => l());
}

export function onAutoReadProgress(fn: () => void): () => void {
  listeners.push(fn);
  return () => {
    listeners = listeners.filter((l) => l !== fn);
  };
}

// ---- Guards

const claimed = new WeakSet<object>();
// Once per connection: the client is a new object for each connection.
export function claimClient(client: object): boolean {
  if (claimed.has(client)) return false;
  claimed.add(client);
  return true;
}

const lastRun = new Map<string, number>();
// Once per COOLDOWN_MS per car, in memory only.
export function claimCooldown(vin: string, now = Date.now()): boolean {
  const at = lastRun.get(vin);
  if (at != null && now - at < COOLDOWN_MS) return false;
  lastRun.set(vin, now);
  return true;
}

// For tests.
export function resetAutoRead(): void {
  lastRun.clear();
  setAutoReadProgress(null);
}

// ---- Stepping aside

export interface BusyClient {
  moduleBusy: boolean;
  queuedJobs: number;
  waitingJobs: number;
}

// True when something else is using the adapter: any keep-awake tag held
// except auto read's own, a module conversation running or queued on the
// client, or (not while learning) the adapter pointing at a module. While
// Learn my car runs, its own conversations are in flight between checks, so
// only jobs waiting behind them count.
export function isBusy(client: BusyClient, opts: { learning?: boolean; tags?: () => string[] } = {}): boolean {
  if ((opts.tags ?? heldTags)().some((t) => t !== AUTO_READ_TAG)) return true;
  if (opts.learning) return client.waitingJobs > 0;
  return client.queuedJobs > 0 || client.moduleBusy;
}

const realSleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

// When the health check after connecting is on, it starts a moment after
// connect: wait until it has been seen and has ended (or never starts).
export async function waitForHealthCheck(o: { cancelled: () => boolean; sleep?: (ms: number) => Promise<void>; tags?: () => string[]; appearMs?: number; tag?: string }): Promise<void> {
  const sleep = o.sleep ?? realSleep;
  const tag = o.tag ?? 'health-check';
  const tags = o.tags ?? heldTags;
  let waited = 0;
  while (!o.cancelled() && !tags().includes(tag) && waited < (o.appearMs ?? 10000)) {
    await sleep(500);
    waited += 500;
  }
  while (!o.cancelled() && tags().includes(tag)) await sleep(1000);
}

// ---- Refresh of a known car

export type AutoReadGarage = {
  latest(vin: string): Vehicle | undefined;
  update(vin: string, patch: Partial<Vehicle>, opts?: { durable?: boolean }): Promise<unknown>;
};

export type AutoReadClient = Pick<
  ElmClient,
  'sessionValues' | 'supportsModules' | 'moduleById' | 'modulesForCar' | 'readModuleDetails' | 'readCoding' | 'readAdaptation' | 'routeOf'
>;

export interface AutoReadDeps {
  client: AutoReadClient;
  vin: string;
  garage: AutoReadGarage;
  // True while something else is using the adapter (see isBusy).
  busy: () => boolean;
  cancelled: () => boolean;
  sleep?: (ms: number) => Promise<void>;
  onProgress?: (done: number, total: number) => void;
  // Wait between checks while busy (2 s).
  pollMs?: number;
}

export interface AutoReadResult {
  total: number;
  // Modules saved.
  read: number;
  // Modules that gave no answer, or whose result was thrown away.
  skipped: number;
  stopped: boolean;
  lost: boolean;
}

const HEX = /^([0-9A-F]{2})+$/;
const fromHex = (h: string) => h.match(/../g)!.map((x) => parseInt(x, 16));
const sameDef = (a: ModuleDef, b: ModuleDef) => a.id === b.id || (!!a.tx && a.tx === b.tx && a.rx === b.rx);

// The modules to read: what Pin16 knows is fitted (seen, found by the deep
// search, saved ids, modules with coding items or adjustable values), then,
// on a VW group car, whatever the gateway lists; engine and gearbox last.
export async function autoReadTargets(client: Pick<AutoReadClient, 'moduleById' | 'modulesForCar'>, v: Vehicle): Promise<ModuleDef[]> {
  const ids = new Set<string>([
    ...(v.modulesSeen ?? []),
    ...(v.deepFound ?? []).map((d) => d.moduleId),
    ...(v.ids?.modules ?? []).map((m) => m.id),
    ...codingItemsFor(v.group, v.platform).map((i) => i.module),
    ...adaptationsFor(v.group, v.platform).map((a) => a.module),
  ]);
  const out: ModuleDef[] = [];
  const add = (d: ModuleDef | undefined) => {
    if (d && !out.some((o) => sameDef(o, d))) out.push(d);
  };
  for (const id of ids) add(client.moduleById(id));
  if (v.group === 'vag') {
    const silent = new Set(silentToSkip(v, { full: false, why: 'repeat' }).modules);
    const listed = await client.modulesForCar(v.group).catch(() => [] as ModuleDef[]);
    for (const d of listed) if (!silent.has(d.id)) add(d);
  }
  return engineLast(out);
}

export async function runAutoRead(d: AutoReadDeps): Promise<AutoReadResult> {
  const { client, vin, garage } = d;
  const sleep = d.sleep ?? realSleep;
  const result: AutoReadResult = { total: 0, read: 0, skipped: 0, stopped: false, lost: false };
  const v0 = garage.latest(vin);
  if (!v0 || !client.supportsModules) return result;
  const waitIdle = async () => {
    while (!d.cancelled() && d.busy()) await sleep(d.pollMs ?? 2000);
  };
  await waitIdle();
  if (d.cancelled()) {
    result.stopped = true;
    return result;
  }
  const targets = await autoReadTargets(client, v0);
  result.total = targets.length;
  d.onProgress?.(0, targets.length);
  const rowsOf = (id: string) => adaptationsFor(v0.group, v0.platform).filter((a) => a.module === id);

  for (const [i, def] of targets.entries()) {
    // Before each module: step aside for anything else using the adapter.
    await waitIdle();
    if (d.cancelled()) {
      result.stopped = true;
      break;
    }
    try {
      const saved = await readOne(def);
      if (saved) result.read++;
      else result.skipped++;
    } catch (e) {
      // A lost adapter ends the run; any other failure skips the module, silently.
      if (e instanceof LinkLost) {
        result.lost = true;
        break;
      }
      result.skipped++;
    }
    d.onProgress?.(i + 1, targets.length);
  }
  return result;

  // One module: details, coding, adjustable values, then one save.
  async function readOne(def: ModuleDef): Promise<boolean> {
    const key = def.id;
    const sessionBefore = client.sessionValues.get(key);
    const cacheBefore = garage.latest(vin)?.codingCache ?? {};
    const m: ModuleDetails | null = await client.readModuleDetails(def).catch((e) => {
      if (e instanceof LinkLost) throw e;
      return null;
    });
    if (!m?.responded) return false;
    const older = m.route === 'tp20' || client.routeOf(def) === 'tp20';
    // Coding: not again when this connection already holds it, except for an
    // older (TP2.0) module, whose coding is read each time.
    let bytes: number[] | null = null;
    if (older || !client.sessionValues.has(key)) {
      if (!older && m.coding && HEX.test(m.coding)) bytes = fromHex(m.coding);
      else {
        await waitIdle();
        if (d.cancelled()) return false;
        bytes = await client.readCoding(def).catch((e) => {
          if (e instanceof LinkLost) throw e;
          return null;
        });
      }
    }
    // Adjustable values the app lists for this module (older VW cars).
    const adapt: Record<string, number> = {};
    for (const a of rowsOf(def.id)) {
      await waitIdle();
      if (d.cancelled()) return false;
      const r = await client.readAdaptation(def, a.channel);
      if (r) adapt[adaptationKey(a)] = r.value;
    }
    // The Customise screen wrote or re-read this module meanwhile: its value is newer.
    if (client.sessionValues.get(key) !== sessionBefore) return false;
    const now = garage.latest(vin);
    if (!now) return false;
    for (const k of Object.keys(adapt)) if ((now.codingCache ?? {})[k] !== cacheBefore[k]) delete adapt[k];
    const hex = bytes && bytes.length ? toHex(bytes) : null;
    // An older (TP2.0) coding is not kept in the saved codings, as Learn my car does not keep it: Customise re-reads it live.
    const cache: Record<string, string> = { ...(hex && !older ? { [key]: hex } : {}), ...Object.fromEntries(Object.entries(adapt).map(([k, val]) => [k, valueHex(val)])) };
    // Saved the way Learn my car saves a module: identity merged into the ids,
    // coding merged into the backup, built on the newest saved copy.
    const idCoding = m.coding ?? hex;
    const backup = mergeCodingBackup(now.codingBackup, [{ module: def.name, part: m.partNumber ?? null, coding: idCoding }]);
    await garage.update(vin, {
      ids: { ...(now.ids ?? {}), modules: mergeModuleIds(now.ids?.modules, [{ ...m, coding: idCoding }]) },
      ...(backup ? { codingBackup: backup } : {}),
      ...(Object.keys(cache).length ? { codingCache: { ...(garage.latest(vin)?.codingCache ?? now.codingCache ?? {}), ...cache } } : {}),
    });
    if (hex && HEX.test(hex)) {
      void recordCodings(vin, [{ key, hex, source: 'read' }]);
      if (!client.sessionValues.has(key) && bytes) client.sessionValues.set(key, bytes);
    }
    return true;
  }
}

// ---- Learn for a car never learnt

export interface AutoLearnDeps extends Omit<LearnDeps, 'cancelled' | 'onStep' | 'onProgress'> {
  // Auto read's own check: true while something else is using the adapter.
  busy: () => boolean;
  cancelled: () => boolean;
  sleep?: (ms: number) => Promise<void>;
  pollMs?: number;
  // "Learning this car, step 2 of 8".
  onLabel?: (label: string) => void;
}

export const learnLabel = (step: number) => `Learning this car, step ${step} of ${LEARN_ORDER.length}`;

// Learn my car, stopped when the owner starts something else. After such a
// stop it waits for the adapter to be free and goes again (what was found is
// saved, so the next run carries on), at most LEARN_RETRIES times.
export async function runAutoLearn(d: AutoLearnDeps): Promise<LearnSummary | null> {
  const sleep = d.sleep ?? realSleep;
  let last: LearnSummary | null = null;
  for (let attempt = 0; attempt <= LEARN_RETRIES; attempt++) {
    while (!d.cancelled() && d.busy()) await sleep(d.pollMs ?? 2000);
    if (d.cancelled()) break;
    let aside = false;
    last = await runLearn({
      ...d,
      cancelled: () => {
        if (d.cancelled()) return true;
        if (d.busy()) {
          aside = true;
          return true;
        }
        return false;
      },
      onStep: (s, o) => {
        if (o === 'running') d.onLabel?.(learnLabel(LEARN_ORDER.indexOf(s) + 1));
      },
    });
    if (!last.stopped || !aside || d.cancelled() || last.aborted) break;
  }
  return last;
}
