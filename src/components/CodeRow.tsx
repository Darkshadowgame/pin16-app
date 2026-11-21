// One row for a fault code, the same in every fault list (Health check,
// Workshop, the last health check and its changes): the code people look up
// as a chip, the fault's title, and one line beneath for its state or module.
// Tapping opens the code page.
import { router } from 'expo-router';
import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { DetailState, faultDetailLines, knownDetail, needsDetailRead, settleDetail } from '../diag/faultDetail';
import { faultMeaning } from '../diag/faults';
import { useSettings } from '../settings';
import { describeFailureType, STATE_LABEL, UdsFault } from '../obd/uds';
import { useConnection } from '../state';
import { MONO, space, type, useTheme } from '../theme';
import { Icon, tap } from '../ui';

export function CodeRow({
  code,
  label,
  title,
  sub,
  module,
  moduleId,
  state,
  first,
  right,
  detailModuleId,
}: {
  code: string;
  // The chip text when it differs from the code (P0011 for P0011B5).
  label?: string;
  title?: string;
  sub: string;
  module?: string;
  moduleId?: string;
  state?: string;
  first?: boolean;
  // A tag at the right end (New, Seen before, Cleared).
  right?: React.ReactNode;
  // A fault read from an older-protocol module: the module id, so Details can
  // read when it was logged, how often and its priority.
  detailModuleId?: string;
}) {
  const t = useTheme();
  const conn = useConnection();
  const brand = conn.vehicle?.brand;
  const { settings } = useSettings();
  const key = `${conn.vehicle?.vin ?? ''}|${detailModuleId ?? ''}|${code}`;
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [detail, setDetail] = useState<DetailState>(() => knownDetail(key));
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);
  // Reads the detail when it is opened and nothing good is held yet (a failed
  // read is tried again), and never while the list is loading.
  const toggle = () => {
    tap();
    const next = !open;
    setOpen(next);
    if (!next || !needsDetailRead(detail) || loading || !detailModuleId || !conn.client) return;
    const def = conn.client.moduleById(detailModuleId);
    if (!def) return;
    setLoading(true);
    conn.client
      .readFaultDetail(def, code)
      .catch(() => null)
      .then((d) => {
        const state = settleDetail(key, d);
        if (alive.current) {
          setDetail(state);
          setLoading(false);
        }
      });
  };
  const canDetail = !!detailModuleId && !!conn.client;
  const meaning = faultMeaning(code, { module, brand });
  const entry = meaning.entry;
  const serious = entry?.severity === 'high';
  return (
    <View>
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${code}. ${title ?? entry?.title ?? ''}. ${sub}`}
      onPress={() => {
        tap();
        router.push({ pathname: '/code/[code]', params: { code, ...(module ? { module } : {}), ...(moduleId ? { moduleId } : {}), ...(state ? { state } : {}) } });
      }}
      style={({ pressed }) => [styles.code, { borderColor: t.border, borderTopWidth: first ? 0 : StyleSheet.hairlineWidth, backgroundColor: pressed ? t.raised : 'transparent' }]}
    >
      <View style={[styles.codeChip, { backgroundColor: serious ? t.dangerSoft : t.sunken }]}>
        <Text style={[styles.codeId, { color: serious ? t.danger : t.text }]}>{label ?? code}</Text>
      </View>
      <View style={{ flex: 1 }}>
        <Text style={[type.callout, { color: t.text }]} numberOfLines={3}>
          {title ?? meaning.title}
        </Text>
        <Text style={[type.small, { color: t.muted, marginTop: 1 }]}>{sub}</Text>
      </View>
      {right ?? null}
      {canDetail ? (
        <Pressable accessibilityRole="button" accessibilityLabel={`Details for fault ${code}`} accessibilityState={{ expanded: open }} onPress={toggle} style={styles.info}>
          <Text style={[type.small, { color: t.accentText, fontWeight: '600' }]}>Details</Text>
          <Icon name={open ? 'chevron-up' : 'chevron-down'} size={14} color={t.accentText} />
        </Pressable>
      ) : null}
      <Icon name="chevron-right" size={13} color={t.faint} />
    </Pressable>
    {open && canDetail ? (
      <View style={[styles.detail, { borderColor: t.border }]}>
        {loading ? (
          <ActivityIndicator size="small" color={t.muted} style={styles.spinner} />
        ) : detail === 'unsupported' ? (
          <Text style={[type.small, { color: t.muted }]}>This module gives no detail for this fault</Text>
        ) : detail === 'failed' ? (
          <Text style={[type.small, { color: t.muted }]}>The detail could not be read. Tap Details to try again.</Text>
        ) : detail ? (
          faultDetailLines(detail, settings.speed === 'mph').map((l) => (
            <Text key={l} style={[type.small, { color: t.muted }]}>
              {l}
            </Text>
          ))
        ) : null}
      </View>
    ) : null}
    </View>
  );
}

// A fault read from a control module: its state in the words of STATE_LABEL
// ("Active now", "Stored"), the failure type and the warning light.
export function FaultRow({ fault, module, moduleId, first, detailModuleId }: { fault: UdsFault; module: string; moduleId?: string; first?: boolean; detailModuleId?: string }) {
  const brand = useConnection().vehicle?.brand;
  const ftb = describeFailureType(fault.failureType);
  // The same title and type the code page shows for this module.
  const title = faultMeaning(fault.code, { module, brand }).title;
  const sub = fault.kwp
    ? 'Stored in the module'
    : [STATE_LABEL[fault.state], fault.failureType ? ftb : null, fault.warningLamp ? 'Warning light on' : null].filter(Boolean).join(' · ');
  // The chip shows the code people look up (P0011); the type byte is in the line below.
  return <CodeRow label={fault.base || undefined} code={fault.code} title={title} sub={sub} module={module} moduleId={moduleId} state={STATE_LABEL[fault.state]} first={first} detailModuleId={fault.kwp ? (detailModuleId ?? moduleId) : undefined} />;
}

const styles = StyleSheet.create({
  code: { flexDirection: 'row', gap: space.md, paddingVertical: space.md, paddingLeft: space.lg, paddingRight: space.lg, borderTopWidth: StyleSheet.hairlineWidth, alignItems: 'center' },
  codeChip: { borderRadius: 6, paddingHorizontal: 7, paddingVertical: 4 },
  info: { minWidth: 44, minHeight: 44, flexDirection: 'row', gap: 2, alignItems: 'center', justifyContent: 'center' },
  spinner: { alignSelf: 'flex-start' },
  detail: { paddingLeft: space.lg + 56, paddingRight: space.lg, paddingBottom: space.md, gap: 2 },
  codeId: { fontSize: 13, fontWeight: '700', fontFamily: MONO, fontVariant: ['tabular-nums'] },
});
