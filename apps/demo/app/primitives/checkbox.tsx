import { useState } from 'react';
import { View, Text, ScrollView, StyleSheet } from 'react-native';
import { Stack } from 'expo-router';
import { Checkbox } from '@tallyui/primitives';

export default function CheckboxScreen() {
  const [controlled, setControlled] = useState(false);

  return (
    <>
      <Stack.Screen options={{ title: 'Checkbox' }} />
      <ScrollView style={s.screen} contentContainerStyle={s.container}>
        {/* ---- Uncontrolled ---- */}
        <Text style={s.heading}>Uncontrolled</Text>
        <View style={s.row}>
          <Checkbox.Root defaultChecked={false} style={s.checkbox}>
            <Checkbox.Indicator>
              <Text style={s.check}>&#10003;</Text>
            </Checkbox.Indicator>
          </Checkbox.Root>
          <Text style={s.label}>Accept terms and conditions</Text>
        </View>

        <View style={s.row}>
          <Checkbox.Root defaultChecked={true} style={s.checkbox}>
            <Checkbox.Indicator>
              <Text style={s.check}>&#10003;</Text>
            </Checkbox.Indicator>
          </Checkbox.Root>
          <Text style={s.label}>Default checked</Text>
        </View>

        {/* ---- Controlled ---- */}
        <Text style={s.heading}>Controlled</Text>
        <Text style={s.info}>State: {controlled ? 'CHECKED' : 'UNCHECKED'}</Text>
        <View style={s.row}>
          <Checkbox.Root
            checked={controlled}
            onCheckedChange={setControlled}
            style={s.checkbox}
          >
            <Checkbox.Indicator>
              <Text style={s.check}>&#10003;</Text>
            </Checkbox.Indicator>
          </Checkbox.Root>
          <Text style={s.label}>Enable notifications</Text>
        </View>

        {/* ---- Disabled ---- */}
        <Text style={s.heading}>Disabled</Text>
        <View style={s.row}>
          <Checkbox.Root disabled style={[s.checkbox, s.disabledCheckbox]}>
            <Checkbox.Indicator>
              <Text style={s.check}>&#10003;</Text>
            </Checkbox.Indicator>
          </Checkbox.Root>
          <Text style={[s.label, s.disabledLabel]}>Disabled unchecked</Text>
        </View>

        <View style={s.row}>
          <Checkbox.Root disabled defaultChecked style={[s.checkbox, s.disabledCheckbox]}>
            <Checkbox.Indicator>
              <Text style={s.check}>&#10003;</Text>
            </Checkbox.Indicator>
          </Checkbox.Root>
          <Text style={[s.label, s.disabledLabel]}>Disabled checked</Text>
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
  row: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  checkbox: {
    width: 24,
    height: 24,
    borderWidth: 2,
    borderColor: '#6366f1',
    borderRadius: 4,
    alignItems: 'center',
    justifyContent: 'center',
  },
  disabledCheckbox: {
    borderColor: '#d1d5db',
    backgroundColor: '#f3f4f6',
  },
  check: { color: '#6366f1', fontWeight: '700', fontSize: 14 },
  label: { fontSize: 15, color: '#111827' },
  disabledLabel: { color: '#9ca3af' },
});
