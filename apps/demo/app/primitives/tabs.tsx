import { View, Text, ScrollView, StyleSheet } from 'react-native';
import { Stack } from 'expo-router';
import { Tabs } from '@tallyui/primitives';

export default function TabsScreen() {
  return (
    <>
      <Stack.Screen options={{ title: 'Tabs' }} />
      <ScrollView style={s.screen} contentContainerStyle={s.container}>
        <Text style={s.heading}>Basic Tabs</Text>

        <Tabs.Root defaultValue="tab1">
          <Tabs.List style={s.list}>
            <Tabs.Trigger value="tab1" style={s.trigger}>
              <Text style={s.triggerText}>Tab 1</Text>
            </Tabs.Trigger>
            <Tabs.Trigger value="tab2" style={s.trigger}>
              <Text style={s.triggerText}>Tab 2</Text>
            </Tabs.Trigger>
            <Tabs.Trigger value="tab3" style={s.trigger}>
              <Text style={s.triggerText}>Tab 3</Text>
            </Tabs.Trigger>
          </Tabs.List>

          <Tabs.Content value="tab1" style={s.panel}>
            <Text style={s.panelTitle}>First Tab</Text>
            <Text style={s.panelDesc}>
              This is the content for the first tab. Only one tab panel is visible at a time --
              the others are unmounted when not active.
            </Text>
          </Tabs.Content>

          <Tabs.Content value="tab2" style={s.panel}>
            <Text style={s.panelTitle}>Second Tab</Text>
            <Text style={s.panelDesc}>
              Content for tab two. The Tabs primitive uses a controllable state hook, so it can
              be both uncontrolled (with defaultValue) and controlled (with value + onValueChange).
            </Text>
          </Tabs.Content>

          <Tabs.Content value="tab3" style={s.panel}>
            <Text style={s.panelTitle}>Third Tab</Text>
            <Text style={s.panelDesc}>
              Last tab panel. Each trigger gets the correct aria-selected attribute, and content
              panels have role=&quot;tabpanel&quot; with proper aria-labelledby linkage.
            </Text>
          </Tabs.Content>
        </Tabs.Root>
      </ScrollView>
    </>
  );
}

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#fff' },
  container: { padding: 16, gap: 12 },
  heading: { fontSize: 18, fontWeight: '700', marginTop: 4 },
  list: {
    flexDirection: 'row',
    backgroundColor: '#f3f4f6',
    borderRadius: 10,
    padding: 4,
    gap: 4,
  },
  trigger: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 8,
    alignItems: 'center',
  },
  triggerText: { fontSize: 14, fontWeight: '600', color: '#374151' },
  panel: {
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 10,
    padding: 16,
    marginTop: 8,
    gap: 6,
  },
  panelTitle: { fontSize: 16, fontWeight: '700', color: '#111827' },
  panelDesc: { fontSize: 14, color: '#6b7280', lineHeight: 20 },
});
