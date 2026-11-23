import { alertBuzz } from '../sound';
import React, { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { router, Stack, useIsFocused } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import Svg, { Polyline } from 'react-native-svg';
import { allowSleep, stayAwake } from '../keepAwake';
import { shareCsv } from '../logger/store';
import { shareFileName } from '../timeText';
import { CATEGORY_ICON, CATEGORY_ORDER, categoryOf, displaySensor, isPlausible, readKey, sensorId, sensorsForCar, SensorValue, unitOf } from '../obd/sensors';
import { groupValuesText, sensorCount, sensorCountText } from '../vehicle/counts';
import { extrasFor, formatExtra } from '../obd/extras';
import { DEFAULT_WATCH, LivePid, PID_GROUPS } from '../obd/pids';
import { suggestedSensors } from '../obd/sensorSearch';
import { toUserUnits, useSettings } from '../settings';
import { useConnection } from '../state';
import { useGarage } from '../vehicle/garage';
import { ModuleDef } from '../obd/modules';
import { MeasuringCell } from '../obd/tp20';
import { groupLabels, groupName, GROUP_NAMES } from '../data/groupLabels';
import { SECTIONS } from '../help';
import { NamedText, NameTarget, NameValueForm } from '../components/NameValue';
import { lookupValueName, ValueName } from '../data/valueNames';
import { useValueNames } from '../data/valueNamesStore';
import { radius, space, type, useTheme } from '../theme';
import { announce, Body, Button, Chip, ConfirmSheet, Field, Group, GuideButton, HeaderButton, Icon, IconName, Label, ListRow, NeedsConnection, Notice, ProgressBar, SearchField, SheetPage, Stepper, tool } from '../ui';
import { AlertLevel, alertLevel, AlertRule, AlertTracker, holdPeak, needsRpm, Peak, setRule } from '../live/alerts';
import { RateMeter, rateText } from '../live/rate';
import { filterPids, loadSet, removeSet, saveSet, ValueSet } from '../live/sets';
import { BOOST_PID } from '../live/boost';
import { TileSheet } from '../live/LiveTiles';
import { MAX_REC_ROWS, Reading, summarise, toCsv } from '../live/recording';
import { createRateStore, RateStore } from '../live/rateStore';

const HISTORY = 60; // samples kept per value for the trend line
const RPM = 0x0c;

interface Series {
  last: number | null;
  min: number;
  max: number;
  points: number[];
  peak?: Peak;
}

// A recording not yet shared is kept while Pin16 is open, so leaving Live
// data does not lose it. One at a time; a new recording replaces it.
let keptRecording: { vin: string | null; rows: Reading[] } | null = null;

export function LiveScreen({ active = true }: { active?: boolean }) {
  // Off screen (Fuel trims or Boost opened on top): stop reading, so the page
  // on screen gets the adapter to itself.
  const onScreen = useIsFocused();
  const t = useTheme();
  const conn = useConnection();
  const garageMain = useGarage();
  const [available, setAvailable] = useState<LivePid[] | null>(null);
  const [has70, setHas70] = useState(false);
  const [watch, setWatch] = useState<number[]>([]);
  const [series, setSeries] = useState<Record<number, Series>>({});
  const [paused, setPaused] = useState(false);
  const [picking, setPicking] = useState(false);
  // The rate sits in its own store: a change redraws one line of text, not the grid.
  const [rateStore] = useState<RateStore>(() => createRateStore());
  const meter = useRef(new RateMeter());
  const { settings } = useSettings();
  // Recording: every reading with its time, for a CSV.
  const [recording, setRecording] = useState(false);
  const recRef = useRef<{ t: number; pid: number; v: number }[] | null>(null);
  const recStart = useRef(0);
  const [recCount, setRecCount] = useState(0);
  const carVin = conn.vehicle?.vin ?? null;
  const [recorded, setRecorded] = useState<Reading[] | null>(() => (keptRecording && keptRecording.vin === carVin && keptRecording.rows.length ? keptRecording.rows : null));
  // Leaving the page while recording keeps the readings so far.
  const carVinRef = useRef(carVin);
  carVinRef.current = carVin;
  useEffect(
    () => () => {
      if (recRef.current?.length) keptRecording = { vin: carVinRef.current, rows: recRef.current };
    },
    [],
  );
  // Alerts while watching: coolant over 110 °C, and the owner's own limits.
  const [alert, setAlert] = useState<string | null>(null);
  const [rules, setRules] = useState<AlertRule[]>([]);
  const rulesRef = useRef<AlertRule[]>([]);
  rulesRef.current = rules;
  const tracker = useRef(new AlertTracker());
  const [editing, setEditing] = useState<LivePid | null>(null);
  const watchRef = useRef<number[]>([]);
  watchRef.current = watch;

  // Find out which values this car reports, once per connection.
  useEffect(() => {
    const client = conn.client;
    setAvailable(null);
    setSeries({});
    setRules(conn.vehicle?.liveAlerts ?? []);
    tracker.current.reset();
    if (!client) return;
    client.livePidsForCar().then(
      (list) => {
        setAvailable(list);
        const ids = list.map((p) => p.pid);
        // The values chosen last time for this car, else the defaults.
        const own = (conn.vehicle?.liveWatch ?? []).filter((p) => ids.includes(p));
        const start = DEFAULT_WATCH.filter((p) => ids.includes(p));
        setWatch(own.length ? own : start.length ? start : ids.slice(0, 8));
      },
      () => setAvailable([]),
    );
    client.supportedPids().then(
      (s) => setHas70(s.has(BOOST_PID)),
      () => setHas70(false),
    );
  }, [conn.client]);

  // Poll the watched values in turn while the tab is open and not paused.
  useEffect(() => {
    const client = conn.client;
    if (!client || !active || !onScreen || paused || !available) return;
    let running = true;
    meter.current.reset();
    rateStore.set(null);
    (async () => {
      let lastRpm: number | null = null;
      while (running) {
        const list = available.filter((p) => watchRef.current.includes(p.pid));
        if (!list.length) {
          await new Promise((r) => setTimeout(r, 500));
          continue;
        }
        // An alert that only counts above an engine speed needs engine speed too.
        const rpmPid = available.find((p) => p.pid === RPM);
        const read = rpmPid && needsRpm(rulesRef.current) && !list.includes(rpmPid) ? [...list, rpmPid] : list;
        // Another screen is talking to a module: wait for it, so the trend shows no gaps.
        if (client.moduleBusy) {
          await client.whenIdle();
          continue;
        }
        const got = await client.readLiveMany(read).catch(() => new Map<number, number | null>());
        if (!running) break;
        const busy = client.moduleBusy;
        let any = false;
        let answered = 0;
        const now = Date.now();
        const rpmRead = got.get(RPM);
        if (rpmRead != null) lastRpm = rpmRead;
        const levels = new Map<number, AlertLevel>();
        for (const p of list) {
          const v = got.get(p.pid) ?? null;
          any = any || v != null;
          if (v != null) answered++;
          if (v != null && recRef.current && recRef.current.length < MAX_REC_ROWS) recRef.current.push({ t: now - recStart.current, pid: p.pid, v });
          if (p.pid === 0x05 && v != null) {
            const shown = toUserUnits(v, '°C', settings);
            setAlert(v > 110 ? `Coolant at ${Math.round(shown.value)} ${shown.unit}. Slow down, stop when it is safe and let the engine cool.` : null);
          }
          const rule = rulesRef.current.find((r) => r.pid === p.pid);
          if (rule && got.has(p.pid)) levels.set(p.pid, alertLevel(rule, v, lastRpm));
        }
        // One buzz as a value crosses into its alert.
        const crossed = tracker.current.update(levels, now);
        if (crossed.length) alertBuzz('alert');
        // Said aloud too, once per crossing: a colour change alone is silent.
        for (const pid of crossed) {
          const pp = available.find((x) => x.pid === pid);
          const val = got.get(pid);
          if (pp && val != null) {
            const sh = toUserUnits(val, pp.unit, settings);
            announce(`${pp.label}, ${sh.value.toFixed(pp.decimals)} ${sh.unit}, past the alert limit`);
          }
        }
        // One screen update per pass; values skipped for a busy adapter draw no gap.
        setSeries((old) => {
          const next = { ...old };
          for (const p of read) {
            const v = got.get(p.pid) ?? null;
            if (v == null && (busy || !got.has(p.pid))) continue;
            next[p.pid] = push(old[p.pid], v, now);
          }
          return next;
        });
        if (recRef.current) setRecCount(recRef.current.length);
        if (any) {
          meter.current.add(answered, Date.now());
          if (running) rateStore.set(meter.current.rate());
        }
        if (!any && !busy) await new Promise((r) => setTimeout(r, 1500));
      }
    })();
    return () => {
      running = false;
    };
  }, [conn.client, active, onScreen, paused, available]);

  // The phone stays awake while live values are on screen, as on Dashboard
  // and the other live pages (src/keepAwake.ts).
  const connected = !!conn.client;
  useEffect(() => {
    if (!connected || !active || !onScreen) return undefined;
    stayAwake('live');
    return () => allowSleep('live');
  }, [connected, active, onScreen]);
  const [shareError, setShareError] = useState<string | null>(null);
  const openTile = useCallback((p: LivePid) => setEditing(p), []);

  const shown = useMemo(() => (available ?? []).filter((p) => watch.includes(p.pid)), [available, watch]);
  const rpmNow = series[RPM]?.last ?? null;
  const saveRules = (next: AlertRule[]) => {
    setRules(next);
    if (conn.vehicle) garageMain.update(conn.vehicle.vin, { liveAlerts: next });
  };
  const petrol = conn.vehicle?.fuel !== 'Diesel';
  const hasTrims = petrol && !!available?.some((p) => p.pid >= 0x06 && p.pid <= 0x09);
  // Boost: from PID 70, or on older VW engines (TP2.0) from group 115.
  const hasBoost = has70 || (conn.vehicle?.group === 'vag' && conn.vehicle?.platform === 'PQ35' && !!conn.client?.supportsModules);

  if (!conn.client) {
    return (
      <NeedsConnection title="Connect your car to see live data" />
    );
  }

  // Record and Stop: the page's one filled action, in the header.
  const toggleRecording = () => {
    if (!available?.length) return;
    if (recording) {
      setRecorded(recRef.current);
      keptRecording = recRef.current?.length ? { vin: carVin, rows: recRef.current } : null;
      recRef.current = null;
      setRecording(false);
      announce('Recording stopped');
    } else {
      keptRecording = null;
      recRef.current = [];
      recStart.current = Date.now();
      setRecCount(0);
      setRecorded(null);
      setRecording(true);
      announce('Recording');
    }
  };

  return (
    <View>
      <Stack.Screen
        options={{
          headerRight: () => (
            <View style={styles.headerRight}>
              <HeaderButton icon={recording ? 'stop' : 'record-circle-outline'} label={recording ? 'Stop recording' : 'Record'} filled onPress={toggleRecording} />
              <GuideButton id="live" />
            </View>
          ),
        }}
      />
      {alert ? <Notice tone="danger" icon="alert-circle-outline" text={alert} /> : null}
      {available && available.length === 0 ? <Notice text="The car did not report any standard live values." /> : null}
      {recording ? (
        <Notice icon="record-circle-outline" tone="accent" text={`Recording: ${recCount.toLocaleString('en-GB')} reading${recCount === 1 ? '' : 's'} so far.${recCount >= MAX_REC_ROWS ? ' The limit is reached, so no more are added.' : ''}`} />
      ) : null}

      {/* The readings come first: they are the job. */}
      <Label help={SECTIONS.liveStandard}>Standard readings (every car)</Label>
      <View style={styles.grid}>
        {shown.map((p) => {
          const s = series[p.pid];
          const rule = rules.find((r) => r.pid === p.pid);
          return <LiveTile key={p.pid} p={p} s={s} rule={rule} level={alertLevel(rule, s?.last, rpmNow)} settings={settings} onOpen={openTile} />;
        })}
      </View>
      <Intro shown={shown.length} total={available ? available.length : null} store={rateStore} developer={!!settings.developer} />
      {shown.length ? (
        <Body muted small style={{ marginHorizontal: space.lg, marginBottom: space.md }}>
          Tap a tile for alert limits and its lowest and highest.
        </Body>
      ) : null}

      <View style={{ flexDirection: 'row', gap: space.sm, marginBottom: space.lg }}>
        <Button label="Choose" icon="playlist-check" variant="secondary" compact onPress={() => setPicking(true)} style={{ flex: 1 }} disabled={!available} />
        <Button label={paused ? 'Resume' : 'Pause'} icon={paused ? 'play' : 'pause'} variant="secondary" compact onPress={() => setPaused((p) => !p)} style={{ flex: 1 }} />
        <Button label="Reset" icon="restart" variant="secondary" compact onPress={() => setSeries({})} style={{ flex: 1 }} />
      </View>
      {recorded?.length ? (
        <Button
          label="Share CSV"
          icon="share-variant"
          variant="secondary"
          compact
          style={{ marginBottom: space.lg }}
          onPress={() => {
            // A real .csv file, shared the way the data logger shares its logs.
            setShareError(null);
            shareCsv(shareFileName('live data', conn.vehicle?.vin), toCsv(recorded, available ?? [], settings)).catch((e) => setShareError(`Could not share: ${e instanceof Error ? e.message : String(e)}`));
          }}
        />
      ) : null}
      {shareError ? <Notice tone="danger" icon="alert-circle-outline" text={shareError} /> : null}
      {recorded?.length ? <RecordingSummary rows={recorded} pids={available ?? []} /> : null}

      <SensorHub active={active} />

      {hasTrims || hasBoost ? (
        <Group header="Views" help={SECTIONS.liveViews} style={{ marginTop: space.xl, marginBottom: 0 }}>
          {hasTrims ? (
            <ListRow first icon={'gas-station' as IconName} iconColour="green" title="Fuel trims" subtitle="Per bank, with lambda and oxygen sensors" onPress={() => router.push('/fuel-trims')} />
          ) : null}
          {hasBoost ? (
            <ListRow first={!hasTrims} icon={'turbine' as IconName} iconColour="indigo" title="Turbo boost" subtitle="Requested and actual" onPress={() => router.push('/boost')} />
          ) : null}
        </Group>
      ) : null}

      <MakerData />
      <MeasuringBlocks />

      <Picker
        visible={picking}
        available={available ?? []}
        selected={watch}
        sets={conn.vehicle?.liveSets ?? []}
        onSets={(next) => {
          if (conn.vehicle) garageMain.update(conn.vehicle.vin, { liveSets: next });
        }}
        onClose={(next) => {
          setWatch(next);
          setPicking(false);
          if (conn.vehicle) garageMain.update(conn.vehicle.vin, { liveWatch: next });
        }}
      />
      <TileSheet
        pid={editing}
        rule={editing ? rules.find((r) => r.pid === editing.pid) : undefined}
        minMax={editing && series[editing.pid]?.points.length ? series[editing.pid] : null}
        peak={editing ? series[editing.pid]?.peak : null}
        settings={settings}
        onClose={() => setEditing(null)}
        onResetMinMax={() => {
          if (!editing) return;
          setSeries((old) => {
            const next = { ...old };
            delete next[editing.pid];
            return next;
          });
        }}
        onSave={(rule) => {
          if (editing) saveRules(setRule(rules, editing.pid, rule));
          setEditing(null);
        }}
      />
    </View>
  );
}

// One line above the tiles. It reads the rate from its own store, so a
// rate change does not redraw the grid.
const Intro = React.memo(function Intro({ shown, total, store, developer }: { shown: number; total: number | null; store: RateStore; developer: boolean }) {
  const rate = useSyncExternalStore(store.subscribe, store.get);
  return (
    <Body muted small style={styles.intro}>
      {total != null
        ? `Watching ${shown} of ${total}${
            rate && developer ? `: ${rateText(rate.readings)} readings a second, ${rateText(rate.updates)} updates a second` : ''
          }. Fewer values update faster.`
        : 'Asking the car which values it reports…'}
    </Body>
  );
});

// One live value tile. It redraws only when its own series, rule or level changes.
const LiveTile = React.memo(function LiveTile({
  p,
  s,
  rule,
  level,
  settings,
  onOpen,
}: {
  p: LivePid;
  s: Series | undefined;
  rule: AlertRule | undefined;
  level: AlertLevel;
  settings: ReturnType<typeof useSettings>['settings'];
  onOpen: (p: LivePid) => void;
}) {
  const t = useTheme();
  const f = (v: number) => toUserUnits(v, p.unit, settings).value.toFixed(p.decimals);
  const unitLabel = toUserUnits(0, p.unit, settings).unit;
  const valueText = s?.last == null ? 'No reading' : `${f(s.last)} ${unitLabel}`;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${p.label}, ${valueText}${level ? ', past the alert limit' : ''}. Opens alerts and lowest and highest.`}
      onPress={() => onOpen(p)}
      style={({ pressed }) => [
        styles.tile,
        { backgroundColor: level ? t.dangerSoft : pressed ? t.raised : t.surface, borderColor: level ? t.danger : t.border },
        level ? styles.tileAlert : null,
      ]}
    >
      <View style={styles.tileHead}>
        <Text style={[styles.tileLabel, { color: level ? t.danger : t.muted, flex: 1 }]}>
          {p.label}
        </Text>
        {rule ? <Icon name={level ? 'bell-ring' : 'bell-outline'} size={13} color={level ? t.danger : t.faint} /> : null}
      </View>
      {s && s.last == null ? (
        // Read, but the car sent no value (an O2 sensor's 1.275 V means none).
        <Text style={[styles.tileValue, styles.noReading, { color: t.muted }]}>No reading</Text>
      ) : (
        <Text style={[styles.tileValue, { color: level ? t.danger : t.text }]} accessibilityLabel={s?.last == null ? 'No reading' : undefined}>
          {s?.last == null ? '–' : f(s.last)}
          <Text style={[styles.unit, { color: t.muted }]}> {unitLabel}</Text>
        </Text>
      )}
      <Spark points={s?.points ?? NO_POINTS} />
      <Text style={[styles.minmax, { color: t.muted }]}>
        {/* Lowest and highest only, on one line; the held peak is in the tile's sheet. */}
        {s && s.points.length ? `min ${f(s.min)} · max ${f(s.max)}` : ' '}
      </Text>
    </Pressable>
  );
});

const NO_POINTS: number[] = [];

// Top of Live data: the car's own sensors by system (as Carista groups them),
// pinned values live, and the sensor search for cars not searched yet.
const SensorHub = React.memo(function SensorHub({ active: shown }: { active: boolean }) {
  const t = useTheme();
  // Stop polling while another screen is on top (it may need the adapter).
  const focused = useIsFocused();
  const active = shown && focused;
  const conn = useConnection();
  const { settings } = useSettings();
  const v = conn.vehicle;
  const all = useMemo(() => sensorsForCar(v), [v]);
  const found = useMemo(() => new Set(v?.sensorsFound ?? []), [v?.sensorsFound]);
  const mine = useMemo(() => all.filter((r) => found.has(readKey(r))), [all, found]);
  const chosen = useMemo(() => mine.filter((r) => (v?.pinnedSensors ?? []).includes(sensorId(r))).slice(0, 8), [mine, v?.pinnedSensors]);
  // Suggested values that read outside a sane range for their unit (a value
  // from a relative's list that decodes differently on this car): replaced.
  const [odd, setOdd] = useState<string[]>([]);
  // Nothing pinned yet: show the most useful value from each main system, so
  // Live data opens on real numbers (gearbox oil temperature, DPF soot).
  const suggested = useMemo(
    () => (chosen.length ? [] : suggestedSensors(mine.filter((r) => !odd.includes(sensorId(r))), unitOf, 4, conn.vehicle?.fuel)),
    [mine, chosen.length, conn.vehicle?.fuel, odd],
  );
  const pinned = chosen.length ? chosen : suggested;
  const [values, setValues] = useState<Record<string, SensorValue>>({});
  useEffect(() => {
    const c = conn.client;
    if (!c || !active || !pinned.length) return;
    let on = true;
    (async () => {
      while (on) {
        const got = await c.readSensors(pinned, () => !on).catch(() => ({}) as Record<string, SensorValue>);
        if (!on) break;
        setValues((old) => ({ ...old, ...got }));
        if (!chosen.length) {
          const bad = pinned.filter((r) => got[sensorId(r)] != null && !isPlausible(r, got[sensorId(r)])).map(sensorId);
          if (bad.length) {
            setOdd((old) => [...new Set([...old, ...bad])]);
            break;
          }
        }
        await new Promise((r) => setTimeout(r, 800));
      }
    })();
    return () => {
      on = false;
    };
  }, [conn.client, active, pinned]);
  if (!v || !conn.client?.supportsModules || v.group === 'other' || !all.length) return null;
  const imperial = { speed: settings.speed === 'mph', temp: settings.temp === '°F' };
  const counts = CATEGORY_ORDER.map((c) => ({ c, n: mine.filter((r) => categoryOf(r) === c).length })).filter((x) => x.n);

  if (!v.sensorScan) {
    return (
      <Group>
        <ListRow first {...tool('sensors')} title="Find my car’s sensors" subtitle={`Gearbox oil temperature, DPF soot, oil level, crash counts and up to ${all.length.toLocaleString('en-GB')} more. Takes a few minutes, once.`} onPress={() => router.push('/sensors')} />
      </Group>
    );
  }

  return (
    <View style={{ marginBottom: space.lg }}>
      {pinned.length ? <Label>{chosen.length ? 'Pinned' : 'Suggested for this car'}</Label> : null}
      {pinned.length ? (
        <View style={[styles.grid, { marginBottom: space.md }]}>
          {pinned.map((r) => {
            const val = values[sensorId(r)];
            const d = val != null ? displaySensor(r, val, imperial) : null;
            return (
              <View key={sensorId(r)} style={[styles.tile, { backgroundColor: t.surface, borderColor: t.accent + '55' }]}>
                <Text numberOfLines={2} style={[styles.tileLabel, { color: t.muted }]}>
                  {r.n}
                </Text>
                <Text style={[styles.tileValue, { color: d && !d.check ? t.text : t.muted }]} accessibilityLabel={d ? undefined : 'No reading'}>
                  {d ? d.text : '–'}
                  <Text style={[styles.unit, { color: t.muted }]}> {d?.unit ?? ''}</Text>
                </Text>
              </View>
            );
          })}
        </View>
      ) : null}
      <Group header={`${sensorCountText({ ...sensorCount(v), groupValues: 0, groups: 0 })} on this car`} help={SECTIONS.liveHub} footer={chosen.length ? undefined : 'Open a system and tap the star on a value to pin your own here.'}>
        {counts.map(({ c, n }, i) => (
          // Grey squares: a system of the car is a fact about it, not a tool or a state.
          <ListRow key={c} first={i === 0} icon={CATEGORY_ICON[c] as IconName} iconColour="grey" title={c} value={n.toLocaleString('en-GB')} onPress={() => router.push({ pathname: '/sensors', params: { cat: c } })} />
        ))}
        <ListRow {...tool('sensors')} title="Find my car’s sensors" subtitle="Search by name, or search the car again" onPress={() => router.push('/sensors')} />
      </Group>
    </View>
  );
});

// Maker-specific values (odometer per module, DPF, crash counters), read once.
const MakerData = React.memo(function MakerData() {
  const t = useTheme();
  const conn = useConnection();
  const { settings } = useSettings();
  const garage = useGarage();
  const [readError, setReadError] = useState<string | null>(null);
  const group = conn.vehicle?.group ?? 'other';
  const list = extrasFor(group);
  const [values, setValues] = useState<Record<string, number> | null>(null);
  const [progress, setProgress] = useState<number | null>(null);
  // DPF regeneration watch: checks every 20 s while this screen is open.
  const regen = list.find((e) => e.id.endsWith('-regen'));
  const [watching, setWatching] = useState(false);
  const [regenOn, setRegenOn] = useState<boolean | null>(null);
  useEffect(() => {
    if (!watching || !regen || !conn.client) return;
    let alive = true;
    let was: boolean | null = null;
    const tick = async () => {
      const got = await conn.client!.readExtras([regen]).catch(() => ({}) as Record<string, number>);
      if (!alive) return;
      const on = got[regen.id] != null ? got[regen.id] > 0 : null;
      if (on !== was && on != null) {
        if (on) alertBuzz('warn');
        was = on;
      }
      setRegenOn(on);
    };
    tick();
    const id = setInterval(tick, 20000);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, [watching, regen, conn.client]);
  if (!list.length || !conn.client?.supportsModules) return null;

  const read = async () => {
    setProgress(0);
    setReadError(null);
    try {
      const got = await conn.client!.readExtras(list, (d, n) => setProgress(d / n));
      setValues(got);
      const odo = list.find((e) => e.category === 'Distance' && got[e.id] != null);
      if (odo && conn.vehicle) await garage.update(conn.vehicle.vin, { odometerKm: got[odo.id], odometerAt: Date.now() });
    } catch (e) {
      setReadError(`${e instanceof Error ? e.message : String(e)} Tap Read maker data to try again.`);
    } finally {
      setProgress(null);
    }
  };
  const found = values ? list.filter((e) => values[e.id] != null) : [];
  const categories = [...new Set(found.map((e) => e.category))];

  return (
    <View style={{ marginTop: space.xl }}>
      <Label help={SECTIONS.liveMaker}>Maker data</Label>
      {readError ? <Notice tone="danger" icon="alert-circle-outline" text={readError} /> : null}
      {regen ? (
        <View style={{ marginBottom: space.md }}>
          {watching && regenOn ? (
            <Notice tone="danger" icon="alert-circle-outline" text="The DPF is regenerating. Keep driving at a steady speed and do not switch off until it finishes." />
          ) : watching && regenOn === false ? (
            <Notice tone="ok" icon="check" text="No DPF regeneration running. Pin16 checks every 20 seconds while this page is open." />
          ) : null}
          <Button label={watching ? 'Stop' : 'Watch for DPF regeneration'} icon={watching ? 'stop' : 'bell-alert-outline'} variant="secondary" onPress={() => setWatching((w) => !w)} />
        </View>
      ) : null}
      <View style={[styles.maker, { backgroundColor: t.surface, borderColor: t.border }]}>
        <Body muted small style={{ marginBottom: space.md }}>
          A short list of extra values from owner sources (the odometer in each module, DPF soot, crash counts).
          {sensorsForCar(conn.vehicle).length ? ' Find my car’s sensors, at the top, looks for every sensor; Learn my car runs that search for you.' : ''}
        </Body>
        {progress != null ? (
          <ProgressBar value={progress} label="Reading maker data…" />
        ) : (
          <Button label={values ? 'Read again' : 'Read maker data'} icon="database-search-outline" variant="secondary" onPress={read} />
        )}
        {values && !found.length ? (
          <Body muted small style={{ marginTop: space.md }}>
            Your car did not answer any of the {list.length} known values.
          </Body>
        ) : null}
        {categories.map((c) => (
          <View key={c} style={{ marginTop: space.lg }}>
            <Text style={[styles.makerHead, { color: t.text }]}>{c}</Text>
            {found
              .filter((e) => e.category === c)
              .map((e) => (
                <View key={e.id} style={[styles.makerRow, { borderColor: t.border }]}>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.makerLabel, { color: t.text }]}>{e.label}</Text>
                    <Text style={[styles.makerSource, { color: t.muted }]}>{e.source}</Text>
                  </View>
                  <Text style={[styles.makerValue, { color: t.text }]}>{formatExtra(e, values![e.id], settings)}</Text>
                </View>
              ))}
          </View>
        ))}
      </View>
    </View>
  );
});

// Older VW modules (KWP2000 over TP2.0): measuring blocks by group number.
// Known groups come from replica/leon-sources.md 4.3 (2.0 TFSI engine).
const PRESETS: { module: string; group: number; label: string }[] = [1, 115, 114, 3]
  .filter((g) => GROUP_NAMES['01'][g])
  .map((g) => ({ module: 'engine', group: g, label: groupName('01', g) }));

const MeasuringBlocks = React.memo(function MeasuringBlocks() {
  const focused = useIsFocused();
  const t = useTheme();
  const conn = useConnection();
  const client = conn.client;
  const [modules, setModules] = useState<ModuleDef[] | null>(null);
  const [module, setModule] = useState<ModuleDef | null>(null);
  const [group, setGroup] = useState(1);
  const [cells, setCells] = useState<MeasuringCell[] | null>(null);
  const [busy, setBusy] = useState<'find' | 'read' | 'scan' | null>(null);
  const [live, setLive] = useState(false);
  const [found, setFound] = useState<{ group: number; cells: MeasuringCell[] }[]>([]);
  const [pct, setPct] = useState(0);
  const [readError, setReadError] = useState<string | null>(null);
  const ownNames = useValueNames(conn.vehicle?.vin);
  // The Name form that is open: the field (0 based) and the module, group and
  // field it was opened for. Save uses this, never the current selection.
  const [naming, setNaming] = useState<{ index: number; target: NameTarget; existing?: ValueName } | null>(null);
  // Another module or group closes the form.
  useEffect(() => {
    setNaming(null);
  }, [module?.id, group]);
  const liveRef = React.useRef(false);
  useEffect(
    () => () => {
      liveRef.current = false;
    },
    [],
  );
  // Groups Learn my car found on this car: the modules show without a search.
  const saved = conn.vehicle?.groupsFound;
  useEffect(() => {
    if (modules || !saved || !client) return;
    const list = Object.keys(saved)
      .filter((id) => Object.keys(saved[id]).length)
      .map((id) => client.moduleById(id))
      .filter((d): d is ModuleDef => !!d);
    if (!list.length) return;
    setModules(list);
    setModule(list.find((m) => m.id === 'engine') ?? list[0]);
  }, [saved, client, modules]);
  // Another screen opened on top (Boost reads the same engine): stop watching,
  // or that screen would wait behind this one.
  useEffect(() => {
    if (!focused && liveRef.current) liveRef.current = false;
  }, [focused]);
  if (conn.vehicle?.group !== 'vag' || !client?.supportsModules) return null;
  const savedGroups = module && saved?.[module.id] ? Object.entries(saved[module.id]).map(([g, units]) => ({ group: Number(g), units })) : [];

  const find = async () => {
    setBusy('find');
    setReadError(null);
    try {
      const list = await client.findTp20Modules();
      setModules(list);
      setModule(list.find((m) => m.id === 'engine') ?? list[0] ?? null);
    } catch (e) {
      setReadError(`Could not read: ${e instanceof Error ? e.message : String(e)}. Check the ignition is on.`);
    } finally {
      setBusy(null);
    }
  };
  const read = async (g = group, m = module) => {
    if (!m) return;
    setGroup(g);
    setBusy('read');
    setReadError(null);
    try {
      setCells(await client.readMeasuringBlock(m, g));
    } catch (e) {
      setReadError(`Could not read: ${e instanceof Error ? e.message : String(e)}. Check the ignition is on.`);
    } finally {
      setBusy(null);
    }
  };
  const toggleLive = async () => {
    if (!module) return;
    if (liveRef.current) {
      liveRef.current = false;
      setLive(false);
      return;
    }
    liveRef.current = true;
    setLive(true);
    setReadError(null);
    try {
      await client.watchMeasuringBlock(module, group, setCells, () => liveRef.current);
    } catch (e) {
      setReadError(`Could not read: ${e instanceof Error ? e.message : String(e)}. Check the ignition is on.`);
    } finally {
      liveRef.current = false;
      setLive(false);
    }
  };
  const scanAll = async () => {
    if (!module) return;
    setBusy('scan');
    setFound([]);
    setReadError(null);
    try {
      await client.scanMeasuringBlocks(module, (g, c) => setFound((old) => [...old, { group: g, cells: c }].sort((x, y) => x.group - y.group)), setPct);
    } catch (e) {
      setReadError(`Could not read: ${e instanceof Error ? e.message : String(e)}. Check the ignition is on.`);
    } finally {
      setBusy(null);
    }
  };
  const fmt = (c: MeasuringCell) => (typeof c.value === 'number' ? `${Number.isInteger(c.value) ? c.value : c.value.toFixed(1)} ${c.unit === 'raw' ? '(raw)' : c.unit}` : `${c.value} ${c.unit}`).trim();

  return (
    <View style={{ marginTop: space.xl }}>
      <Label help={SECTIONS.liveOlder}>Older VW modules, for experts</Label>
      <View style={[styles.maker, { backgroundColor: t.surface, borderColor: t.border }]}>
        <Body muted small style={{ marginBottom: space.md }}>
          Older VW modules give live values in numbered value groups. Units come from each value itself; values with an unknown
          formula are shown raw. Learn my car finds these modules and their groups for you.
        </Body>
        {readError ? <Notice tone="danger" icon="alert-circle-outline" text={readError} /> : null}
        {!modules ? (
          <>
            <Button label={busy === 'find' ? 'Looking…' : 'Look for older VW modules'} icon="database-search-outline" variant="secondary" busy={busy === 'find'} onPress={find} />
            <Body muted small style={{ marginTop: space.sm }}>Lists the older VW modules on this car, without running Learn my car.</Body>
          </>
        ) : !modules.length ? (
          <Body muted small>No module on this car answered on the older protocol.</Body>
        ) : (
          <>
            <View style={styles.chips}>
              {modules.map((m) => (
                <Chip key={m.id} onCard label={m.name} selected={module?.id === m.id} onPress={() => setModule(m)} />
              ))}
            </View>
            {module?.id === 'engine' ? (
              <View style={styles.chips}>
                {PRESETS.map((p) => (
                  <Chip key={p.group} onCard label={p.label} onPress={() => read(p.group)} />
                ))}
              </View>
            ) : null}
            <View style={[styles.stepper, { justifyContent: 'center' }]}>
              <Stepper label="Group" value={`Group ${group}`} width={96} disabled={!!busy || live} noLower={group <= 1} noHigher={group >= 255} onStep={(d) => read(Math.min(255, Math.max(1, group + d)))} />
            </View>
            <View style={{ gap: space.sm }}>
              <Button label={live ? 'Stop' : 'Live'} icon={live ? 'stop' : 'chart-timeline-variant'} variant={live ? 'secondary' : 'primary'} onPress={toggleLive} disabled={!!busy} />
              <Button label="Read every group of this module" icon="magnify" variant="ghost" busy={busy === 'scan'} disabled={!!busy || live} onPress={scanAll} />
              <Body muted small>Reads groups 1 to 255 now and shows what each holds. Learn my car reads them too and keeps the list below.</Body>
              {module && savedGroups.length ? <Button label="Find a switch" icon="toggle-switch-outline" variant="ghost" disabled={!!busy || live} onPress={() => router.push({ pathname: '/find-switch', params: { id: module.id } })} /> : null}
            </View>
            {cells ? (
              cells.length ? (
                cells.map((c, i) => {
                  const own = module ? lookupValueName(ownNames, module.id, group, i + 1) : undefined;
                  return (
                    <View key={i}>
                      <View style={[styles.makerRow, { borderColor: t.border }]}>
                        <Pressable accessibilityRole="button" accessibilityLabel={`${own ? own.name : (groupLabels(module?.code, group)?.[i] ?? `Field ${i + 1}`)}: ${fmt(c)}. ${own ? 'Rename' : 'Name'} this value`} onPress={() => setNaming(naming?.index === i ? null : module ? { index: i, target: { moduleId: module.id, moduleCode: module.code, group, field: i + 1, unit: c.unit, changed: fmt(c) }, existing: own } : null)} style={{ flex: 1, minHeight: 44, justifyContent: 'center' }}>
                          <NamedText own={own} builtIn={groupLabels(module?.code, group)?.[i]} fallback={`Field ${i + 1}`} style={styles.makerLabel} />
                          <Text style={[type.caption, { color: t.accentText }]}>{own ? 'Rename' : 'Name'}</Text>
                        </Pressable>
                        <Text style={[styles.makerValue, { color: t.text }]}>{fmt(c)}</Text>
                      </View>
                      {naming?.index === i && conn.vehicle ? (
                        <NameValueForm key={`${naming.target.moduleId}.${naming.target.group}.${naming.target.field}`} v={conn.vehicle} target={naming.target} existing={naming.existing} onClose={() => setNaming(null)} />
                      ) : null}
                    </View>
                  );
                })
              ) : (
                <Body muted small style={{ marginTop: space.md }}>This group is empty on this module.</Body>
              )
            ) : null}
            {busy === 'scan' ? <ProgressBar value={pct} label="Reading groups 1 to 255" /> : null}
            {!found.length && savedGroups.length ? (
              <Body muted small style={{ marginTop: space.md }}>
                {groupValuesText({ groupValues: savedGroups.reduce((n, g) => n + g.units.length, 0), groups: savedGroups.length })} in the {module?.name.toLowerCase()}, found by Learn my car. Tap one to read it.
              </Body>
            ) : null}
            {found.length
              ? null
              : savedGroups.map((f) => (
                  <Pressable key={f.group} accessibilityRole="button" onPress={() => read(f.group)} style={[styles.makerRow, { borderColor: t.border }]}>
                    <Text style={[styles.makerLabel, { color: t.text, flex: 1 }]} numberOfLines={2}>{groupName(module?.code, f.group)}</Text>
                    <Text style={[styles.makerSource, { color: t.muted }]}>
                      {f.units.length} value{f.units.length === 1 ? '' : 's'}
                    </Text>
                  </Pressable>
                ))}
            {found.map((f) => (
              <Pressable key={f.group} accessibilityRole="button" onPress={() => read(f.group)} style={[styles.makerRow, { borderColor: t.border }]}>
                <Text style={[styles.makerLabel, { color: t.text, width: 120 }]} numberOfLines={2}>{groupName(module?.code, f.group)}</Text>
                <Text style={[styles.makerSource, { color: t.muted, flex: 1 }]} numberOfLines={2}>
                  {f.cells.map(fmt).join(' · ')}
                </Text>
              </Pressable>
            ))}
          </>
        )}
      </View>
    </View>
  );
});

function RecordingSummary({ rows, pids }: { rows: Reading[]; pids: LivePid[] }) {
  const { settings } = useSettings();
  // Worked out once per recording, not on every poll pass after Stop.
  const stats = useMemo(() => summarise(rows), [rows]);
  const secs = (rows[rows.length - 1]?.t ?? 0) / 1000;
  return (
    <Group header={`Recording, ${secs.toFixed(0)} s, ${rows.length.toLocaleString('en-GB')} reading${rows.length === 1 ? '' : 's'}`} help={SECTIONS.liveRecording} footer="Share CSV opens in Numbers or Excel. The recording is kept until you record again or close Pin16. For recordings saved on the phone with charts, use the Data logger.">
      {stats.map((st, i) => {
        const p = pids.find((x) => x.pid === st.pid);
        if (!p) return null;
        const f = (v: number) => toUserUnits(v, p.unit, settings).value.toFixed(p.decimals);
        return (
          <ListRow key={st.pid} first={i === 0} title={p.label} value={`${f(st.min)} to ${f(st.max)}, average ${f(st.avg)} ${toUserUnits(0, p.unit, settings).unit}`} noChevron />
        );
      })}
    </Group>
  );
}

function push(old: Series | undefined, v: number | null, now = Date.now()): Series {
  // Only answers reach here: a null is the car saying it has no value now.
  if (v == null) return { ...(old ?? { min: Infinity, max: -Infinity, points: [] }), last: null };
  const points = [...(old?.points ?? []), v].slice(-HISTORY);
  return { last: v, min: Math.min(old?.min ?? Infinity, v), max: Math.max(old?.max ?? -Infinity, v), points, peak: holdPeak(old?.peak, v, now) };
}

const SPARK_W = HISTORY * 4;
const SPARK_H = 28;

// Trend of the last samples, drawn as one polyline. It redraws only when the points change.
const Spark = React.memo(function Spark({ points }: { points: number[] }) {
  const t = useTheme();
  let lo = Infinity;
  let hi = -Infinity;
  for (const v of points) {
    if (v < lo) lo = v;
    if (v > hi) hi = v;
  }
  const span = hi - lo || 1;
  const xy = points.map((v, i) => [i * 4 + 1.5, SPARK_H - 2 - ((v - lo) / span) * (SPARK_H - 4)] as const);
  const all = xy.map(([x, y]) => `${x},${y.toFixed(1)}`).join(' ');
  // The newest sample is drawn in a stronger colour, as the bars did.
  const tail = xy.length > 1 ? xy.slice(-2) : xy.length ? [[xy[0][0] - 1.5, xy[0][1]] as const, [xy[0][0] + 1.5, xy[0][1]] as const] : [];
  return (
    <View style={styles.spark} accessible={false}>
      {points.length ? (
        <Svg width="100%" height={SPARK_H} viewBox={`0 0 ${SPARK_W} ${SPARK_H}`} preserveAspectRatio="none">
          {points.length > 1 ? <Polyline points={all} fill="none" stroke={t.border} strokeWidth={2} strokeLinejoin="round" /> : null}
          <Polyline points={tail.map(([x, y]) => `${x},${y.toFixed(1)}`).join(' ')} fill="none" stroke={t.muted} strokeWidth={2} strokeLinecap="round" />
        </Svg>
      ) : null}
    </View>
  );
});

function Picker({
  visible,
  available,
  selected,
  sets,
  onSets,
  onClose,
}: {
  visible: boolean;
  available: LivePid[];
  selected: number[];
  // Named sets saved on this car.
  sets: ValueSet[];
  onSets: (next: ValueSet[]) => void;
  onClose: (next: number[]) => void;
}) {
  const t = useTheme();
  const { settings } = useSettings();
  const [draft, setDraft] = useState<number[]>(selected);
  const [query, setQuery] = useState('');
  const [name, setName] = useState('');
  const [mySets, setMySets] = useState<ValueSet[]>(sets);
  // The saved set the owner asked to delete; deleted only after the confirm.
  const [removing, setRemoving] = useState<ValueSet | null>(null);
  useEffect(() => {
    if (!visible) return;
    setDraft(selected);
    setQuery('');
    setName('');
    setMySets(sets);
    // Start fresh each time the sheet opens.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  const toggle = (pid: number) => setDraft((d) => (d.includes(pid) ? d.filter((x) => x !== pid) : [...d, pid]));
  const matches = filterPids(available, query);
  const changeSets = (next: ValueSet[]) => {
    setMySets(next);
    onSets(next);
  };
  const ids = available.map((p) => p.pid);

  // A native page sheet on iPhone: Cancel and Done in the bar, inset grouped
  // rows with a trailing checkmark in the tint.
  return (
    <SheetPage visible={visible} title="Choose values" onCancel={() => onClose(selected)} onDone={() => onClose(draft)}>
      <ScrollView contentContainerStyle={{ padding: space.lg, paddingBottom: 60 }} keyboardShouldPersistTaps="handled" keyboardDismissMode="interactive" automaticallyAdjustKeyboardInsets>
        <View style={{ marginBottom: space.md }}>
          <SearchField value={query} onChange={setQuery} placeholder="Search values, for example trim or temp" caps={false} />
        </View>
        <Text style={[styles.sheetNote, { color: t.muted }]}>
          Watching {draft.length} of {available.length}. Fewer values update faster.
        </Text>

        {!query.trim() ? (
          <Group header="Saved sets" help={SECTIONS.liveSets} footer={mySets.length ? 'Tap a set to load it. Values this car does not report are left out.' : undefined}>
            {mySets.map((s, i) => (
              <ListRow
                key={s.name}
                first={i === 0}
                title={s.name}
                value={`${s.pids.length} value${s.pids.length === 1 ? '' : 's'}`}
                noChevron
                control
                onPress={() => setDraft(loadSet(s, ids))}
                right={
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={`Delete the set ${s.name}`}
                    hitSlop={10}
                    onPress={() => setRemoving(s)}
                    style={styles.trash}
                  >
                    <Icon name="trash-can-outline" size={18} color={t.danger} />
                  </Pressable>
                }
              />
            ))}
            <View style={[styles.saveRow, { borderColor: t.border, borderTopWidth: mySets.length ? StyleSheet.hairlineWidth : 0 }]}>
              <Field value={name} onChange={setName} placeholder="Name for these values" returnKey="done" style={{ flex: 1 }} />
              <Button
                label="Save set"
                compact
                variant="secondary"
                disabled={!name.trim() || !draft.length}
                onPress={() => {
                  changeSets(saveSet(mySets, name, draft));
                  setName('');
                }}
              />
            </View>
          </Group>
        ) : null}

        {query.trim() && !matches.length ? <Notice text="No value matches. Try another word, for example speed, fuel or temp." /> : null}
        {PID_GROUPS.map((g) => {
          const items = matches.filter((p) => p.group === g);
          if (!items.length) return null;
          return (
            <Group key={g} header={g}>
              {items.map((p, i) => {
                const on = draft.includes(p.pid);
                return (
                  <ListRow
                    key={p.pid}
                    first={i === 0}
                    title={p.label}
                    value={toUserUnits(0, p.unit, settings).unit}
                    onPress={() => toggle(p.pid)}
                    noChevron
                    selected={on}
                  />
                );
              })}
            </Group>
          );
        })}
        <Button label="Clear selection" variant="ghost" onPress={() => setDraft([])} />
      </ScrollView>
      <ConfirmSheet
        visible={!!removing}
        title="Delete this set?"
        lines={removing ? [`${removing.name}, ${removing.pids.length} value${removing.pids.length === 1 ? '' : 's'}. This cannot be undone.`] : []}
        confirmLabel="Delete"
        onConfirm={() => {
          const s = removing;
          setRemoving(null);
          if (s) changeSets(removeSet(mySets, s.name));
        }}
        onCancel={() => setRemoving(null)}
      />
    </SheetPage>
  );
}

const styles = StyleSheet.create({
  headerRight: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  intro: { marginHorizontal: space.lg, marginBottom: space.md },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm, marginBottom: space.md },
  stepper: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: space.sm, marginBottom: space.md },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: space.md },
  tile: { flexGrow: 1, flexBasis: '45%', borderRadius: radius.lg, padding: space.md },
  tileLabel: { ...type.small, fontWeight: '600', marginBottom: space.xs },
  tileHead: { flexDirection: 'row', alignItems: 'center', gap: space.xs },
  tileAlert: { borderWidth: 2, padding: space.md - 2 },
  saveRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm, paddingHorizontal: space.lg, paddingVertical: space.md },
  trash: { paddingHorizontal: space.md, minHeight: 44, justifyContent: 'center' },
  tileValue: { ...type.tile, fontVariant: ['tabular-nums'] },
  unit: { ...type.sub, fontWeight: '500' },
  noReading: { ...type.body, lineHeight: type.tile.lineHeight },
  spark: { height: 28, flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'flex-start', marginTop: space.sm },
  minmax: { ...type.caption, marginTop: space.xs, fontVariant: ['tabular-nums'] },
  sheetNote: { ...type.small, marginBottom: space.lg, marginLeft: space.lg },
  maker: { borderRadius: radius.lg, padding: space.lg },
  makerHead: { ...type.sub, fontWeight: '700', marginBottom: space.xs },
  makerRow: { flexDirection: 'row', alignItems: 'center', gap: space.md, paddingVertical: 10, borderTopWidth: StyleSheet.hairlineWidth },
  makerLabel: { ...type.sub },
  makerSource: { ...type.caption, marginTop: 2 },
  makerValue: { ...type.sub, fontWeight: '700', fontVariant: ['tabular-nums'], textAlign: 'right' },
});
