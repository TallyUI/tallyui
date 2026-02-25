import { useState } from 'react';
import { View, Text, ScrollView, StyleSheet } from 'react-native';
import { Stack } from 'expo-router';
import { RadioGroup } from '@tallyui/primitives';

const plans = [
  { value: 'free', label: 'Free', desc: 'Basic features for personal use' },
  { value: 'pro', label: 'Pro', desc: 'Advanced features for professionals' },
  { value: 'enterprise', label: 'Enterprise', desc: 'Full access for teams' },
];

export default function RadioGroupScreen() {
  const [controlled, setControlled] = useState('pro');

  return (
    <>
      <Stack.Screen options={{ title: 'Radio Group' }} />
      <ScrollView style={s.screen} contentContainerStyle={s.container}>
        {/* ---- Uncontrolled ---- */}
        <Text style={s.heading}>Uncontrolled</Text>

        <RadioGroup.Root defaultValue="free" style={s.group}>
          {plans.map((plan) => (
            <RadioGroup.Item key={plan.value} value={plan.value} style={s.item}>
              <View style={s.radioOuter}>
                <RadioGroup.Indicator style={s.radioInner} />
              </View>
              <View style={s.itemContent}>
                <Text style={s.itemLabel}>{plan.label}</Text>
                <Text style={s.itemDesc}>{plan.desc}</Text>
              </View>
            </RadioGroup.Item>
          ))}
        </RadioGroup.Root>

        {/* ---- Controlled ---- */}
        <Text style={s.heading}>Controlled</Text>
        <Text style={s.info}>Selected: {controlled}</Text>

        <RadioGroup.Root
          value={controlled}
          onValueChange={setControlled}
          style={s.group}
        >
          {plans.map((plan) => (
            <RadioGroup.Item key={plan.value} value={plan.value} style={s.item}>
              <View style={s.radioOuter}>
                <RadioGroup.Indicator style={s.radioInner} />
              </View>
              <View style={s.itemContent}>
                <Text style={s.itemLabel}>{plan.label}</Text>
                <Text style={s.itemDesc}>{plan.desc}</Text>
              </View>
            </RadioGroup.Item>
          ))}
        </RadioGroup.Root>

        {/* ---- With Disabled Items ---- */}
        <Text style={s.heading}>Disabled Items</Text>

        <RadioGroup.Root defaultValue="free" style={s.group}>
          <RadioGroup.Item value="free" style={s.item}>
            <View style={s.radioOuter}>
              <RadioGroup.Indicator style={s.radioInner} />
            </View>
            <Text style={s.itemLabel}>Free</Text>
          </RadioGroup.Item>

          <RadioGroup.Item value="pro" disabled style={[s.item, s.disabledItem]}>
            <View style={[s.radioOuter, s.disabledRadio]}>
              <RadioGroup.Indicator style={s.radioInner} />
            </View>
            <Text style={[s.itemLabel, s.disabledText]}>Pro (disabled)</Text>
          </RadioGroup.Item>

          <RadioGroup.Item value="enterprise" style={s.item}>
            <View style={s.radioOuter}>
              <RadioGroup.Indicator style={s.radioInner} />
            </View>
            <Text style={s.itemLabel}>Enterprise</Text>
          </RadioGroup.Item>
        </RadioGroup.Root>
      </ScrollView>
    </>
  );
}

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#fff' },
  container: { padding: 16, gap: 12 },
  heading: { fontSize: 18, fontWeight: '700', marginTop: 12 },
  info: { fontSize: 14, color: '#6b7280' },
  group: { gap: 8 },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 8,
  },
  disabledItem: {
    backgroundColor: '#f9fafb',
  },
  itemContent: { flex: 1, gap: 2 },
  itemLabel: { fontSize: 15, fontWeight: '600', color: '#111827' },
  itemDesc: { fontSize: 13, color: '#6b7280' },
  disabledText: { color: '#9ca3af' },
  radioOuter: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: '#6366f1',
    alignItems: 'center',
    justifyContent: 'center',
  },
  disabledRadio: {
    borderColor: '#d1d5db',
  },
  radioInner: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#6366f1',
  },
});
