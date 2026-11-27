import { router, useLocalSearchParams } from 'expo-router';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Linking, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { PinMark } from '../../brand/PinMark';
import { LinkLost } from '../../obd/transport';
import { AdaptationItem, adaptationKey, adaptationResultText, adaptationsFor, formatAdaptation, inRange, isAdaptationKey, isWideRow, itemForKey, typedValueCheck, valueFromHex, valueHex } from '../../coding/adaptations';
import { CodingItem, codingItemsFor, FitContext, isOn, itemApplies, placeLabel, stateText, whyNotOffered, withItem } from '../../coding/items';
import { offeredSettings } from '../../coding/offered';
import { dedupeItems, groupByCategory, isUnconfirmed, SETTING_CATEGORIES, SettingCategory, settingCategory } from '../../coding/categories';
import { fromHex, LearnedSetting, learnedIsOn, learnedKeys, learnedModules, splitKey, withLearned } from '../../coding/learn';
import { modulePart, settingKey, sharedLearned } from '../../coding/shared';
import { addDiary, SETTING_CHANGED, today } from '../../diary';
import { addHistory } from '../../history';
import { kbForCar, kbSettings, loadKb } from '../../kb';
import { adaptRestoreMessage } from '../../coding/restoreLink';
import { categoriesFor, modsForVehicle, STATUS_LABEL } from '../../mods/catalogue';
import { MODULES } from '../../obd/modules';
import { preflightCheck } from '../../coding/preflight';
import { toHex } from '../../obd/uds';
import { cacheAfterWrite, stamp } from '../../diag/timeline';
import { CodingHistory } from '../../coding/history';
import { loadCodingHistory, onCodingHistory, recordCodings } from '../../coding/historyStore';
import { useConnection } from '../../state';
import { space, type, useTheme } from '../../theme';
import { TOOLS, announce, announceResult, liveRegion, Button, Chips, ConfirmSheet, Field, GlowCard, Group, Icon, ListRow, NeedsConnection, Notice, Pill, Screen, SearchField, SheetPage, success, Toggle, tool } from '../../ui';
import { SettingRow } from '../../components/SettingRow';
import { TryResult, useGarage, vehicleTitle } from '../../vehicle/garage';
import { SECTIONS } from '../../help';
import { sendLogNow } from '../../share/sendLog';

const CATEGORY_ICON: Record<string, React.ComponentProps<typeof Icon>['name']> = {
  'Most popular': 'star-outline',
  'Instrument cluster': 'gauge',
  Warnings: 'bell-alert-outline',
  Mirrors: 'mirror-rectangle',
  Locking: 'lock-outline',
  'Locking and alarm': 'lock-outline',
  'Windows and sunroof': 'car-door',
  Lights: 'car-light-high',
};


// A switch writes at once (kinds item and learned go straight to run). Only
// Forget and Put back ask first, through the confirm sheet.
type Pending =
  | { kind: 'item'; item: CodingItem; on: boolean }
  | { kind: 'learned'; setting: LearnedSetting; on: boolean }
  | { kind: 'forget'; setting: LearnedSetting }
  | { kind: 'restore'; module: string; top?: boolean }
  | { kind: 'adaptRestore'; key: string }
  | null;

// Shown beside the spinner while a change is written to the car.
const WRITING = 'Writing. Keep this page open.';
// The filter chip for settings that differ from the original.
const CHANGED = 'changed';
// One setting in the list: a switch (coding), an adjustable value, or a learned switch.
type Entry =
  | { kind: 'item'; id: string; title: string; cat: SettingCategory; changed: boolean; item: CodingItem }
  | { kind: 'adapt'; id: string; title: string; cat: SettingCategory; changed: boolean; a: AdaptationItem }
  | { kind: 'learned'; id: string; title: string; cat: SettingCategory; changed: boolean; s: LearnedSetting; borrowed: boolean };
// Where the result of a put back from Put back original shows: beside it.
const RESTORE_MSG = 'restore';
const ORIGINAL_NOT_SAVED = 'Pin16 could not save the original on this phone, so nothing was changed in the car. Free some space on the phone, then try again.';

export default function Customise() {
  const t = useTheme();
  const conn = useConnection();
  const garage = useGarage();
  const v = conn.vehicle;
  const client = conn.client;
  // Put back from the change timeline: the module to restore, when it has a backup.
  const params = useLocalSearchParams<{ restore?: string }>();
  const wantRestore = params.restore && !isAdaptationKey(params.restore) && v?.codingOriginal?.[params.restore] ? params.restore : null;
  // A put back of an adjustable value from the change timeline.
  const wantAdaptRestore = params.restore && isAdaptationKey(params.restore) && v?.codingOriginal?.[params.restore] ? params.restore : null;
  // Settings saved in the shared knowledge base, loaded once. They are not
  // confirmed on a car, so they show as read-only notes, never as switches.
  const [kbItems, setKbItems] = useState<CodingItem[]>([]);
  useEffect(() => {
    if (!v) return;
    // Only settings saved for this make and this exact platform.
    const plat = (v.platform ?? '').toLowerCase();
    loadKb().then((l) => setKbItems(kbSettings(kbForCar(l, v)).filter((i) => !!plat && i.platforms.some((x) => x.toLowerCase() === plat))));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [v?.vin, v?.platform]);
  // Sourced settings for this platform.
  const items = v
    ? dedupeItems(codingItemsFor(v.group, v.platform))
    : [];
  // Knowledge base notes not already a sourced setting.
  const kbNotes = kbItems.filter((n) => !items.some((i) => i.module === n.module && i.byte === n.byte && i.bits.join() === n.bits.join()));
  const learned = v?.learned ?? [];
  // Settings learned on the owner's other cars that have the same module.
  const borrowed = v ? sharedLearned(v, garage.vehicles) : [];
  // Keys are module ids (long coding) or "moduleId:DID" (learned adaptation values).
  const moduleIds = [...new Set([...items.map((i) => i.module), ...learned.flatMap(learnedKeys), ...borrowed.flatMap(learnedKeys), ...(wantRestore ? [wantRestore] : [])])];
  const defOf = (key: string) => {
    const id = splitKey(key).module;
    return MODULES.find((m) => m.id === id) ?? client?.moduleById(id);
  };
  // Opens on the last coding read (instant); each module's switches unlock
  // once that module has been read again, so nothing is written from old data.
  const [codings, setCodings] = useState<Record<string, number[] | null>>(() =>
    Object.fromEntries(
      Object.entries(v?.codingCache ?? {})
        .filter(([, hex]) => /^([0-9A-F]{2})+$/i.test(hex))
        .map(([k, hex]) => [k, hex.match(/../g)!.map((h) => parseInt(h, 16))]),
    ),
  );
  // Modules written during this visit: a background read must not put their old bytes back.
  const written = useRef(new Set<string>());
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const [reading, setReading] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [pending, setPending] = useState<Pending>(null);
  // Filter chip in view (null: all, CHANGED, or a category), the search words,
  // the panel opened from the top (put back original or coding history), the
  // adjustable value whose picker is open, and the setting whose details are open.
  const [cat, setCat] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [panel, setPanel] = useState<'backups' | 'history' | null>(() => (wantRestore || wantAdaptRestore ? 'backups' : null));
  const [pickKey, setPickKey] = useState<string | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  // The setting whose Technical details (source notes, byte, bits) are open.
  const [techId, setTechId] = useState<string | null>(null);
  const [message, setMessage] = useState<{ tone: 'ok' | 'danger'; text: string; id?: string } | null>(null);
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);
  // A switch writes at once, so its result is the only feedback: say it aloud.
  // A result shown in a Notice at the top is spoken by the Notice itself.
  useEffect(() => {
    if (message?.id && message.text) announceResult(message.text);
  }, [message]);
  useEffect(() => {
    if (busy) announce(WRITING);
  }, [busy]);
  // Coding history of this car (read-only here; Workshop puts one back).
  const [codingHist, setCodingHist] = useState<CodingHistory>({});
  const histVin = v?.vin;
  useEffect(() => {
    if (!histVin) return undefined;
    const load = () => void loadCodingHistory(histVin).then((h) => alive.current && setCodingHist(h));
    load();
    return onCodingHistory(load);
  }, [histVin]);

  // Adjustable values (PQ35): current value per key, null when the module has
  // no such channel. Read one module at a time once the settings are read.
  const adaptItems = adaptationsFor(v?.group, v?.platform);
  const [adaptValues, setAdaptValues] = useState<Record<string, number | null>>({});
  const [adaptReading, setAdaptReading] = useState<string | null>(null);
  const [adaptDone, setAdaptDone] = useState(false);
  const [adaptBusy, setAdaptBusy] = useState<string | null>(null);
  const [adaptMsg, setAdaptMsg] = useState<Record<string, { ok: boolean; text: string }>>({});
  const [adaptOpen, setAdaptOpen] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const adaptRunning = useRef(false);
  const readAdaptRef = useRef<(() => Promise<void>) | undefined>(undefined);
  const changeAdaptRef = useRef<((a: AdaptationItem, wanted: number, o?: { putBack?: boolean; top?: boolean }) => Promise<void>) | undefined>(undefined);
  const restoredAdapt = useRef<string | null>(null);

  // force: read every module again (Read again). Otherwise a module read
  // earlier on this connection is used as it is.
  const read = useCallback(async (force = false) => {
    if (!client || !client.supportsModules) return;
    setReading(true);
    setChecked(new Set());
    written.current.clear();
    const out: Record<string, number[] | null> = {};
    const done = new Set<string>();
    for (const id of moduleIds) {
      const def = defOf(id);
      const { did } = splitKey(id);
      const kept = force ? undefined : client.sessionValues.get(id);
      if (kept) out[id] = kept;
      else if (!def) out[id] = null;
      else if (did) {
        const r = await client.readRawDid(def, did);
        out[id] = 'data' in r ? r.data : null;
      } else out[id] = await client.readCoding(def);
      if (!alive.current) return;
      // A value written during this read is newer than what was read: keep it.
      if (out[id] && !written.current.has(id)) client.sessionValues.set(id, out[id]!);
      done.add(id);
      if (!written.current.has(id)) setCodings((old) => ({ ...old, [id]: out[id] }));
      setChecked(new Set(done));
    }
    setReading(false);
    void readAdaptRef.current?.();
    if (v) {
      const cache = Object.fromEntries(Object.entries(out).filter(([k, c]) => !!c && c.length > 0 && !written.current.has(k)).map(([k, c]) => [k, toHex(c!)]));
      // Built on the newest saved copy, not the one this read started with: a
      // switch flipped while other modules were still being read has saved its
      // new coding since, and the old copy would put the old bytes back.
      garage.update(v.vin, { codingCache: { ...(garage.latest(v.vin)?.codingCache ?? {}), ...cache } });
      // One entry per coding that differs from the newest kept (src/coding/history.ts).
      void recordCodings(v.vin, Object.entries(cache).filter(([k]) => !k.includes(':')).map(([key, hex]) => ({ key, hex, source: 'read' as const })));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [client, moduleIds.join()]);

  useEffect(() => {
    if (moduleIds.length) read();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [read]);

  // Nothing else to read first: read the adjustable values on their own.
  useEffect(() => {
    if (!moduleIds.length && client?.supportsModules) void readAdaptRef.current?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [client, v?.vin, v?.platform]);

  // Put back an adjustable value from the change timeline, once it has been read.
  useEffect(() => {
    if (!v || !wantAdaptRestore || !adaptDone || restoredAdapt.current === wantAdaptRestore) return;
    restoredAdapt.current = wantAdaptRestore;
    const a = itemForKey(wantAdaptRestore);
    const orig = v.codingOriginal?.[wantAdaptRestore];
    if (!a || !orig) return;
    // A link never writes to the car. It opens the same confirm sheet as the
    // coding put back, and the owner taps Put back to write.
    const now = adaptValues[wantAdaptRestore];
    if (now == null || now === valueFromHex(orig)) setMessage(adaptRestoreMessage(a.title, now, valueFromHex(orig)));
    else setPending({ kind: 'adaptRestore', key: wantAdaptRestore });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wantAdaptRestore, adaptDone]);

  // Put back from the change timeline: once the module has been read, the
  // usual restore confirmation opens (or a note when it is original already).
  const restoreAsked = useRef<string | null>(null);
  useEffect(() => {
    if (!wantRestore || reading || !checked.has(wantRestore) || restoreAsked.current === wantRestore) return;
    restoreAsked.current = wantRestore;
    const now = codings[wantRestore];
    const name = defOf(wantRestore)?.name ?? wantRestore;
    if (!now) setMessage({ tone: 'danger', text: `${name} did not answer, so its coding could not be read. Check the ignition is on, then tap Read settings again.` });
    else if (toHex(now) === v?.codingOriginal?.[wantRestore]) setMessage({ tone: 'ok', text: `${name} already has its original coding. Nothing to put back.` });
    else setPending({ kind: 'restore', module: wantRestore, top: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wantRestore, reading, checked]);

  if (!v) {
    return (
      <Screen>
        <NeedsConnection title="Connect your car to change its settings" />
      </Screen>
    );
  }

  const originals = v.codingOriginal ?? {};
  const adaptRestoreLine = (key: string) => {
    const a = itemForKey(key);
    const o = originals[key];
    return a && o ? `Puts ${a.title} back to ${formatAdaptation(a, valueFromHex(o))}, the value it had before Pin16 first changed it.` : 'Puts the value back to what it was before Pin16 first changed it.';
  };
  // What the shared fit rule needs to know about a module (src/coding/items.ts).
  const fitOf = (moduleId: string): FitContext => {
    const def = defOf(moduleId);
    return { style: def ? client?.codingStyle(def) : undefined, part: modulePart(v, moduleId) };
  };
  // The settings this car is offered, from the same function the Car tab counts with.
  const tried = v.tried ?? {};
  const offered = offeredSettings({ group: v.group, platform: v.platform, codings, ctxOf: fitOf, adaptValues, learned, borrowed, tried });
  const available = offered.items;
  // Only a module that gave no coding leaves its settings unreachable; a setting that
  // does not fit the coding the module gave is not listed.
  const unreachable = items.filter((i) => !reading && checked.has(i.module) && !codings[i.module]);
  const restorable = moduleIds.filter((id) => originals[id] && codings[id] && toHex(codings[id]!) !== originals[id]);

  // Checks every change must pass before Pin16 writes anything.
  const preflight = () => preflightCheck(client);
  const mark = (id: string, r: TryResult) => garage.update(v.vin, { tried: { ...(garage.latest(v.vin)?.tried ?? {}), [id]: r } });

  const run = async (p: Exclude<Pending, null>) => {
    setPending(null);
    if (!client) return;
    if (p.kind === 'adaptRestore') {
      const a = itemForKey(p.key);
      const orig = v.codingOriginal?.[p.key];
      if (a && orig) void changeAdaptRef.current?.(a, valueFromHex(orig), { putBack: true });
      return;
    }
    // The result shows under the switch that was used; a put back shows beside
    // Put back original, or at the top when it was opened from the change timeline.
    let runId = p.kind === 'item' ? p.item.id : p.kind === 'restore' ? (p.top ? undefined : RESTORE_MSG) : p.setting.id;
    if (p.kind === 'forget') {
      await garage.update(v.vin, { learned: learned.filter((s) => s.id !== p.setting.id) });
      return;
    }
    const ids = p.kind === 'item' ? [p.item.module] : p.kind === 'learned' ? learnedKeys(p.setting) : [p.module];
    if (ids.some((id) => !codings[id])) return;
    // The write itself checks the setting fits the coding read from the car, even if a screen offered it.
    if (p.kind === 'item') {
      const why = whyNotOffered(p.item, codings[p.item.module], fitOf(p.item.module));
      if (why) {
        if (alive.current) setMessage({ id: runId, tone: 'danger', text: `${p.item.title} was not changed. ${why} Nothing was written to the car.` });
        return;
      }
    }
    setBusy(p.kind === 'item' ? p.item.id : p.kind === 'learned' ? p.setting.id : p.top ? `restore-top-${p.module}` : `restore-${p.module}`);
    setMessage(null);
    try {
      // The saved car must be the connected car.
      const wrong = await conn.verifyCar();
      if (wrong) {
        if (alive.current) setMessage({ id: runId, tone: 'danger', text: wrong });
        return;
      }
      // Read for the result line only: nothing stops or delays the write.
      const check = await preflight();
      const lowBattery = check.note ? ` ${check.note}` : '';
      // The first coding ever seen for each module is kept as the original.
      const saved = garage.latest(v.vin)?.codingOriginal ?? {};
      const fresh = ids.filter((id) => !saved[id]);
      const backups = { ...saved, ...Object.fromEntries(fresh.map((id) => [id, toHex(codings[id]!)])) };
      // Nothing is written to the car unless the original coding is kept on the phone.
      if (fresh.length && !(await garage.update(v.vin, { codingOriginal: backups }, { durable: true }))) {
        if (alive.current) setMessage({ id: runId, tone: 'danger', text: ORIGINAL_NOT_SAVED });
        return;
      }
      const what =
        p.kind === 'item'
          ? `${p.item.title} ${p.on ? 'on' : 'off'}`
          : p.kind === 'learned'
            ? `${p.setting.title} ${p.on ? 'on' : 'off'}`
            : `${defOf(p.module)?.name} original ${splitKey(p.module).did ? 'setting' : 'coding'} put back`;
      const notes: string[] = [];
      const done: { key: string; before: number[]; after: number[] }[] = [];
      const settingId = p.kind === 'item' ? p.item.id : p.kind === 'learned' ? p.setting.id : null;
      // Set when a module did not keep the change: the text to show.
      let failed: string | null = null;
      for (const moduleId of ids) {
        const def = defOf(moduleId)!;
        const { did } = splitKey(moduleId);
        const before = codings[moduleId]!;
        // The coding the write starts from, then (below) what the module holds after it.
        if (!did) void recordCodings(v.vin, [{ key: moduleId, hex: toHex(before), source: 'read' }]);
        const after =
          p.kind === 'item'
            ? withItem(p.item, before, p.on)
            : p.kind === 'learned'
              ? withLearned(p.setting, moduleId, before, p.on)
              : (originals[moduleId] ?? toHex(before)).match(/../g)!.map((h) => parseInt(h, 16));
        // A put back must be the same length as what the module holds now.
        if (p.kind === 'restore' && after.length !== before.length) {
          failed = `${def.name} now holds ${before.length} bytes, and the original is ${after.length} bytes, so it was not put back. Nothing was written to the car.`;
          break;
        }
        const login = p.kind === 'learned' ? p.setting.login : p.kind === 'item' ? p.item.login : undefined;
        let res: Awaited<ReturnType<typeof client.writeCoding>>;
        try {
          res = did ? await client.writeDid(def, did, before, after, login) : await client.writeCoding(def, before, after, login);
        } catch (e) {
          // A write that broke off (the link dropped, say): what the modules
          // before it took is still recorded below.
          failed = `${def.name}: ${e instanceof Error ? e.message : String(e)}${notes.length ? ' Modules changed before it keep the new setting; switch it off again to undo them.' : ''} Tap Read settings again to see what the car holds now.`;
          break;
        }
        // The write has returned, so the car may hold a new value. Everything
        // kept about it (the values for this connection, the saved coding,
        // History and the diary) is written whether or not this page is still
        // open. Only the page's own state is skipped once it has closed.
        if (res.coding) {
          written.current.add(moduleId);
          client.sessionValues.set(moduleId, res.coding);
          if (alive.current) setCodings((old) => ({ ...old, [moduleId]: res.coding }));
          // The saved coding follows each write, so Put back decides from what the module holds now.
          await garage.update(v.vin, { codingCache: cacheAfterWrite(garage.latest(v.vin)?.codingCache, [{ key: moduleId, hex: toHex(res.coding) }]) }, { durable: true });
          if (!did) void recordCodings(v.vin, [{ key: moduleId, hex: toHex(res.coding), source: res.ok ? 'written' : 'read' }]);
        }
        if (!res.ok) {
          if (settingId && p.kind !== 'restore' && p.on) await mark(settingId, 'refused');
          // The module holds something other than before: that is a change too.
          if (res.coding && toHex(res.coding) !== toHex(before)) done.push({ key: moduleId, before, after: res.coding });
          failed = res.restored
            ? `${def.name} did not keep the change, so Pin16 put its original coding back.${notes.length ? ' Modules changed before it keep the new setting; switch it off again to undo them.' : ' Nothing has changed.'}${lowBattery}`
            : `${def.name} did not keep the change, and Pin16 could not confirm the original is back. With the ignition on, tap Put back original in Customise.${lowBattery}`;
          break;
        }
        notes.push(`${def.name} ${did ? `value ${did}` : 'coding'} ${toHex(before)} to ${toHex(after)}`);
        done.push({ key: moduleId, before, after });
      }
      // Nothing in the car changed: no record to keep.
      if (failed && !done.length) {
        if (alive.current) setMessage({ id: runId, tone: 'danger', text: failed });
        return;
      }
      if (!failed && alive.current) success();
      await addDiary({
        vin: v.vin,
        vehicleName: vehicleTitle(v),
        date: today(),
        kind: SETTING_CHANGED,
        mileage: null,
        notes: failed ? `Part changed: ${what}. ${notes.join('; ') || 'A module did not keep the change'}. Check it in Customise.` : p.kind === 'restore' ? `${what}.` : `Changed: ${what}. Put it back in Customise, with Put back original.`,
      });
      // One line per module for the change timeline, with the backup each came from.
      const setting = p.kind === 'item' ? p.item.title : p.kind === 'learned' ? p.setting.title : 'Put back original';
      const value = p.kind === 'restore' ? undefined : { from: p.on ? 'Off' : 'On', to: p.on ? 'On' : 'Off' };
      await addHistory({
        vin: v.vin,
        kind: 'change',
        title: `${what.charAt(0).toUpperCase() + what.slice(1)}${failed ? ' (part done)' : ''}`,
        detail: done.map((d) => defOf(d.key)?.name).join(', '),
        before: done.map((d) => toHex(d.before)).join(' '),
        after: done.map((d) => toHex(d.after)).join(' '),
        odometerKm: v.odometerKm,
        changes: done.map((d) => ({ module: defOf(d.key)?.name ?? d.key, key: d.key, setting, ...value, before: toHex(d.before), after: toHex(d.after), backup: backups[d.key], source: 'Customise' })),
      });
      if (failed) {
        if (alive.current) setMessage({ id: runId, tone: 'danger', text: `${failed} Saved to History and your diary.` });
        return;
      }
      // A setting from another of your cars that this car's module kept joins
      // this car's own learned list (it then shows under Learned from your car).
      if (p.kind === 'learned' && p.on) {
        const from = borrowed.find((s) => s.id === p.setting.id);
        const now = garage.latest(v.vin)?.learned ?? [];
        if (from && !now.some((s) => settingKey(s) === settingKey(from))) {
          const own: LearnedSetting = { id: `learned-${Date.now()}`, title: from.title, learnedAt: new Date().toISOString(), parts: from.parts, ...(from.login ? { login: from.login } : {}) };
          await garage.update(v.vin, { learned: [...now, own] });
          runId = own.id;
        }
      }
      // No question after a change: the switch itself puts it back.
      if (alive.current) setMessage({ id: runId, tone: 'ok', text: `${what}. Switch the ignition off and on to see it. Saved to History and your diary.` });
    } catch (e) {
      if (alive.current) setMessage({ id: runId, tone: 'danger', text: e instanceof Error ? e.message : String(e) });
    } finally {
      // What the module answered goes to the findings store, so a change that
      // did not take can be looked at afterwards.
      void sendLogNow('Customise change', v);
      if (alive.current) setBusy(null);
    }
  };

  // Reads each listed channel, one module at a time. A channel the module does
  // not have is left out. The first value ever read is kept as the original.
  readAdaptRef.current = async () => {
    if (!client || !adaptItems.length || adaptRunning.current) return;
    adaptRunning.current = true;
    const out: Record<string, number | null> = {};
    let lost = false;
    try {
      for (const m of [...new Set(adaptItems.map((a) => a.module))]) {
        if (lost) break;
        const def = client.moduleById(m);
        if (!def) continue;
        for (const a of adaptItems.filter((x) => x.module === m)) {
          if (!alive.current || lost) break;
          setAdaptReading(m);
          const key = adaptationKey(a);
          let r: Awaited<ReturnType<typeof client.readAdaptation>> = null;
          try {
            r = await client.readAdaptation(def, a.channel);
          } catch (e) {
            // A lost adapter ends the reads: nothing more can be asked of it.
            if (e instanceof LinkLost) {
              lost = true;
              break;
            }
          }
          out[key] = r ? r.value : null;
          if (alive.current) setAdaptValues((old) => ({ ...old, [key]: out[key] }));
        }
      }
      const saved = garage.latest(v.vin)?.codingOriginal ?? {};
      const fresh = Object.entries(out).filter(([k, val]) => val != null && !saved[k]);
      if (fresh.length) await garage.update(v.vin, { codingOriginal: { ...saved, ...Object.fromEntries(fresh.map(([k, val]) => [k, valueHex(val!)])) } });
      // The values read are kept with the codings, so the Car tab counts the same rows as this list.
      // A channel the module did not have is dropped.
      if (!lost && Object.keys(out).length) {
        const kept = { ...(garage.latest(v.vin)?.codingCache ?? {}) };
        for (const [k, val] of Object.entries(out)) {
          if (val == null) delete kept[k];
          else kept[k] = valueHex(val);
        }
        await garage.update(v.vin, { codingCache: kept });
      }
    } finally {
      adaptRunning.current = false;
      if (alive.current) {
        setAdaptReading(null);
        setAdaptDone(true);
      }
    }
  };

  // Saves one adjustable value at once: reads it back, says under the row
  // whether it took, and records History and the diary.
  changeAdaptRef.current = async (a, wanted, o = {}) => {
    const key = adaptationKey(a);
    const def = client?.moduleById(a.module);
    const current = adaptValues[key];
    if (!client || !def || current == null || wanted === current || adaptBusy) return;
    setAdaptBusy(key);
    setAdaptMsg((m) => ({ ...m, [key]: { ok: true, text: '' } }));
    const show = (ok: boolean, text: string) => {
      if (!alive.current) return;
      if (o.top) setMessage({ tone: ok ? 'ok' : 'danger', text });
      else {
        setAdaptMsg((m) => ({ ...m, [key]: { ok, text } }));
        announceResult(text);
      }
    };
    try {
      const wrong = await conn.verifyCar();
      if (wrong) {
        show(false, wrong);
        return;
      }
      // Nothing is written to the car unless the original value is kept on the phone.
      const had = garage.latest(v.vin)?.codingOriginal ?? {};
      if (!had[key] && !(await garage.update(v.vin, { codingOriginal: { ...had, [key]: valueHex(current) } }, { durable: true }))) {
        show(false, ORIGINAL_NOT_SAVED);
        return;
      }
      const check = await preflight();
      const res = await client.saveAdaptation(def, a.channel, wanted);
      const result = adaptationResultText(a, wanted, res);
      const before = res?.before ?? current;
      const after = res?.after ?? null;
      // The first value ever read stays as the original.
      const saved = garage.latest(v.vin)?.codingOriginal ?? {};
      const original = saved[key] ?? valueHex(before);
      if (!saved[key]) await garage.update(v.vin, { codingOriginal: { ...saved, [key]: original } });
      if (after != null && alive.current) setAdaptValues((old) => ({ ...old, [key]: after }));
      const moved = after != null && after !== before;
      if (result.ok || moved) {
        const nowValue = after ?? wanted;
        await garage.update(v.vin, { codingCache: cacheAfterWrite(garage.latest(v.vin)?.codingCache, [{ key, hex: valueHex(nowValue) }]) }, { durable: true });
        const what = o.putBack ? `${a.title} original ${formatAdaptation(a, valueFromHex(original))} put back` : `${a.title} ${formatAdaptation(a, before)} to ${formatAdaptation(a, nowValue)}`;
        await addDiary({
          vin: v.vin,
          vehicleName: vehicleTitle(v),
          date: today(),
          kind: SETTING_CHANGED,
          mileage: null,
          notes: result.ok ? (o.putBack ? `${what}.` : `Changed: ${what}. Put it back in Customise, under ${a.title}.`) : `Part changed: ${what}. The module did not confirm the value. Check it in Customise.`,
        });
        await addHistory({
          vin: v.vin,
          kind: 'change',
          title: `${what.charAt(0).toUpperCase()}${what.slice(1)}${result.ok ? '' : ' (not confirmed)'}`,
          detail: def.name,
          before: valueHex(before),
          after: valueHex(nowValue),
          odometerKm: v.odometerKm,
          changes: [{ module: def.name, key, setting: a.title, from: formatAdaptation(a, before), to: formatAdaptation(a, nowValue), before: valueHex(before), after: valueHex(nowValue), backup: original, source: 'Customise' }],
        });
      }
      if (result.ok && alive.current) success();
      show(result.ok, `${result.text}${result.ok ? ' Saved to History and your diary.' : check.note ? ` ${check.note}` : ''}`);
    } catch (e) {
      show(false, e instanceof Error ? e.message : String(e));
    } finally {
      void sendLogNow('Customise change', v);
      if (alive.current) setAdaptBusy(null);
    }
  };
  const adaptLocked = !!busy || !!adaptBusy || !!adaptReading;
  const adaptModules = [...new Set(offered.adapts.map((a) => a.module))];

  const mods = modsForVehicle(v.group, v.platform);
  const cats = categoriesFor(mods);
  // Modules with settings (a module with adaptation values counts once).
  const modulesWithSettings = new Set(moduleIds.map((k) => splitKey(k).module)).size;
  const checkedModules = new Set([...checked].map((k) => splitKey(k).module).filter((m) => moduleIds.every((k) => splitKey(k).module !== m || checked.has(k)))).size;
  const learnedReadyList = offered.learned;
  const borrowedFit = offered.borrowed;

  // Which cars have built-in switches, said plainly on a car that has none.
  const noSwitches =
    v.group !== 'vag'
      ? `Pin16 has built-in switches for VW group cars only (VW, Audi, SEAT, Skoda and Cupra). Your ${v.brand || 'car'} has none yet.${client?.supportsModules ? ' You can still teach Pin16 a setting: change it once in Carista and Pin16 learns what changed.' : ''}${mods.length ? ' The guides below show what can be changed and how.' : ''}`
      : !v.platform
        ? `Pin16 has built-in switches for VW group cars whose model it knows, and it does not know this car’s model yet. Set the model under Your cars, or run Learn my car.${client?.supportsModules ? ' You can still teach Pin16 a setting from Carista.' : ''}`
        : `Pin16 has no built-in switches for the ${v.model || v.brand} yet.${client?.supportsModules ? ' You can still teach Pin16 a setting: change it once in Carista and Pin16 learns what changed.' : ''}`;
  // Ways to add a setting. First on the page for a car with no built-in switches.
  const moreGroup = (
    <Group
      header="Get more settings"
      help={SECTIONS.customiseMore}
      footer="A switch appears only where a source, or your own car, shows which coding bit does what."
    >
      {client?.supportsModules ? (
        <ListRow first {...tool('learnSetting')} title="Learn a setting" subtitle="Change a setting in Carista; Pin16 learns what changed" onPress={() => router.push('/customise/learn')} />
      ) : null}
      <ListRow first={!client?.supportsModules} {...tool('learn')} title="Learn my car" subtitle="Finds every module and reads its part number and coding" onPress={() => router.push('/learn-car')} />
      <ListRow icon="refresh" iconColour={TOOLS.customise.colour} title="Read settings again" subtitle="Settings are kept while connected; this reads them fresh" disabled={reading} onPress={() => read(true)} />
    </Group>
  );

  // ---- The list: every setting this car has, one row each, under its category ----
  const q = query.trim().toLowerCase();
  // The coding each module had before Pin16 first changed it, to see what differs now.
  const origValues: Record<string, number[] | null> = Object.fromEntries(Object.keys(originals).filter((k) => !isAdaptationKey(k)).map((k) => [k, fromHex(originals[k])]));
  const entries: Entry[] = [
    ...available.map(
      (i): Entry => ({ kind: 'item', id: i.id, title: i.title, cat: settingCategory(i), changed: !!origValues[i.module] && itemApplies(i, origValues[i.module], fitOf(i.module)) && isOn(i, origValues[i.module]!) !== isOn(i, codings[i.module]!), item: i }),
    ),
    ...offered.adapts.map((a): Entry => {
      const o = originals[adaptationKey(a)];
      return { kind: 'adapt', id: adaptationKey(a), title: a.title, cat: settingCategory(a), changed: !!o && valueFromHex(o) !== adaptValues[adaptationKey(a)], a };
    }),
    ...learnedReadyList.map((s): Entry => ({ kind: 'learned', id: s.id, title: s.title, cat: settingCategory(s), changed: learnedKeys(s).every((k) => origValues[k]) && learnedIsOn(s, origValues) !== learnedIsOn(s, codings), s, borrowed: false })),
    ...borrowedFit.map((s): Entry => ({ kind: 'learned', id: s.id, title: s.title, cat: settingCategory(s), changed: false, s, borrowed: true })),
  ];
  const changedCount = entries.filter((e) => e.changed).length;
  const visible = entries.filter((e) => (!q || e.title.toLowerCase().includes(q)) && (cat === null || (cat === CHANGED ? e.changed : e.cat === cat)));
  const sections = groupByCategory(visible, (e) => e.cat);
  const showExtras = !cat && !q;
  const anyUnconfirmed = visible.some((e) => e.kind === 'item' && isUnconfirmed(e.item));

  const tagRow = (pills: React.ReactNode[]) => (pills.some(Boolean) ? <View style={styles.tags}>{pills}</View> : null);
  const messageLine = (id: string) => (message?.id === id ? <Text accessibilityLiveRegion={liveRegion} style={[type.small, { color: message.tone === 'ok' ? t.ok : t.danger, marginTop: 4 }]}>{message.text}</Text> : null);
  const writingLine = (on: boolean) => (on ? <Text style={[type.small, { color: t.muted, marginTop: 4 }]}>{WRITING}</Text> : null);
  const spinner = <ActivityIndicator color={t.accentText} accessibilityLabel="Writing" />;

  const renderItem = (i: CodingItem, first: boolean) => {
    const on = isOn(i, codings[i.module]!);
    const working = busy === i.id;
    const open = openId === i.id;
    return (
      <SettingRow
        key={i.id}
        first={first}
        title={i.title}
        value={on ? 'On' : 'Off'}
        hint={stateText(i, on)}
        expanded={open}
        onTitlePress={() => setOpenId(open ? null : i.id)}
        tags={tagRow([isUnconfirmed(i) ? <Pill key="u" text="Unconfirmed" /> : null, i.confidence === 'medium' ? <Pill key="m" text="Reported by owners" /> : null, tried[i.id] ? <TriedPill key="t" r={tried[i.id]} /> : null])}
        control={working ? spinner : <Toggle value={on} disabled={!!busy || !checked.has(i.module)} label={i.title} onChange={(next) => run({ kind: 'item', item: i, on: next })} />}
      >
        {open ? (
          <>
            <Text style={[type.sub, { color: t.muted, marginTop: 2 }]}>{stateText(i, on)}</Text>
            <Pressable accessibilityRole="button" accessibilityState={{ expanded: techId === i.id }} hitSlop={6} onPress={() => setTechId(techId === i.id ? null : i.id)} style={styles.link}>
              <Text style={[type.small, { color: t.accentText }]}>{techId === i.id ? 'Hide technical' : 'Technical'}</Text>
            </Pressable>
            {techId === i.id ? (
              <>
                {i.note ? <Text style={[type.small, { color: t.muted }]}>{i.note}</Text> : null}
                <Text style={[type.small, { color: t.muted, marginTop: 4 }]}>
                  {defOf(i.module)?.name ?? i.module}, {placeLabel(i)}
                  {i.length && codings[i.module] && codings[i.module]!.length !== i.length ? `. The source car’s coding is ${i.length} bytes; yours is ${codings[i.module]!.length}, so check the result in the car.` : ''}
                </Text>
                <Pressable accessibilityRole={i.sources[0].url ? 'link' : 'text'} disabled={!i.sources[0].url} hitSlop={6} onPress={() => i.sources[0].url && Linking.openURL(i.sources[0].url)} style={styles.link}>
                  <Text style={[type.small, { color: i.sources[0].url ? t.accentText : t.muted }]}>Source: {i.sources[0].label}</Text>
                </Pressable>
              </>
            ) : null}
          </>
        ) : null}
        {messageLine(i.id)}
        {writingLine(working)}
      </SettingRow>
    );
  };

  const renderLearned = (s: LearnedSetting, borrowedFrom: boolean, first: boolean) => {
    const on = learnedIsOn(s, codings);
    const working = busy === s.id;
    const open = openId === s.id;
    const where = learnedModules(s)
      .map((id) => defOf(id)?.name ?? id)
      .join(', ');
    const from = borrowed.find((x) => x.id === s.id);
    return (
      <SettingRow
        key={s.id}
        first={first}
        title={s.title}
        value={on ? 'On' : 'Off'}
        hint={where}
        expanded={open}
        onTitlePress={() => setOpenId(open ? null : s.id)}
        tags={tagRow([borrowedFrom && !tried[s.id] ? <Pill key="b" text="Try it" tone="accent" /> : null, tried[s.id] ? <TriedPill key="t" r={tried[s.id]} /> : null, !borrowedFrom ? <Pill key="l" text="Learned on this car" /> : null])}
        control={working ? spinner : <Toggle value={on} disabled={!!busy || learnedKeys(s).some((k) => !checked.has(k))} label={s.title} onChange={(next) => run({ kind: 'learned', setting: s, on: next })} />}
      >
        {open ? (
          <>
            <Text style={[type.sub, { color: t.muted, marginTop: 2 }]}>
              {where}
              {borrowedFrom && from ? ` · from your ${from.from}${from.tier === 2 ? ' (same part, another revision)' : ''}` : ''}
            </Text>
            {!borrowedFrom ? (
              <Pressable accessibilityRole="button" hitSlop={6} disabled={!!busy} onPress={() => setPending({ kind: 'forget', setting: s })} style={styles.link}>
                <Text style={[type.small, { color: t.accentText }]}>Forget</Text>
              </Pressable>
            ) : null}
          </>
        ) : null}
        {messageLine(s.id)}
        {writingLine(working)}
      </SettingRow>
    );
  };

  // The detail lines of an adjustable value: what it does, where it lives, its source, and the way back.
  const adaptDetails = (a: AdaptationItem, cur: number) => {
    const key = adaptationKey(a);
    const orig = v.codingOriginal?.[key];
    const origValue = orig ? valueFromHex(orig) : null;
    return (
      <>
        <Text style={[type.sub, { color: t.muted }]}>{a.summary}</Text>
        <Text style={[type.small, { color: t.muted, marginTop: 4 }]}>
          {defOf(a.module)?.name ?? a.module}, adaptation channel {a.channel}. {a.choices ? '' : `${a.min} to ${a.max}${a.unit ? ` ${a.unit}` : ''}, steps of ${a.step}.`}
        </Text>
        {a.needs ? <Text style={[type.small, { color: t.muted, marginTop: 4 }]}>{a.needs}</Text> : null}
        <Pressable accessibilityRole="link" hitSlop={6} onPress={() => Linking.openURL(a.sources[0].url)} style={styles.link}>
          <Text style={[type.small, { color: t.accentText }]}>Source: {a.sources[0].label}</Text>
        </Pressable>
        {origValue != null && origValue !== cur ? (
          <Pressable
            accessibilityRole="button"
            hitSlop={6}
            disabled={adaptLocked}
            onPress={() => {
              setPickKey(null);
              void changeAdaptRef.current?.(a, origValue, { putBack: true });
            }}
            style={styles.link}
          >
            <Text style={[type.small, { color: t.accentText }]}>Put back original ({formatAdaptation(a, origValue)})</Text>
          </Pressable>
        ) : null}
      </>
    );
  };

  const renderAdapt = (a: AdaptationItem, first: boolean) => {
    const key = adaptationKey(a);
    const cur = adaptValues[key] as number;
    const working = adaptBusy === key;
    const msg = adaptMsg[key];
    const open = adaptOpen === key;
    // On and Off only: a switch, like any 2-state setting. Everything else opens a picker.
    const twoState = !!a.choices && a.choices.length === 2 && a.choices[0].value === 0 && a.choices[0].label === 'Off' && a.choices[1].value === 1 && a.choices[1].label === 'On';
    const tags = tagRow([inRange(a, cur) ? null : <Pill key="r" text="Outside the usual range" />]);
    const lines = (
      <>
        {open && twoState ? adaptDetails(a, cur) : null}
        {working ? <Text style={[type.small, { color: t.muted, marginTop: 4 }]}>{WRITING}</Text> : null}
        {msg?.text ? <Text accessibilityLiveRegion={liveRegion} style={[type.small, { color: msg.ok ? t.ok : t.danger, marginTop: 4 }]}>{msg.text}</Text> : null}
      </>
    );
    if (twoState) {
      return (
        <SettingRow
          key={key}
          first={first}
          title={a.title}
          value={formatAdaptation(a, cur)}
          hint={a.summary}
          expanded={open}
          onTitlePress={() => setAdaptOpen(open ? null : key)}
          tags={tags}
          control={working ? spinner : <Toggle value={cur === 1} disabled={adaptLocked} label={a.title} onChange={(next) => void changeAdaptRef.current?.(a, next ? 1 : 0)} />}
        >
          {lines}
        </SettingRow>
      );
    }
    return (
      <SettingRow key={key} first={first} title={a.title} value={formatAdaptation(a, cur)} hint={`${a.summary} ${isWideRow(a) ? 'Opens a field to type a value.' : 'Opens a list of values.'}`} disabled={adaptLocked} onPress={() => setPickKey(key)} tags={tags}>
        {lines}
      </SettingRow>
    );
  };

  const renderEntry = (e: Entry, first: boolean) => (e.kind === 'item' ? renderItem(e.item, first) : e.kind === 'adapt' ? renderAdapt(e.a, first) : renderLearned(e.s, e.borrowed, first));

  // The picker of a multi-value setting: a choice writes at once and closes the sheet.
  const pickA = pickKey ? adaptItems.find((a) => adaptationKey(a) === pickKey) : undefined;
  const pickCur = pickA ? adaptValues[adaptationKey(pickA)] : undefined;
  const pickWide = !!pickA && isWideRow(pickA);
  const pickOptions = pickA ? (pickA.choices ?? (pickWide ? [] : Array.from({ length: Math.round((pickA.max - pickA.min) / pickA.step) + 1 }, (_, n) => ({ value: pickA.min + n * pickA.step, label: formatAdaptation(pickA, pickA.min + n * pickA.step) })))) : [];
  const applyTyped = (a: AdaptationItem, text: string, cur: number) => {
    const key = adaptationKey(a);
    setDrafts((d) => {
      const { [key]: _gone, ...rest } = d;
      return rest;
    });
    if (!text.trim()) {
      setPickKey(null);
      return;
    }
    // Checked against this row's own min, max and step; nothing is sent for anything else.
    const check = typedValueCheck(a, text.trim());
    if (!check.ok) {
      setAdaptMsg((m) => ({ ...m, [key]: { ok: false, text: `${check.text} Nothing was sent.` } }));
      return;
    }
    const x = check.value;
    setPickKey(null);
    if (x !== cur) void changeAdaptRef.current?.(a, x);
  };

  return (
    <Screen>
      {items.length || learned.length ? (
        <GlowCard tone={reading || busy ? 'brand' : 'plain'} style={styles.hero}>
          <PinMark size={56} decorative />
          <View style={{ flex: 1 }}>
            <Text style={[type.title3, { color: t.text }]}>Settings on your {v.model || v.brand}</Text>
            <Text style={[type.sub, { color: t.muted, marginTop: 4 }]}>
              Pin16 backs up before every change, checks the car kept it, and puts the original back if anything fails.
            </Text>
          </View>
        </GlowCard>
      ) : null}

      {message && !message.id ? <Notice tone={message.tone} icon={message.tone === 'ok' ? 'check' : 'alert-circle-outline'} text={message.text} /> : null}

      {/* A put back opened from the change timeline: the user is at the top of the page. */}
      {busy?.startsWith('restore-top-') ? (
        <View style={styles.loading}>
          <ActivityIndicator color={t.muted} />
          <Text style={[type.sub, { color: t.muted, flex: 1 }]}>{WRITING}</Text>
        </View>
      ) : null}

      {/* No built-in switches for this car: say so, and put the way to add one first. */}
      {!items.length ? (
        <>
          <Notice icon="information-outline" tone="info" text={noSwitches} />
          {moreGroup}
        </>
      ) : null}

      {entries.length ? (
        <>
          <View style={{ marginBottom: space.md }}>
            <SearchField value={query} onChange={setQuery} placeholder="Search settings" caps={false} />
          </View>
          {/* Counts show once every module has answered, so they do not jump. */}
          <Chips
            scroll
            options={[
              { id: '', label: 'All', count: reading ? undefined : entries.length },
              { id: CHANGED, label: 'Changed from original', count: reading ? undefined : changedCount },
              ...SETTING_CATEGORIES.filter((c) => entries.some((e) => e.cat === c)).map((c) => ({ id: c as string, label: c, count: reading ? undefined : entries.filter((e) => e.cat === c).length })),
            ]}
            value={cat ?? ''}
            onPick={(id) => setCat(id || null)}
          />
        </>
      ) : null}

      {items.length || learned.length || Object.keys(originals).length ? (
        <View style={styles.actions}>
          <Button label="Put back original" icon="restart" variant="secondary" compact style={{ flex: 1 }} onPress={() => setPanel(panel === 'backups' ? null : 'backups')} accessibilityLabel={panel === 'backups' ? 'Hide put back original' : 'Put back original'} />
          <Button label="Coding history" icon="history" variant="secondary" compact style={{ flex: 1 }} onPress={() => setPanel(panel === 'history' ? null : 'history')} accessibilityLabel={panel === 'history' ? 'Hide coding history' : 'Coding history'} />
        </View>
      ) : null}

      {/* The result of a put back shows here, where it was tapped, and stays when the Put back original list empties. */}
      {message?.id === RESTORE_MSG ? <Notice tone={message.tone} icon={message.tone === 'ok' ? 'check' : 'alert-circle-outline'} text={message.text} /> : null}

      {panel === 'backups' ? (
        restorable.length ? (
          <Group header="Put back original" help={SECTIONS.customiseBackups} footer="The coding each module had before Pin16 first changed it.">
            {restorable.map((id, i) => {
              const did = splitKey(id).did;
              return (
                <ListRow
                  key={id}
                  first={i === 0}
                  icon="restart"
                  iconColour="grey"
                  title={`Put back ${defOf(id)?.name ?? id} ${did ? 'setting' : 'coding'}`}
                  subtitle={busy === `restore-${id}` ? WRITING : did ? `The original setting. Technical: ${did}` : 'The original coding'}
                  disabled={!!busy || !checked.has(id)}
                  onPress={() => setPending({ kind: 'restore', module: id })}
                />
              );
            })}
          </Group>
        ) : (
          <Notice icon="information-outline" text={reading ? 'Checking what each module holds now.' : 'Nothing to put back: every module holds the coding it had when Pin16 first read it.'} />
        )
      ) : null}

      {panel === 'history' ? (
        Object.values(codingHist).some((l) => l.length) ? (
          <Group header="Coding history" help={SECTIONS.moduleCodingHistory} footer="Every coding read from or written to each module on this car. Tap one to see what changed and to put an earlier coding back.">
            {Object.entries(codingHist)
              .filter(([, l]) => l.length)
              .map(([key, l], i) => (
                <ListRow
                  key={key}
                  first={i === 0}
                  icon="history"
                  iconColour="grey"
                  title={defOf(key)?.name ?? key}
                  subtitle={`${l.length} coding${l.length === 1 ? '' : 's'} kept, latest ${stamp(l[0].at).date} ${stamp(l[0].at).time}`}
                  onPress={() => router.push({ pathname: '/workshop/[id]', params: { id: key, tab: 'coding' } })}
                />
              ))}
          </Group>
        ) : (
          <Notice icon="information-outline" text="No codings are kept yet. Each module's coding is saved when Pin16 reads or changes it." />
        )
      ) : null}

      {moduleIds.length && reading ? (
        <View style={styles.loading}>
          <ActivityIndicator color={t.muted} />
          <Text style={[type.sub, { color: t.muted, flex: 1 }]}>
            Checking the current settings ({checkedModules} of {modulesWithSettings} module{modulesWithSettings === 1 ? '' : 's'} with settings). Each switch unlocks when its module has answered.
          </Text>
        </View>
      ) : null}

      {adaptReading ? (
        <View style={styles.loading}>
          <ActivityIndicator color={t.muted} />
          <Text style={[type.sub, { color: t.muted, flex: 1 }]}>Reading adjustable values: {defOf(adaptReading)?.name ?? adaptReading}.</Text>
        </View>
      ) : null}

      {sections.map(({ category, items: list }, k) => (
        <Group key={category} header={category} help={k === 0 && showExtras ? SECTIONS.customiseSettings : undefined}>
          {list.map((e, n) => renderEntry(e, n === 0))}
        </Group>
      ))}

      {anyUnconfirmed ? <Text style={[type.small, { color: t.muted, marginHorizontal: space.lg, marginBottom: space.xl }]}>Unconfirmed: one vague source. Pin16 writes the change and checks the module kept it. Switch it back if you see no effect.</Text> : null}

      {entries.length && !visible.length ? (
        <Text style={[type.sub, { color: t.muted, marginHorizontal: space.lg, marginBottom: space.xl }]}>
          {q ? `No setting matches “${query.trim()}”.` : cat === CHANGED ? 'Nothing on this car differs from the original.' : 'No settings in this category on this car.'}
        </Text>
      ) : null}

      {showExtras && adaptDone && !adaptReading && adaptItems.length > 0 && !adaptModules.length ? (
        <Text style={[type.sub, { color: t.muted, marginBottom: space.lg }]}>
          No adjustable values read from {[...new Set(adaptItems.map((a) => defOf(a.module)?.name ?? a.module))].join(' or ')}.
        </Text>
      ) : null}

      {v.deepFound?.length && showExtras ? (
        <Group
          header="Older VW modules on this car"
          footer="A switch shows only where a public source says which coding bit does what. For a module with none yet, open it to read and change its coding bit by bit, or run Learn my car below to look its settings up."
        >
          {v.deepFound.map((d, n) => {
            const count = available.filter((i) => i.module === d.moduleId).length;
            return (
              <ListRow
                key={d.address}
                first={n === 0}
                {...tool('module')}
                title={defOf(d.moduleId)?.name ?? d.moduleId}
                subtitle={[d.component, d.part].filter(Boolean).join(' · ') || undefined}
                value={count ? `${count} setting${count === 1 ? '' : 's'}` : 'Open coding'}
                onPress={() => router.push({ pathname: '/workshop/[id]', params: { id: d.moduleId } })}
              />
            );
          })}
        </Group>
      ) : null}

      {items.length && showExtras ? moreGroup : null}

      {kbNotes.length && showExtras ? (
        <Group header="From Research notes" footer="Not confirmed on a car, so Pin16 does not offer these as switches.">
          {kbNotes.map((n, i) => (
            <ListRow key={n.id} first={i === 0} icon="note-text-outline" iconColour="grey" title={n.title} subtitle={n.summary} noChevron />
          ))}
        </Group>
      ) : null}

      {showExtras ? (
        <Group>
          <ListRow
            first
            {...tool('timeline')}
            title="Change timeline"
            subtitle={Object.keys(originals).length ? 'Every change made to this car, with old and new values. Put one back or share the list.' : 'No changes yet. Each setting you change is listed here.'}
            onPress={() => router.push({ pathname: '/customise/timeline', params: { vin: v.vin } })}
          />
        </Group>
      ) : null}

      {unreachable.length && showExtras ? (
        <Group
          header="Not reachable on this car yet"
          help={SECTIONS.customiseUnreachable}
          footer="These settings live in modules that did not give Pin16 their coding on this car. Tap Read settings again with the ignition on."
        >
          {unreachable.map((i, n) => (
            <ListRow key={i.id} first={n === 0} title={i.title} subtitle={MODULES.find((m) => m.id === i.module)?.name} />
          ))}
        </Group>
      ) : null}

      {!q && !cat ? (
        cats.length ? (
          cats.map((c, k) => (
            <Group key={c.name} header={`${c.name} · guides`} help={k === 0 ? SECTIONS.customiseGuides : undefined}>
              {c.items.map((m, i) => (
                <ListRow
                  key={m.id}
                  first={i === 0}
                  icon={CATEGORY_ICON[m.category] ?? 'tune-variant'}
                  iconColour={m.status === 'owner' ? 'green' : 'grey'}
                  title={m.title}
                  subtitle={`${m.options[0]} · ${STATUS_LABEL[m.status]}`}
                  onPress={() => router.push(`/customise/${m.id}`)}
                />
              ))}
            </Group>
          ))
        ) : !items.length && !learned.length ? (
          <View style={{ alignItems: 'center', paddingVertical: space.xxl * 2, paddingHorizontal: space.xl }}>
            <PinMark lit={false} size={72} decorative />
            <Text style={[type.title3, { color: t.text, marginTop: space.lg, textAlign: 'center' }]}>Nothing for this car yet</Text>
            <Text style={[type.sub, { color: t.muted, textAlign: 'center', marginTop: space.sm }]}>
              No public source documents settings Pin16 can change on this car.
            </Text>
          </View>
        ) : null
      ) : null}

      <SheetPage visible={!!pickA} title={pickA?.title ?? ''} onCancel={() => setPickKey(null)} onDone={pickWide && pickA && pickCur != null ? () => applyTyped(pickA, drafts[adaptationKey(pickA)] ?? '', pickCur) : undefined} doneLabel="Set">
        {pickA && pickCur != null ? (
          <ScrollView contentContainerStyle={{ padding: space.lg, paddingBottom: space.xxl }} keyboardShouldPersistTaps="handled">
            {pickWide ? (
              <Field
                value={drafts[adaptationKey(pickA)] ?? String(pickCur)}
                onChange={(x) => setDrafts((d) => ({ ...d, [adaptationKey(pickA)]: x.replace(/[^0-9]/g, '').slice(0, String(pickA.max).length) }))}
                keyboard="number-pad"
                number
                editable={!adaptLocked}
                accessibilityLabel={`${pickA.title}, ${pickA.min} to ${pickA.max} ${pickA.unit ?? ''}`}
                placeholder={`${pickA.min} to ${pickA.max} ${pickA.unit ?? ''}`}
                style={{ marginBottom: space.lg }}
              />
            ) : (
              <Group header={`Now ${formatAdaptation(pickA, pickCur)}`}>
                {pickOptions.map((o, n) => (
                  <ListRow
                    key={o.value}
                    first={n === 0}
                    title={o.label}
                    selected={o.value === pickCur}
                    noChevron
                    disabled={adaptLocked}
                    onPress={() => {
                      setPickKey(null);
                      if (o.value !== pickCur) void changeAdaptRef.current?.(pickA, o.value);
                    }}
                  />
                ))}
              </Group>
            )}
            {adaptMsg[adaptationKey(pickA)]?.text ? (
              <Text accessibilityLiveRegion={liveRegion} style={[type.small, { color: adaptMsg[adaptationKey(pickA)].ok ? t.ok : t.danger, marginBottom: space.md }]}>
                {adaptMsg[adaptationKey(pickA)].text}
              </Text>
            ) : null}
            {adaptDetails(pickA, pickCur)}
          </ScrollView>
        ) : null}
      </SheetPage>

      <ConfirmSheet
        visible={!!pending}
        title={
          pending?.kind === 'forget'
            ? `Forget ${pending.setting.title}?`
            : pending?.kind === 'adaptRestore'
              ? 'Put back the original value?'
              : pending?.kind === 'restore'
                ? 'Put back the original coding?'
                : ''
        }
        lines={
          pending?.kind === 'forget'
            ? ['Removes the switch from Pin16. The car keeps whatever is set now.']
            : pending?.kind === 'adaptRestore'
              ? [adaptRestoreLine(pending.key)]
              : [`Puts back the coding ${(defOf(pending?.kind === 'restore' ? pending.module : '')?.name ?? 'this module')} had before Pin16 first changed it.`]
        }
        confirmLabel={pending?.kind === 'forget' ? 'Forget' : 'Put back'}
        onCancel={() => setPending(null)}
        onConfirm={() => pending && run(pending)}
      />
    </Screen>
  );
}

const TRIED_TEXT: Record<TryResult, string> = { works: 'Works on your car', refused: 'Did not take', 'no-effect': 'No effect seen' };

function TriedPill({ r }: { r: TryResult }) {
  return <Pill text={TRIED_TEXT[r]} tone={r === 'works' ? 'ok' : undefined} />;
}

const styles = StyleSheet.create({
  hero: { flexDirection: 'row', alignItems: 'center', gap: space.md, padding: space.lg },
  loading: { flexDirection: 'row', alignItems: 'center', gap: space.sm, padding: space.lg },
  // Tags (Unconfirmed, Works on your car) wrap under the setting's name.
  tags: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 4 },
  // Put back original and Coding history: one row of 2 compact buttons.
  actions: { flexDirection: 'row', gap: space.sm, marginBottom: space.lg },
  // A text link: a 44 pt target.
  link: { minHeight: 44, justifyContent: 'center', alignSelf: 'flex-start' },

});
