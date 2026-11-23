// "Name this value": a short name and an optional note for one value of an
// older VW module. Saved on the phone (src/data/valueNamesStore.ts) and sent to
// the private findings store like other findings; sending never holds up the screen.
import React, { useState } from 'react';
import { Text, View } from 'react-native';
import { nameKey, ValueName, YOUR_NAME } from '../data/valueNames';
import { deleteValueName, saveValueName } from '../data/valueNamesStore';
import { sendBack } from '../share/sendBack';
import { space, type, useTheme } from '../theme';
import { Button, Field } from '../ui';
import type { Vehicle } from '../vehicle/garage';

export interface NameTarget {
  moduleId: string;
  moduleCode?: string;
  group: number;
  field: number;
  unit: string;
  // What the owner saw: the first round's value and the changed value.
  baseline?: string;
  changed?: string;
}

// The label line with the owner's name marked.
export function NamedText({ builtIn, own, fallback, style }: { builtIn?: string | null; own?: ValueName; fallback: string; style?: object }) {
  const t = useTheme();
  return (
    <Text style={[type.body, { color: t.text }, style]}>
      {own ? own.name : (builtIn ?? fallback)}
      {own ? <Text style={[type.small, { color: t.accentText }]}> {YOUR_NAME}</Text> : null}
    </Text>
  );
}

export function sendName(v: Pick<Vehicle, 'vin' | 'brand' | 'model' | 'year' | 'platform' | 'ids' | 'knowledge'>, target: NameTarget, name: string, note: string): void {
  const part = v.ids?.modules?.find((m) => m.id === target.moduleId)?.part ?? v.knowledge?.[target.moduleId]?.part ?? null;
  void sendBack('names', v.vin, {
    car: { brand: v.brand, model: v.model, year: v.year, platform: v.platform },
    module: { id: target.moduleId, code: target.moduleCode ?? null, part },
    group: target.group,
    field: target.field,
    name: name.trim(),
    note: note.trim() || null,
    unit: target.unit,
    baseline: target.baseline ?? null,
    changed: target.changed ?? null,
  }).catch(() => undefined);
}

export function NameValueForm({ v, target, existing, onClose }: { v: Vehicle; target: NameTarget; existing?: ValueName; onClose: () => void }) {
  const t = useTheme();
  const [name, setName] = useState(existing?.name ?? '');
  const [note, setNote] = useState(existing?.note ?? '');
  const save = () => {
    if (!name.trim()) return;
    const key = nameKey(target.moduleId, target.group, target.field);
    void saveValueName(v.vin, key, name, note);
    // Only a new or changed name is sent.
    if (name.trim() !== existing?.name || note.trim() !== (existing?.note ?? '')) sendName(v, target, name, note);
    onClose();
  };
  return (
    <View style={{ gap: space.sm, paddingVertical: space.sm }}>
      <Field label="Name" value={name} onChange={setName} placeholder="Boot handle pressed" maxLength={60} accessibilityLabel="Name for this value" />
      <Field label="Note, optional" value={note} onChange={setNote} placeholder="What you saw" multiline minHeight={56} accessibilityLabel="Note, optional" />
      <Text style={[type.small, { color: t.muted }]}>Saved on this phone and sent to your private findings store, so it can be built into the app.</Text>
      <Button label="Save name" variant="secondary" disabled={!name.trim()} onPress={save} />
      {existing ? (
        <Button
          label="Remove name"
          variant="ghost"
          onPress={() => {
            void deleteValueName(v.vin, nameKey(target.moduleId, target.group, target.field));
            onClose();
          }}
        />
      ) : null}
      <Button label="Cancel" variant="ghost" onPress={onClose} />
    </View>
  );
}
