import { useState } from 'react';
import { View, Text, Pressable, ScrollView, StyleSheet } from 'react-native';
import { Stack } from 'expo-router';
import { Select, PortalHost } from '@tallyui/primitives';

const fruits = [
  { value: 'apple', label: 'Apple' },
  { value: 'banana', label: 'Banana' },
  { value: 'cherry', label: 'Cherry' },
  { value: 'date', label: 'Date' },
  { value: 'elderberry', label: 'Elderberry' },
];

type Option = { value: string; label: string };

export default function SelectScreen() {
  const [controlled, setControlled] = useState<Option | undefined>(undefined);

  return (
    <>
      <Stack.Screen options={{ title: 'Select' }} />
      <ScrollView style={s.screen} contentContainerStyle={s.container}>
        {/* ---- Uncontrolled ---- */}
        <Text style={s.heading}>Uncontrolled Select</Text>

        <Select.Root>
          <Select.Trigger style={s.trigger}>
            <Select.Value placeholder="Pick a fruit..." style={s.triggerText} />
            <Text style={s.chevron}>&#9662;</Text>
          </Select.Trigger>

          <Select.Portal>
            <Select.Overlay style={s.overlay} />
            <Select.Content style={s.content} disablePositioningStyle>
              {fruits.map((f) => (
                <Select.Item key={f.value} value={f.value} label={f.label} style={s.item}>
                  <Select.ItemText style={s.itemText} />
                  <Select.ItemIndicator>
                    <Text style={s.check}>&#10003;</Text>
                  </Select.ItemIndicator>
                </Select.Item>
              ))}
            </Select.Content>
          </Select.Portal>
        </Select.Root>

        {/* ---- Controlled ---- */}
        <Text style={s.heading}>Controlled Select</Text>
        <Text style={s.info}>
          Current value: {controlled ? controlled.label : '(none)'}
        </Text>

        <Select.Root value={controlled} onValueChange={setControlled}>
          <Select.Trigger style={s.trigger}>
            <Select.Value placeholder="Pick a fruit..." style={s.triggerText} />
            <Text style={s.chevron}>&#9662;</Text>
          </Select.Trigger>

          <Select.Portal>
            <Select.Overlay style={s.overlay} />
            <Select.Content style={s.content} disablePositioningStyle>
              {fruits.map((f) => (
                <Select.Item key={f.value} value={f.value} label={f.label} style={s.item}>
                  <Select.ItemText style={s.itemText} />
                  <Select.ItemIndicator>
                    <Text style={s.check}>&#10003;</Text>
                  </Select.ItemIndicator>
                </Select.Item>
              ))}
            </Select.Content>
          </Select.Portal>
        </Select.Root>

        <Pressable onPress={() => setControlled(undefined)}>
          <Text style={s.btn}>Reset</Text>
        </Pressable>
      </ScrollView>
      <PortalHost />
    </>
  );
}

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#fff' },
  container: { padding: 16, gap: 12 },
  heading: { fontSize: 18, fontWeight: '700', marginTop: 12 },
  info: { fontSize: 14, color: '#6b7280' },
  trigger: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: 8,
    padding: 12,
    backgroundColor: '#f9fafb',
  },
  triggerText: { fontSize: 15, color: '#111827' },
  chevron: { fontSize: 14, color: '#6b7280' },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.2)',
  },
  content: {
    position: 'absolute',
    top: '35%',
    left: 20,
    right: 20,
    backgroundColor: '#fff',
    borderRadius: 10,
    padding: 6,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.12,
    shadowRadius: 10,
    elevation: 6,
  },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 12,
    borderRadius: 6,
  },
  itemText: { fontSize: 15, color: '#111827' },
  check: { color: '#6366f1', fontWeight: '700', fontSize: 16 },
  btn: {
    backgroundColor: '#e5e7eb',
    color: '#374151',
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 8,
    fontSize: 15,
    fontWeight: '600',
    textAlign: 'center',
    overflow: 'hidden',
  },
});
