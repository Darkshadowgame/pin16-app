// The coding history of one module: each entry with its date, where it came
// from and what changed against the entry before it. Used on the Workshop page
// (with Put back this coding) and, read-only, from Customise.
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { CodingEntry, diffLines, shortNumber, SOURCE_TEXT, spacedHex } from '../coding/history';
import { stamp } from '../diag/timeline';
import { MONO, space, type, useTheme } from '../theme';
import { Button } from '../ui';

// Why an entry cannot be written back, or null when it can.
export function putBackBlock(entry: CodingEntry, currentHex: string | null): string | null {
  if (!currentHex) return 'The module’s coding has not been read yet.';
  if (entry.hex.length !== currentHex.length) return `This coding has ${entry.hex.length / 2} bytes and the module’s coding has ${currentHex.length / 2}, so it cannot be put back.`;
  return null;
}

export function CodingHistoryList({ entries, currentHex, busy, onPutBack }: { entries: CodingEntry[]; currentHex?: string | null; busy?: boolean; onPutBack?: (e: CodingEntry) => void }) {
  const t = useTheme();
  return (
    <>
      {entries.map((e, i) => {
        const { date, time } = stamp(e.at);
        const older = entries[i + 1];
        const lines = older ? diffLines(older.hex, e.hex) : [];
        const num = shortNumber(e.hex);
        const same = !!currentHex && e.hex === currentHex;
        const block = onPutBack && !same ? putBackBlock(e, currentHex ?? null) : null;
        return (
          <View key={`${e.at}-${i}`} style={[styles.entry, { borderColor: t.border, borderTopWidth: i ? StyleSheet.hairlineWidth : 0 }]}>
            <Text style={[type.body, { color: t.text }]}>
              {date} {time}
            </Text>
            <Text style={[type.small, { color: t.muted }]}>
              {SOURCE_TEXT[e.source]}
              {same ? ' · This is the coding now' : ''}
            </Text>
            {e.note ? <Text style={[type.small, { color: t.text }]}>{e.note}</Text> : null}
            <Text selectable style={[type.small, { color: t.muted, fontFamily: MONO, marginTop: 2 }]}>
              {spacedHex(e.hex)}
              {num ? ` (${num})` : ''}
            </Text>
            {older ? (
              lines.length ? (
                lines.map((l) => (
                  <Text key={l} style={[type.small, { color: t.accentText, fontFamily: MONO }]}>
                    {l}
                  </Text>
                ))
              ) : (
                <Text style={[type.small, { color: t.muted }]}>No change against the entry before.</Text>
              )
            ) : (
              <Text style={[type.small, { color: t.muted }]}>The first coding kept for this module.</Text>
            )}
            {onPutBack && !same ? (
              block ? (
                <Text style={[type.small, { color: t.muted, marginTop: space.xs }]}>{block}</Text>
              ) : (
                <View style={{ marginTop: space.sm, alignSelf: 'flex-start' }}>
                  <Button label="Put back this coding" variant="secondary" compact disabled={busy} onPress={() => onPutBack(e)} />
                </View>
              )
            ) : null}
          </View>
        );
      })}
    </>
  );
}

const styles = StyleSheet.create({
  entry: { paddingHorizontal: space.lg, paddingVertical: space.md, gap: 1 },
});
