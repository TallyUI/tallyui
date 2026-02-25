import { useMemo } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Stack } from 'expo-router';
import { List } from '@tallyui/primitives';

type Item = { id: string; title: string; subtitle: string };

const ITEM_HEIGHT = 64;

function generateItems(count: number): Item[] {
  return Array.from({ length: count }, (_, i) => ({
    id: String(i),
    title: `Item ${i + 1}`,
    subtitle: `Description for item ${i + 1}`,
  }));
}

export default function ListScreen() {
  const data = useMemo(() => generateItems(100), []);

  return (
    <>
      <Stack.Screen options={{ title: 'List' }} />
      <View style={s.screen}>
        <View style={s.header}>
          <Text style={s.heading}>Virtualized List</Text>
          <Text style={s.info}>
            100 items with estimatedItemSize={ITEM_HEIGHT} for optimized scrolling.
          </Text>
        </View>

        <List.Root
          data={data}
          keyExtractor={(item) => item.id}
          estimatedItemSize={ITEM_HEIGHT}
          renderItem={({ item }) => (
            <List.Item style={s.item}>
              <Text style={s.itemTitle}>{item.title}</Text>
              <Text style={s.itemSub}>{item.subtitle}</Text>
            </List.Item>
          )}
          contentContainerStyle={s.listContent}
        />
      </View>
    </>
  );
}

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#fff' },
  header: { padding: 16, gap: 4 },
  heading: { fontSize: 18, fontWeight: '700' },
  info: { fontSize: 14, color: '#6b7280' },
  listContent: { paddingHorizontal: 16, paddingBottom: 16 },
  item: {
    height: ITEM_HEIGHT,
    justifyContent: 'center',
    borderBottomWidth: 1,
    borderBottomColor: '#f3f4f6',
    paddingHorizontal: 4,
  },
  itemTitle: { fontSize: 15, fontWeight: '600', color: '#111827' },
  itemSub: { fontSize: 13, color: '#6b7280', marginTop: 2 },
});
