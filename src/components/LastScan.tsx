// The last health check of a car, from History: readable with no adapter.
import { router } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { HistoryEntry, loadHistory, onHistory } from '../history';
import { SECTIONS } from '../help';
import { faultLabel } from '../diag/faults';
import { dateTimeText } from '../timeText';
import { StyleSheet, View } from 'react-native';
import { space, useTheme } from '../theme';
import { Group, Icon, ListRow, Pill } from '../ui';
import { CodeRow } from './CodeRow';

export function useLastScan(vin: string | undefined): HistoryEntry | null {
  const [last, setLast] = useState<HistoryEntry | null>(null);
  useEffect(() => {
    if (!vin) return;
    // The newest check that ran to the end; a check stopped early (leaving the
    // screen part-way) shows only when there is no finished one.
    const load = () =>
      loadHistory(vin).then((l) => {
        const scans = l.filter((e) => e.kind === 'scan');
        setLast(scans.find((e) => e.complete !== false) ?? scans[0] ?? null);
      });
    load();
    return onHistory(load);
  }, [vin]);
  return last;
}

// UDS codes carry a fault-type byte (P0011B5): people look up P0011.
export const shortCode = (code: string) => (/^[PCBU][0-9A-F]{4}[0-9A-F]{2}$/.test(code) ? code.slice(0, 5) : code);

// "9 Nov 2026, 17:02": the app's one date and time format (src/timeText.ts).
export const when = (at: number): string => dateTimeText(at);

// A saved fault with no text: the same words in every list and the report.
export const NO_MEANING = 'Meaning not in the library yet';

export function LastScan({ vin, entry, limit = 12 }: { vin: string; entry: HistoryEntry; limit?: number }) {
  const t = useTheme();
  const all = entry.faults ?? [];
  const faults = all.slice(0, limit);
  // The saved faults by module, in the order they were found: the same list
  // as a new check, with each module opening to its faults.
  const modules = [...new Set(faults.map((f) => f.module))];
  const [openIds, setOpenIds] = useState<Record<string, boolean>>({});
  return (
    <Group
      header={`Last health check, ${when(entry.at)}${entry.complete === false ? ' (stopped early)' : ''}`}
      footer={all.length ? 'Tap a module to see its faults, then a fault for what it means and, where Pin16 knows them, the likely causes and fixes.' : undefined}
      help={SECTIONS.lastScan}
    >
      {entry.noAnswer ? (
        <ListRow
          first
          icon="alert-circle-outline"
          iconColour="gold"
          title="No control module answered"
          subtitle="Only the engine’s standard codes were read, so this is not a clean result."
          noChevron
        />
      ) : null}
      {modules.length ? (
        modules.map((m, k) => {
          const list = faults.filter((f) => f.module === m);
          const open = openIds[m] ?? modules.length === 1;
          const word = `${list.length} fault${list.length === 1 ? '' : 's'}`;
          return (
            <View key={m}>
              <ListRow
                first={k === 0 && !entry.noAnswer}
                icon="alert-circle"
                iconColour="red"
                title={m}
                label={`${m}. ${word}`}
                noChevron
                expanded={open}
                right={
                  <View style={styles.moduleRight}>
                    <Pill text={word} tone="danger" />
                    <Icon name={open ? 'chevron-up' : 'chevron-down'} size={13} color={t.faint} />
                  </View>
                }
                onPress={() => setOpenIds((old) => ({ ...old, [m]: !open }))}
              />
              {open
                ? list.map((f, i) => <CodeRow key={`${f.module}-${f.code}-${i}`} code={f.code} label={shortCode(f.code)} title={faultLabel(f) ?? NO_MEANING} sub={f.module} module={f.module} />)
                : null}
            </View>
          );
        })
      ) : entry.noAnswer ? null : (
        <ListRow first icon="check-circle-outline" iconColour="green" title="No faults found" subtitle={entry.detail} noChevron />
      )}
      {all.length > limit ? <ListRow title={`${all.length - limit} more in History`} onPress={() => router.push({ pathname: '/history', params: { vin } })} /> : null}
    </Group>
  );
}

const styles = StyleSheet.create({
  moduleRight: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
});
