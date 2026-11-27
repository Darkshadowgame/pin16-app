// One setting on the Customise screen: its name, the car's current value on
// the right (On, Off, or a value with its unit) and, for a 2-state setting, its
// switch in the row. A multi-value setting has no switch: the whole row opens
// its picker. Tags (Unconfirmed, Works on your car) sit under the name.
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { space, type, useTheme } from '../theme';
import { Icon } from '../ui';

export function SettingRow({
  title,
  value,
  first,
  tags,
  control,
  onPress,
  onTitlePress,
  expanded,
  hint,
  disabled,
  children,
}: {
  title: string;
  // What the car holds now, said in words: On, Off, 20 s, Flash.
  value?: string;
  first?: boolean;
  tags?: React.ReactNode;
  // A switch or a spinner at the right end (a 2-state setting).
  control?: React.ReactNode;
  // A multi-value setting: the whole row is one button that opens the picker.
  onPress?: () => void;
  // A 2-state setting: the name opens or closes its details.
  onTitlePress?: () => void;
  expanded?: boolean;
  // What the setting does, spoken after its name.
  hint?: string;
  disabled?: boolean;
  // Details and result lines under the name.
  children?: React.ReactNode;
}) {
  const t = useTheme();
  const border = { borderColor: t.border, borderTopWidth: first ? 0 : StyleSheet.hairlineWidth };
  const valueText = value ? (
    <Text
      // The switch speaks its own state, so the value beside it is not read twice.
      accessibilityElementsHidden={!!control}
      importantForAccessibility={control ? 'no-hide-descendants' : 'auto'}
      numberOfLines={2}
      style={[type.body, type.number, styles.value, { color: t.muted }]}
    >
      {value}
    </Text>
  ) : null;
  if (onPress) {
    return (
      <View style={border}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={[title, value].filter(Boolean).join('. ')}
          accessibilityHint={hint}
          disabled={disabled}
          onPress={onPress}
          style={({ pressed }) => [styles.row, { opacity: disabled ? 0.45 : 1, backgroundColor: pressed ? t.raised : 'transparent' }]}
        >
          <View style={styles.pickText}>
            <Text style={[type.body, { color: t.text }]}>{title}</Text>
            {tags}
          </View>
          {valueText}
          <Icon name="chevron-right" size={13} color={t.faint} />
        </Pressable>
        {children ? <View style={styles.extra}>{children}</View> : null}
      </View>
    );
  }
  return (
    <View style={border}>
      <View style={styles.row}>
        <View style={{ flex: 1 }}>
          {/* The row is a plain container: the details toggle and the switch are separate elements, so VoiceOver reaches each. */}
          <Pressable accessibilityRole="button" accessibilityHint={hint} accessibilityState={{ expanded: !!expanded }} onPress={onTitlePress} style={styles.titleButton}>
            <Text style={[type.body, { color: t.text }]}>{title}</Text>
            {tags}
          </Pressable>
          {children}
        </View>
        {valueText}
        {control}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: space.sm, paddingVertical: space.xs, paddingHorizontal: space.lg, minHeight: 56 },
  titleButton: { minHeight: 44, justifyContent: 'center', paddingVertical: space.xs },
  pickText: { flex: 1, paddingVertical: space.sm },
  extra: { paddingHorizontal: space.lg, paddingBottom: space.md },
  value: { flexShrink: 1, maxWidth: '45%', textAlign: 'right' },
});
