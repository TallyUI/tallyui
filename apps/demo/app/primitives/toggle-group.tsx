import { useState } from 'react';
import { View, Text, ScrollView, StyleSheet } from 'react-native';
import { Stack } from 'expo-router';
import { ToggleGroup } from '@tallyui/primitives';

export default function ToggleGroupScreen() {
  const [singleValue, setSingleValue] = useState<string | undefined>('center');
  const [multipleValue, setMultipleValue] = useState<string[]>(['bold']);

  return (
    <>
      <Stack.Screen options={{ title: 'Toggle Group' }} />
      <ScrollView style={s.screen} contentContainerStyle={s.container}>
        {/* ---- Single ---- */}
        <Text style={s.heading}>Single Selection</Text>
        <Text style={s.info}>
          Only one item can be active at a time. Selected: {singleValue || '(none)'}
        </Text>

        <ToggleGroup.Root
          type="single"
          value={singleValue}
          onValueChange={(val) => setSingleValue(val as string)}
          style={s.group}
        >
          <ToggleGroup.Item value="left" style={[s.item, singleValue === 'left' && s.itemActive]}>
            <Text style={[s.itemText, singleValue === 'left' && s.itemTextActive]}>Left</Text>
          </ToggleGroup.Item>
          <ToggleGroup.Item value="center" style={[s.item, singleValue === 'center' && s.itemActive]}>
            <Text style={[s.itemText, singleValue === 'center' && s.itemTextActive]}>Center</Text>
          </ToggleGroup.Item>
          <ToggleGroup.Item value="right" style={[s.item, singleValue === 'right' && s.itemActive]}>
            <Text style={[s.itemText, singleValue === 'right' && s.itemTextActive]}>Right</Text>
          </ToggleGroup.Item>
        </ToggleGroup.Root>

        {/* ---- Multiple ---- */}
        <Text style={s.heading}>Multiple Selection</Text>
        <Text style={s.info}>
          Multiple items can be active. Selected: {multipleValue.length ? multipleValue.join(', ') : '(none)'}
        </Text>

        <ToggleGroup.Root
          type="multiple"
          value={multipleValue}
          onValueChange={(val) => setMultipleValue(val as string[])}
          style={s.group}
        >
          {['bold', 'italic', 'underline'].map((val) => (
            <ToggleGroup.Item
              key={val}
              value={val}
              style={[s.item, multipleValue.includes(val) && s.itemActive]}
            >
              <Text style={[s.itemText, multipleValue.includes(val) && s.itemTextActive]}>
                {val === 'bold' ? 'B' : val === 'italic' ? 'I' : 'U'}
              </Text>
            </ToggleGroup.Item>
          ))}
        </ToggleGroup.Root>

        {/* ---- Disabled Group ---- */}
        <Text style={s.heading}>Disabled</Text>
        <ToggleGroup.Root
          type="single"
          defaultValue="a"
          disabled
          style={s.group}
        >
          <ToggleGroup.Item value="a" style={[s.item, s.disabledItem]}>
            <Text style={[s.itemText, s.disabledText]}>A</Text>
          </ToggleGroup.Item>
          <ToggleGroup.Item value="b" style={[s.item, s.disabledItem]}>
            <Text style={[s.itemText, s.disabledText]}>B</Text>
          </ToggleGroup.Item>
          <ToggleGroup.Item value="c" style={[s.item, s.disabledItem]}>
            <Text style={[s.itemText, s.disabledText]}>C</Text>
          </ToggleGroup.Item>
        </ToggleGroup.Root>
      </ScrollView>
    </>
  );
}

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#fff' },
  container: { padding: 16, gap: 12 },
  heading: { fontSize: 18, fontWeight: '700', marginTop: 12 },
  info: { fontSize: 14, color: '#6b7280' },
  group: {
    flexDirection: 'row',
    gap: 4,
    backgroundColor: '#f3f4f6',
    borderRadius: 10,
    padding: 4,
  },
  item: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 8,
    alignItems: 'center',
  },
  itemActive: {
    backgroundColor: '#6366f1',
  },
  itemText: { fontSize: 14, fontWeight: '600', color: '#374151' },
  itemTextActive: { color: '#fff' },
  disabledItem: {
    backgroundColor: 'transparent',
  },
  disabledText: { color: '#9ca3af' },
});
