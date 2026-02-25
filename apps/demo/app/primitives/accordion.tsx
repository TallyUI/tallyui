import { useState } from 'react';
import { View, Text, ScrollView, StyleSheet } from 'react-native';
import { Stack } from 'expo-router';
import { Accordion } from '@tallyui/primitives';

const items = [
  { value: 'item-1', title: 'Section One', body: 'Content for the first section of the accordion.' },
  { value: 'item-2', title: 'Section Two', body: 'Content for the second section of the accordion.' },
  { value: 'item-3', title: 'Section Three', body: 'Content for the third section of the accordion.' },
];

export default function AccordionScreen() {
  const [singleValue, setSingleValue] = useState<string | undefined>('item-1');
  const [multipleValue, setMultipleValue] = useState<string[]>(['item-1']);

  return (
    <>
      <Stack.Screen options={{ title: 'Accordion' }} />
      <ScrollView style={s.screen} contentContainerStyle={s.container}>
        {/* ---- Single (non-collapsible) ---- */}
        <Text style={s.heading}>Single (non-collapsible)</Text>
        <Text style={s.info}>One item open at a time, cannot collapse all.</Text>

        <Accordion.Root type="single" defaultValue="item-1" style={s.accordion}>
          {items.map((item) => (
            <Accordion.Item key={item.value} value={item.value} style={s.item}>
              <Accordion.Header>
                <Accordion.Trigger style={s.trigger}>
                  <Text style={s.triggerText}>{item.title}</Text>
                </Accordion.Trigger>
              </Accordion.Header>
              <Accordion.Content style={s.content}>
                <Text style={s.contentText}>{item.body}</Text>
              </Accordion.Content>
            </Accordion.Item>
          ))}
        </Accordion.Root>

        {/* ---- Single (collapsible) ---- */}
        <Text style={s.heading}>Single (collapsible)</Text>
        <Text style={s.info}>
          Controlled value: {singleValue || '(none)'}
        </Text>

        <Accordion.Root
          type="single"
          collapsible
          value={singleValue}
          onValueChange={setSingleValue}
          style={s.accordion}
        >
          {items.map((item) => (
            <Accordion.Item key={item.value} value={item.value} style={s.item}>
              <Accordion.Header>
                <Accordion.Trigger style={s.trigger}>
                  <Text style={s.triggerText}>{item.title}</Text>
                </Accordion.Trigger>
              </Accordion.Header>
              <Accordion.Content style={s.content}>
                <Text style={s.contentText}>{item.body}</Text>
              </Accordion.Content>
            </Accordion.Item>
          ))}
        </Accordion.Root>

        {/* ---- Multiple ---- */}
        <Text style={s.heading}>Multiple</Text>
        <Text style={s.info}>
          Open items: {multipleValue.length ? multipleValue.join(', ') : '(none)'}
        </Text>

        <Accordion.Root
          type="multiple"
          value={multipleValue}
          onValueChange={setMultipleValue}
          style={s.accordion}
        >
          {items.map((item) => (
            <Accordion.Item key={item.value} value={item.value} style={s.item}>
              <Accordion.Header>
                <Accordion.Trigger style={s.trigger}>
                  <Text style={s.triggerText}>{item.title}</Text>
                </Accordion.Trigger>
              </Accordion.Header>
              <Accordion.Content style={s.content}>
                <Text style={s.contentText}>{item.body}</Text>
              </Accordion.Content>
            </Accordion.Item>
          ))}
        </Accordion.Root>
      </ScrollView>
    </>
  );
}

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#fff' },
  container: { padding: 16, gap: 12 },
  heading: { fontSize: 18, fontWeight: '700', marginTop: 12 },
  info: { fontSize: 14, color: '#6b7280' },
  accordion: { gap: 4 },
  item: {
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 8,
    overflow: 'hidden',
  },
  trigger: {
    padding: 14,
    backgroundColor: '#f9fafb',
  },
  triggerText: { fontSize: 15, fontWeight: '600', color: '#111827' },
  content: {
    padding: 14,
    borderTopWidth: 1,
    borderTopColor: '#e5e7eb',
  },
  contentText: { fontSize: 14, color: '#6b7280', lineHeight: 20 },
});
