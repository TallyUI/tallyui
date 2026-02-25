import { useState } from 'react';
import { View, Text, ScrollView, StyleSheet } from 'react-native';
import { Stack } from 'expo-router';
import { Collapsible } from '@tallyui/primitives';

export default function CollapsibleScreen() {
  const [controlled, setControlled] = useState(false);

  return (
    <>
      <Stack.Screen options={{ title: 'Collapsible' }} />
      <ScrollView style={s.screen} contentContainerStyle={s.container}>
        {/* ---- Uncontrolled ---- */}
        <Text style={s.heading}>Uncontrolled</Text>
        <Collapsible.Root style={s.collapsible}>
          <Collapsible.Trigger style={s.trigger}>
            <Text style={s.triggerText}>Toggle content</Text>
          </Collapsible.Trigger>
          <Collapsible.Content style={s.content}>
            <Text style={s.contentText}>
              This content is toggled by the trigger above. It manages its own open/close state
              internally through the uncontrolled pattern.
            </Text>
          </Collapsible.Content>
        </Collapsible.Root>

        {/* ---- Default open ---- */}
        <Text style={s.heading}>Default Open</Text>
        <Collapsible.Root defaultOpen style={s.collapsible}>
          <Collapsible.Trigger style={s.trigger}>
            <Text style={s.triggerText}>Toggle (starts open)</Text>
          </Collapsible.Trigger>
          <Collapsible.Content style={s.content}>
            <Text style={s.contentText}>
              This collapsible starts in the open state via the defaultOpen prop.
            </Text>
          </Collapsible.Content>
        </Collapsible.Root>

        {/* ---- Controlled ---- */}
        <Text style={s.heading}>Controlled</Text>
        <Text style={s.info}>State: {controlled ? 'OPEN' : 'CLOSED'}</Text>

        <Collapsible.Root
          open={controlled}
          onOpenChange={setControlled}
          style={s.collapsible}
        >
          <Collapsible.Trigger style={s.trigger}>
            <Text style={s.triggerText}>Toggle controlled</Text>
          </Collapsible.Trigger>
          <Collapsible.Content style={s.content}>
            <Text style={s.contentText}>
              Open state is managed externally. Current: {controlled ? 'true' : 'false'}
            </Text>
          </Collapsible.Content>
        </Collapsible.Root>

        {/* ---- Disabled ---- */}
        <Text style={s.heading}>Disabled</Text>
        <Collapsible.Root disabled style={s.collapsible}>
          <Collapsible.Trigger style={[s.trigger, s.disabledTrigger]}>
            <Text style={[s.triggerText, s.disabledText]}>Cannot toggle (disabled)</Text>
          </Collapsible.Trigger>
          <Collapsible.Content style={s.content}>
            <Text style={s.contentText}>This content should not be reachable.</Text>
          </Collapsible.Content>
        </Collapsible.Root>
      </ScrollView>
    </>
  );
}

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#fff' },
  container: { padding: 16, gap: 12 },
  heading: { fontSize: 18, fontWeight: '700', marginTop: 12 },
  info: { fontSize: 14, color: '#6b7280' },
  collapsible: {
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 8,
    overflow: 'hidden',
  },
  trigger: {
    padding: 14,
    backgroundColor: '#f9fafb',
  },
  disabledTrigger: {
    backgroundColor: '#f3f4f6',
  },
  triggerText: { fontSize: 15, fontWeight: '600', color: '#111827' },
  disabledText: { color: '#9ca3af' },
  content: {
    padding: 14,
    borderTopWidth: 1,
    borderTopColor: '#e5e7eb',
  },
  contentText: { fontSize: 14, color: '#6b7280', lineHeight: 20 },
});
