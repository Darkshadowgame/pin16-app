import React, { useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { addHistory } from '../history';
import { allowSleep, stayAwake } from '../keepAwake';
import { LeaveRunGuard } from '../leaveRun';
import { CALIBRATIONS, CALIBRATIONS_NOTE, Calibration, clock, endText, englishFor, historyFor, didNotStart, reportLines } from '../service/calibrations';
import { sendLogNow } from '../share/sendLog';
import { useConnection } from '../state';
import { MONO, space, type, useTheme } from '../theme';
import { Button, Group, NeedsConnection, Notice, Screen, success } from '../ui';

// Heater flap and throttle body calibrations on a PQ35 car: a basic setting
// started on the module, what the module reports shown as sent, a time
// counter, and Finish. Pin16 does not judge the result.
export default function Calibrations() {
  const t = useTheme();
  const conn = useConnection();
  const client = conn.client;
  const v = conn.vehicle;
  const [running, setRunning] = useState<string | null>(null);
  const [now, setNow] = useState(Date.now());
  const [live, setLive] = useState<Record<string, string[]>>({});
  const [outcome, setOutcome] = useState<Record<string, string>>({});
  const [tech, setTech] = useState<string | null>(null);
  const [ranIds, setRanIds] = useState<string[]>([]);
  const started = useRef(0);
  const stop = useRef(false);
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      stop.current = true;
    };
  }, []);
  // The time counter.
  useEffect(() => {
    if (!running) return undefined;
    const id = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(id);
  }, [running]);

  if (!client || !v) {
    return (
      <Screen>
        <NeedsConnection title="Connect your car to run a calibration" />
      </Screen>
    );
  }
  if (v.group !== 'vag' || v.platform !== 'PQ35') {
    return (
      <Screen>
        <Notice icon="information-outline" text="Calibrations are set up for VW group cars on the PQ35 platform, such as the 2007 SEAT Leon." />
      </Screen>
    );
  }

  const start = async (c: Calibration) => {
    const def = client.moduleById(c.module);
    stop.current = false;
    started.current = Date.now();
    setNow(Date.now());
    setRunning(c.id);
    setLive((o) => ({ ...o, [c.id]: [] }));
    setOutcome((o) => ({ ...o, [c.id]: '' }));
    stayAwake('calibration');
    let last: string[] = [];
    let text: string;
    let end: Awaited<ReturnType<typeof client.runBasicSetting>> = null;
    try {
      const wrong = await conn.verifyCar();
      if (wrong) throw new Error(wrong);
      end = def
        ? await client.runBasicSetting(def, c.group, {
            onUpdate: (value) => {
              last = reportLines(value);
              if (alive.current) setLive((o) => ({ ...o, [c.id]: last }));
            },
            cancelled: () => stop.current,
            maxMs: c.maxSeconds * 1000,
          })
        : null;
      text = endText(end, c.maxSeconds);
      if (end === 'cancelled' || end === 'time') success();
    } catch (e) {
      // The link was lost: the run may have started, so it is not "did not start".
      end = 'failed';
      text = e instanceof Error ? e.message : String(e);
    } finally {
      allowSleep('calibration');
    }
    const ranMs = Date.now() - started.current;
    // Kept whether or not this page is still open. A run that never started is
    // logged as "did not start", with the reason and no run time.
    const entry = historyFor(c.title, end, text, ranMs, last);
    await addHistory({ vin: v.vin, kind: 'calibration', title: entry.title, detail: entry.detail, odometerKm: v.odometerKm });
    void sendLogNow('Calibrations', v);
    if (alive.current) {
      setOutcome((o) => ({ ...o, [c.id]: `${entry.detail} Saved to History.` }));
      if (!didNotStart(end)) setRanIds((r) => [...r, c.id]);
      setRunning(null);
    }
  };

  return (
    <Screen>
      <Notice icon="information-outline" tone="info" text={CALIBRATIONS_NOTE} />
      {CALIBRATIONS.map((c) => {
        const mine = running === c.id;
        // Only the calibration that can run now is orange: the first one not
        // yet run on this visit, and only while nothing else is running.
        const next = CALIBRATIONS.find((x) => !ranIds.includes(x.id)) ?? CALIBRATIONS[0];
        const primary = !running && next.id === c.id;
        const lines = live[c.id] ?? [];
        return (
          <Group key={c.id} header={c.title}>
            <View style={styles.body}>
              <Text style={[type.sub, { color: t.muted }]}>{c.summary}</Text>
              {mine || lines.length ? (
                <View style={[styles.report, { backgroundColor: t.sunken }]}>
                  {lines.length ? (
                    lines.map((l, i) => (
                      <View key={`${i}-${l}`}>
                        <Text selectable style={[type.body, { color: t.text, fontFamily: MONO }]}>
                          {l}
                        </Text>
                        {englishFor(l) ? <Text style={[type.small, { color: t.muted }]}>{englishFor(l)}</Text> : null}
                      </View>
                    ))
                  ) : (
                    <Text style={[type.small, { color: t.muted }]}>Waiting for the module to report.</Text>
                  )}
                </View>
              ) : null}
              {mine ? (
                <Text style={[type.body, type.number, { color: t.text }]}>
                  {clock(now - started.current)} of up to {clock(c.maxSeconds * 1000)}
                </Text>
              ) : null}
              {outcome[c.id] ? <Text style={[type.small, { color: t.muted }]}>{outcome[c.id]}</Text> : null}
              {mine ? <Button label="Finish" variant="secondary" onPress={() => (stop.current = true)} /> : <Button label="Start" icon="play" variant={primary ? 'primary' : 'secondary'} disabled={!!running} onPress={() => start(c)} />}
              <Pressable accessibilityRole="button" accessibilityState={{ expanded: tech === c.id }} onPress={() => setTech(tech === c.id ? null : c.id)} style={styles.tech}>
                <Text style={[type.small, { color: t.accentText }]}>Technical</Text>
              </Pressable>
              {tech === c.id ? <Text style={[type.small, { color: t.muted }]}>{c.technical}</Text> : null}
            </View>
          </Group>
        );
      })}
      <LeaveRunGuard active={!!running} onStop={() => (stop.current = true)} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  body: { padding: space.lg, gap: space.sm },
  tech: { minHeight: 44, justifyContent: 'center', alignSelf: 'flex-start' },
  report: { borderRadius: 10, padding: space.md, gap: 4 },
});
