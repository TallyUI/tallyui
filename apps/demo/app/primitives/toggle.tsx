import { useState } from 'react';
import { View, Text, ScrollView, StyleSheet } from 'react-native';
import { Stack } from 'expo-router';
import { Toggle } from '@tallyui/primitives';

export default function ToggleScreen() {
  const [controlled, setControlled] = useState(false);

  return (
    <>
      <Stack.Screen options={{ title: 'Toggle' }} />
      <ScrollView style={s.screen} contentContainerStyle={s.container}>
        {/* ---- Uncontrolled ---- */}
        <Text style={s.heading}>Uncontrolled</Text>
        <View style={s.row}>
          <Toggle.Root style={s.toggle}>
            <Text style={s.toggleText}>B</Text>
          </Toggle.Root>
          <Toggle.Root style={s.toggle}>
            <Text style={s.toggleText}>I</Text>
          </Toggle.Root>
          <Toggle.Root style={s.toggle}>
            <Text style={s.toggleText}>U</Text>
          </Toggle.Root>
        </View>

        <Text style={s.heading}>Default Pressed</Text>
        <Toggle.Root defaultPressed style={[s.toggle, s.togglePressed]}>
          <Text style={[s.toggleText, s.toggleTextPressed]}>Starred</Text>
        </Toggle.Root>

        {/* ---- Controlled ---- */}
        <Text style={s.heading}>Controlled</Text>
        <Text style={s.info}>State: {controlled ? 'PRESSED' : 'NOT PRESSED'}</Text>

        <Toggle.Root
          pressed={controlled}
          onPressedChange={setControlled}
          style={[s.toggle, controlled && s.togglePressed]}
        >
          <Text style={[s.toggleText, controlled && s.toggleTextPressed]}>
            {controlled ? 'Pinned' : 'Pin'}
          </Text>
        </Toggle.Root>

        {/* ---- Disabled ---- */}
        <Text style={s.heading}>Disabled</Text>
        <View style={s.row}>
          <Toggle.Root disabled style={[s.toggle, s.disabledToggle]}>
            <Text style={[s.toggleText, s.disabledText]}>Disabled off</Text>
          </Toggle.Root>
          <Toggle.Root disabled defaultPressed style={[s.toggle, s.disabledToggle]}>
            <Text style={[s.toggleText, s.disabledText]}>Disabled on</Text>
          </Toggle.Root>
        </View>
      </ScrollView>
    </>
  );
}

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#fff' },
  container: { padding: 16, gap: 12 },
  heading: { fontSize: 18, fontWeight: '700', marginTop: 12 },
  info: { fontSize: 14, color: '#6b7280' },
  row: { flexDirection: 'row', gap: 8 },
  toggle: {
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#d1d5db',
    backgroundColor: '#fff',
  },
  togglePressed: {
    backgroundColor: '#6366f1',
    borderColor: '#6366f1',
  },
  toggleText: { fontSize: 15, fontWeight: '600', color: '#374151' },
  toggleTextPressed: { color: '#fff' },
  disabledToggle: {
    backgroundColor: '#f9fafb',
    borderColor: '#e5e7eb',
  },
  disabledText: { color: '#9ca3af' },
});
