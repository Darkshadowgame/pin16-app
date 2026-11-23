// Find a switch (older VW modules): every value group a module gave Learn my
// car is read round after round on one channel. The first full round is the
// baseline; values that change after it are listed, so the one that moves when
// a switch is pressed shows up. Read-only: nothing is written to the car.
// Logic: src/diag/switchFinder.ts.
import { router, useIsFocused, useLocalSearchParams } from 'expo-router';
import React, { useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { NamedText, NameValueForm } from '../components/NameValue';
import { lookupValueName } from '../data/valueNames';
import { useValueNames } from '../data/valueNamesStore';
import { groupLabels } from '../data/groupLabels';
import { addReading, baselineReady, changedFields, newTracker, resetBaseline, SwitchTracker } from '../diag/switchFinder';
import { SECTIONS } from '../help';
import { useStayAwake } from '../keepAwake';
import { LeaveRunGuard } from '../leaveRun';
import { MONO, space, type, useTheme } from '../theme';
import { useConnection } from '../state';
import { announce, Button, Chips, Group, ListRow, NeedsConnection, Notice, Screen } from '../ui';

const INSTRUCTIONS = 'Start, wait for the first round, then press and release the switch you are looking for. The values that change are listed.';

export default function FindSwitch() {
  const t = useTheme();
  const conn = useConnection();
  const client = conn.client;
  const v = conn.vehicle;
  const params = useLocalSearchParams<{ id?: string }>();
  const focused = useIsFocused();
  // Modules that have value groups found on this car.
  const withGroups = Object.entries(v?.groupsFound ?? {})
    .filter(([, g]) => Object.keys(g).length)
    .map(([id]) => id);
  const [moduleId, setModuleId] = useState<string | undefined>(params.id || withGroups[0]);
  const [running, setRunning] = useState(false);
  const [tracker, setTracker] = useState<SwitchTracker | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [seconds, setSeconds] = useState(0);
  const names = useValueNames(v?.vin);
  // The changed field whose Name this value form is open (group.field).
  const [naming, setNaming] = useState<string | null>(null);
  const liveRef = useRef(false);
  const trackerRef = useRef<SwitchTracker | null>(null);
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      liveRef.current = false;
    };
  }, []);
  // Another screen opened on top: stop, or that screen would wait behind this one.
  useEffect(() => {
    if (!focused) liveRef.current = false;
  }, [focused]);
  useStayAwake('find-switch', running);
  useEffect(() => {
    if (!running) return undefined;
    const started = Date.now();
    const id = setInterval(() => setSeconds(Math.floor((Date.now() - started) / 1000)), 1000);
    return () => clearInterval(id);
  }, [running]);
  // The tool exists to show which value moves: each new or repeated change is said aloud.
  const spoken = useRef(new Map<string, number>());
  useEffect(() => {
    if (!tracker || !baselineReady(tracker)) {
      spoken.current.clear();
      return;
    }
    for (const f of changedFields(tracker)) {
      const id = `${f.group}.${f.field}`;
      if (spoken.current.get(id) !== f.changes) {
        spoken.current.set(id, f.changes);
        announce(`Group ${f.group} field ${f.field}, now ${f.now}`);
      }
    }
  }, [tracker]);

  if (!client || !v || !client.supportsModules) {
    return (
      <Screen>
        <NeedsConnection title="Connect your car to find a switch" />
      </Screen>
    );
  }
  const def = moduleId ? client.moduleById(moduleId) : undefined;
  const groups = def
    ? Object.keys(v.groupsFound?.[def.id] ?? {})
        .map(Number)
        .filter((g) => Number.isFinite(g))
        .sort((a, b) => a - b)
    : [];

  const stop = () => {
    liveRef.current = false;
  };
  const start = async () => {
    if (!def || !groups.length || liveRef.current) return;
    setMessage(null);
    setSeconds(0);
    trackerRef.current = newTracker(groups, Date.now());
    setTracker(trackerRef.current);
    liveRef.current = true;
    setRunning(true);
    let ok: boolean | void = true;
    let reported = false;
    try {
      if (client.routeOf(def) !== 'tp20') await client.findTp20Modules(() => !liveRef.current).catch(() => []);
      if (liveRef.current)
        ok = await client.watchMeasuringGroups(
          def,
          groups,
          (g, cells) => {
            if (!liveRef.current || !trackerRef.current) return;
            const before = trackerRef.current;
            const next = addReading(before, g, cells, Date.now());
            trackerRef.current = next;
            // Drawn when a value changed or a round ended, not on every answer.
            if (next.rounds !== before.rounds || next.fields !== before.fields) setTracker(next);
          },
          () => liveRef.current,
        );
    } catch (e) {
      // A lost adapter link ends the run; what was found stays on screen.
      if (alive.current) setMessage(`The run stopped: ${e instanceof Error ? e.message : String(e)} Check the adapter, then tap Start.`);
      reported = true;
      ok = true;
    }
    // Still true here means nobody tapped Stop: the link or the module ended the run.
    const stoppedByUser = !liveRef.current;
    liveRef.current = false;
    if (!alive.current) return;
    setRunning(false);
    if (ok !== false && !stoppedByUser && !reported && focused) setMessage('The link to the car was lost. Reconnect and start again.');
    if (ok === false) setMessage(`${def.name} did not answer on the older VW protocol. Check the ignition is on, then tap Start.`);
  };
  const again = () => {
    if (!trackerRef.current) return;
    trackerRef.current = resetBaseline(trackerRef.current, Date.now());
    setTracker(trackerRef.current);
  };

  const changed = tracker ? changedFields(tracker) : [];
  const ready = !!tracker && baselineReady(tracker);

  return (
    <Screen>
      <LeaveRunGuard active={running} onStop={stop} />
      {withGroups.length > 1 ? (
        <Chips
          options={withGroups.map((id) => ({ id, label: client.moduleById(id)?.name ?? id }))}
          value={moduleId ?? ''}
          disabled={running}
          style={{ marginBottom: space.lg }}
          onPick={(id) => {
            setModuleId(id);
            setTracker(null);
            trackerRef.current = null;
          }}
        />
      ) : null}

      {!def || !groups.length ? (
        <Group header="Find a switch" help={SECTIONS.findSwitch}>
          <ListRow first icon="information-outline" iconColour="grey" title="No value groups found yet" subtitle={`${def ? `${def.name} has none` : 'No older VW module has any'} saved for this car. Run Learn my car first.`} onPress={() => router.push('/learn-car')} />
        </Group>
      ) : (
        <>
          <Group header={def.name} help={SECTIONS.findSwitch} footer={`${groups.length} value group${groups.length === 1 ? '' : 's'} read: ${groups.join(', ')}.`}>
            <View style={styles.pad}>
              <View style={styles.buttons}>
                <View style={{ flex: 1 }}>
                  <Button label="Start" icon="play" disabled={running} onPress={() => void start()} />
                </View>
                <View style={{ flex: 1 }}>
                  <Button label="Stop" icon="stop" variant="secondary" disabled={!running} onPress={stop} />
                </View>
              </View>
              <Button label="Set baseline again" variant="ghost" disabled={!tracker} onPress={again} />
              <Text style={[type.sub, { color: t.muted }]}>{INSTRUCTIONS}</Text>
              <Text style={[type.small, type.number, { color: t.muted }]}>
                {!tracker
                  ? 'Not started.'
                  : !ready
                    ? `Reading the first round${running ? `, ${seconds} s` : ''}.`
                    : `Round time ${((tracker.lastRoundMs ?? 0) / 1000).toFixed(1)} s. Rounds ${tracker.rounds}.${running ? '' : ' Stopped.'}`}
              </Text>
            </View>
          </Group>

          {message ? <Notice tone="danger" icon="alert-circle-outline" text={message} /> : null}

          {tracker ? (
            <Group header={changed.length ? `Changed since the baseline, ${changed.length}` : 'Changed since the baseline'} footer="Latest change first. Values that never change are not listed.">
              {!ready ? (
                <ListRow first icon="timer-sand" iconColour="grey" title="Waiting for the first round" noChevron />
              ) : changed.length ? (
                changed.map((f, i) => {
                  const label = groupLabels(def.code, f.group)?.[f.field - 1];
                  const own = lookupValueName(names, def.id, f.group, f.field);
                  const id = `${f.group}.${f.field}`;
                  return (
                    <View key={id} style={{ borderColor: t.border, borderTopWidth: i ? StyleSheet.hairlineWidth : 0, paddingHorizontal: space.lg }}>
                      <View style={styles.row}>
                        <View style={{ flex: 1 }}>
                          {own ? <NamedText own={own} fallback="" /> : null}
                          <Text style={[own ? type.small : type.body, { color: own ? t.muted : t.text }]}>
                            Group {f.group}, field {f.field}
                          </Text>
                          {label && !own ? <Text style={[type.small, { color: t.muted }]}>{label}</Text> : null}
                          <Text style={[type.small, { color: t.muted }]}>Changed {f.changes} time{f.changes === 1 ? '' : 's'}</Text>
                          {naming !== id ? (
                            <Pressable accessibilityRole="button" accessibilityLabel={`${own ? 'Rename' : 'Name'} this value, group ${f.group} field ${f.field}`} onPress={() => setNaming(id)} hitSlop={8} style={{ alignSelf: 'flex-start', minHeight: 44, justifyContent: 'center' }}>
                              <Text style={[type.sub, { color: t.accentText }]}>{own ? 'Rename this value' : 'Name this value'}</Text>
                            </Pressable>
                          ) : null}
                        </View>
                        <View style={{ alignItems: 'flex-end' }}>
                          <Text style={[type.small, { color: t.muted, fontFamily: f.isBits ? MONO : undefined }]}>Was {f.baseline}</Text>
                          <Text style={[type.body, type.number, { color: t.accentText, fontFamily: f.isBits ? MONO : undefined }]}>Now {f.now}</Text>
                        </View>
                      </View>
                      {naming === id ? (
                        <NameValueForm v={v} target={{ moduleId: def.id, moduleCode: def.code, group: f.group, field: f.field, unit: f.unit, baseline: f.baseline, changed: f.now }} existing={own} onClose={() => setNaming(null)} />
                      ) : null}
                    </View>
                  );
                })
              ) : (
                <ListRow first icon="gesture-tap" iconColour="grey" title="Nothing has changed yet" subtitle="Press and release the switch." noChevron />
              )}
            </Group>
          ) : null}
        </>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  pad: { padding: space.lg, gap: space.sm },
  buttons: { flexDirection: 'row', gap: space.sm },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.md, paddingVertical: space.md },
});
