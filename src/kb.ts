// Pin16 knowledge base: entries saved by earlier versions (fuse layouts,
// modifications, coding settings, procedures, notes) and what owners added, per make, model
// and platform. Kept on the phone for offline use and shared through the
// pin16 repo (kb/entries/<make>/<id>.json), so it reaches every install
// on its next start and can be folded into the app's own lists later.
import AsyncStorage from '@react-native-async-storage/async-storage';
import { isList, readJsonStrict } from './storageRead';
import { ALL_ITEMS, CodingItem, itemApplies } from './coding/items';
import { dedupeItems } from './coding/categories';
import { codingsFromCache } from './coding/offered';
import { FUSE_CARS } from './data/fuses';
import { githubReady, listFiles, readFile, writeFile } from './share/github';

export type KbKind = 'fuse' | 'modification' | 'setting' | 'sensor' | 'procedure' | 'module' | 'note';

export interface KbEntry {
  id: string;
  kind: KbKind;
  car: { make: string; model?: string; platform?: string; years?: string };
  title: string;
  body: string;
  // Structured data where it applies, e.g. a setting's module/byte/bit.
  data?: Record<string, unknown>;
  sources: { label: string; url: string }[];
  addedBy: 'ai' | 'owner';
  at: number;
}

export const KB_KIND_LABEL: Record<KbKind, string> = {
  fuse: 'Fuses',
  modification: 'Modifications',
  setting: 'Settings',
  sensor: 'Sensors',
  procedure: 'How-to',
  module: 'Modules',
  note: 'Notes',
};

const KEY = 'caristini.kb.v1';
const SHAS = 'caristini.kb.shas.v1';
let listeners: (() => void)[] = [];

// Only web links that start with https:// are opened from stored or synced data.
export function isHttps(u: unknown): u is string {
  return typeof u === 'string' && /^https:\/\//i.test(u.trim());
}

// An entry from the repo or from storage, checked and trimmed to the fields
// the screens use. Null when it is not usable.
export function cleanKbEntry(x: unknown): KbEntry | null {
  if (!x || typeof x !== 'object' || Array.isArray(x)) return null;
  const e = x as Record<string, unknown>;
  const text = (v: unknown, max: number): v is string => typeof v === 'string' && v.length > 0 && v.length <= max;
  if (!text(e.id, 160) || !text(e.title, 300) || !(typeof e.kind === 'string' && Object.hasOwn(KB_KIND_LABEL, e.kind))) return null;
  const car = e.car as Record<string, unknown> | null;
  if (!car || typeof car !== 'object' || !text(car.make, 80)) return null;
  const opt = (v: unknown, max: number) => (typeof v === 'string' && v.length <= max ? v : undefined);
  const sources = (Array.isArray(e.sources) ? e.sources : [])
    .filter((s): s is { label: unknown; url: string } => !!s && typeof s === 'object' && isHttps((s as { url?: unknown }).url))
    .slice(0, 20)
    .map((s) => ({ label: typeof s.label === 'string' ? s.label.slice(0, 200) : s.url, url: s.url.trim() }));
  return {
    id: e.id,
    kind: e.kind as KbKind,
    car: { make: car.make, model: opt(car.model, 80), platform: opt(car.platform, 80), years: opt(car.years, 40) },
    title: e.title,
    body: typeof e.body === 'string' ? e.body.slice(0, 20000) : '',
    data: e.data && typeof e.data === 'object' && !Array.isArray(e.data) ? (e.data as Record<string, unknown>) : undefined,
    sources,
    addedBy: e.addedBy === 'ai' ? 'ai' : 'owner',
    at: typeof e.at === 'number' ? e.at : 0,
  };
}

// Throws when the read fails, so a writer does not save over what is stored.
// A writer passes keepAside: entries that fail the check are copied to
// `<key>.damaged` first, because the list it writes back is the shorter one.
async function loadKbStrict(keepAside = false): Promise<KbEntry[]> {
  const list = await readJsonStrict<unknown[]>(KEY, () => [], isList);
  const kept: KbEntry[] = [];
  const rejected: unknown[] = [];
  for (const raw of list) {
    const e = cleanKbEntry(raw);
    if (e) kept.push(e);
    else rejected.push(raw);
  }
  if (keepAside && rejected.length) {
    let earlier: unknown[] = [];
    try {
      const old = await AsyncStorage.getItem(`${KEY}.damaged`);
      const parsed = old ? JSON.parse(old) : [];
      if (Array.isArray(parsed)) earlier = parsed;
    } catch {
      // an unreadable earlier copy is replaced
    }
    await AsyncStorage.setItem(`${KEY}.damaged`, JSON.stringify([...earlier, ...rejected].slice(-200))).catch(() => undefined);
  }
  return kept;
}

export async function loadKb(): Promise<KbEntry[]> {
  try {
    return await loadKbStrict();
  } catch {
    return [];
  }
}

async function storeKb(list: KbEntry[]): Promise<void> {
  try {
    await AsyncStorage.setItem(KEY, JSON.stringify(list));
  } catch {
    // storage unavailable
  }
  listeners.forEach((l) => l());
}

export function onKb(fn: () => void): () => void {
  listeners.push(fn);
  return () => {
    listeners = listeners.filter((l) => l !== fn);
  };
}

const slug = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 50);

// Saves an entry on the phone and, when the token is there, in the repo.
export async function saveKb(e: Omit<KbEntry, 'id' | 'at'>): Promise<{ entry: KbEntry; shared: boolean; error?: string }> {
  const entry: KbEntry = { ...e, id: `${slug(e.car.make)}-${slug(e.car.model ?? 'all')}-${e.kind}-${slug(e.title)}`, at: Date.now() };
  try {
    const list = await loadKbStrict(true);
    await storeKb([entry, ...list.filter((x) => x.id !== entry.id)]);
  } catch {
    // The stored entries could not be read: they are left as they are.
  }
  if (!(await githubReady())) return { entry, shared: false };
  try {
    await writeFile(`kb/entries/${slug(e.car.make)}/${entry.id}.json`, JSON.stringify(entry, null, 1), `Knowledge: ${entry.title} (${e.car.make} ${e.car.model ?? ''})`.trim());
    return { entry, shared: true };
  } catch (err) {
    return { entry, shared: false, error: err instanceof Error ? err.message : String(err) };
  }
}

// Pulls new and changed entries from the repo (by file sha, so unchanged files
// are not fetched again). Returns how many came in.
export async function syncKb(): Promise<number> {
  if (!(await githubReady())) return 0;
  const files = await listFiles('kb/entries/');
  let shas: Record<string, string> = {};
  try {
    shas = JSON.parse((await AsyncStorage.getItem(SHAS)) ?? '{}');
  } catch {
    shas = {};
  }
  let list: KbEntry[];
  try {
    list = await loadKbStrict(true);
  } catch {
    // The stored entries could not be read: try again next start.
    return 0;
  }
  let added = 0;
  for (const f of files) {
    if (!f.path.endsWith('.json') || shas[f.path] === f.sha) continue;
    const text = await readFile(f.path).catch(() => null);
    if (!text) continue;
    try {
      const e = cleanKbEntry(JSON.parse(text));
      if (!e) continue;
      const i = list.findIndex((x) => x.id === e.id);
      if (i >= 0) list[i] = e;
      else list.unshift(e);
      shas[f.path] = f.sha;
      added++;
    } catch {
      // skip a broken file
    }
  }
  if (added) await storeKb(list);
  try {
    await AsyncStorage.setItem(SHAS, JSON.stringify(shas));
  } catch {
    // ignore
  }
  return added;
}

const norm = (s?: string | null) => (s ?? '').toLowerCase().replace(/[^a-z0-9]/g, '');

// Entries that fit a car: same make, and model or platform matching or unset.
export function kbForCar(list: KbEntry[], v: { brand: string; model: string; platform: string | null }): KbEntry[] {
  return list.filter((e) => {
    if (norm(e.car.make) !== norm(v.brand) && !(norm(e.car.make) === 'vag' && /audi|vw|volkswagen|seat|skoda|cupra/i.test(v.brand))) return false;
    if (e.car.model && norm(v.model) && !norm(v.model).includes(norm(e.car.model)) && !norm(e.car.model).includes(norm(v.model))) {
      return !!e.car.platform && norm(e.car.platform) === norm(v.platform);
    }
    return true;
  });
}

// Settings saved in the knowledge base with a module/byte/bit. Unconfirmed:
// Customise shows them as read-only notes and never offers them as switches.
export function kbSettings(list: KbEntry[]): CodingItem[] {
  return list
    .filter((e) => e.kind === 'setting' && e.data && typeof e.data.module === 'string' && typeof e.data.byte === 'number' && Array.isArray(e.data.bits))
    .map((e) => ({
      id: `kb-${e.id}`,
      title: e.title.slice(0, 60),
      summary: e.body.slice(0, 200),
      category: 'Comfort' as CodingItem['category'],
      platforms: e.car.platform ? [e.car.platform] : [],
      module: e.data!.module as string,
      byte: e.data!.byte as number,
      bits: (e.data!.bits as number[]).filter((b) => b >= 0 && b <= 7),
      confidence: 'low' as const,
      note: 'From Research notes. Not confirmed on a car, so not offered as a switch.',
      sources: e.sources,
    }));
}

// Search across the knowledge base and the app's own lists.
export function searchEverything(list: KbEntry[], v: { brand: string; model: string; platform: string | null; vin?: string; year?: number | null; codingCache?: Record<string, string>; modulePart?: (moduleId: string) => string }, query: string, kind?: KbKind): string[] {
  const q = query.toLowerCase().split(/\s+/).filter(Boolean);
  const hit = (s: string) => q.every((w) => s.toLowerCase().includes(w));
  const out: string[] = [];
  for (const e of kbForCar(list, v)) {
    if (kind && e.kind !== kind) continue;
    if (!q.length || hit(`${e.title} ${e.body} ${e.kind}`)) out.push(`[knowledge base, ${KB_KIND_LABEL[e.kind]}] ${e.title}: ${e.body.slice(0, 400)}${e.sources[0] ? ` (source: ${e.sources[0].url})` : ''}`);
  }
  if (!kind || kind === 'setting') {
    // Held items are never listed. Where the car's coding for a module is known, only
    // the settings that fit it are listed, after the same dedupe Customise uses.
    const codings = codingsFromCache(v.codingCache);
    for (const i of dedupeItems(ALL_ITEMS.filter((x) => !x.held && (!v.platform || x.platforms.includes(v.platform))))) {
      const c = codings[i.module];
      if (c && !itemApplies(i, c, { style: c.length === 3 ? 'short' : 'long', part: v.modulePart?.(i.module) })) continue;
      if (!q.length || hit(`${i.title} ${i.summary} ${i.category}`)) out.push(`[built-in setting ${i.id}] ${i.title}: ${i.summary} (module ${i.module}, byte ${i.byte}, bit ${i.bits.join('+')}, ${i.confidence})`);
    }
  }
  if (!kind || kind === 'fuse') {
    for (const car of FUSE_CARS) {
      if (norm(car.brand) !== norm(v.brand)) continue;
      for (const box of car.boxes) {
        for (const f of box.fuses) {
          const line = `${box.name} (${box.location}) fuse ${f.id}: ${f.fn}${f.amps ? ` (${f.amps.join('/')} A)` : ''}`;
          if (q.length && hit(line)) out.push(`[built-in fuses, ${car.title}] ${line}`);
        }
      }
    }
  }
  return out.slice(0, 60);
}
