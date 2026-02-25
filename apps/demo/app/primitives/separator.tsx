import { View, Text, ScrollView, StyleSheet } from 'react-native';
import { Stack } from 'expo-router';
import { Separator } from '@tallyui/primitives';

export default function SeparatorScreen() {
  return (
    <>
      <Stack.Screen options={{ title: 'Separator' }} />
      <ScrollView style={s.screen} contentContainerStyle={s.container}>
        {/* ---- Horizontal ---- */}
        <Text style={s.heading}>Horizontal (default)</Text>
        <Text style={s.info}>
          A semantic separator with role="separator" and aria-orientation="horizontal".
        </Text>

        <View style={s.card}>
          <Text style={s.cardTitle}>Section A</Text>
          <Text style={s.cardText}>Content above the separator.</Text>
          <Separator.Root orientation="horizontal" style={s.horizontal} />
          <Text style={s.cardTitle}>Section B</Text>
          <Text style={s.cardText}>Content below the separator.</Text>
        </View>

        {/* ---- Vertical ---- */}
        <Text style={s.heading}>Vertical</Text>
        <Text style={s.info}>
          Vertical separators work well in row layouts.
        </Text>

        <View style={s.row}>
          <Text style={s.rowText}>Left</Text>
          <Separator.Root orientation="vertical" style={s.vertical} />
          <Text style={s.rowText}>Center</Text>
          <Separator.Root orientation="vertical" style={s.vertical} />
          <Text style={s.rowText}>Right</Text>
        </View>

        {/* ---- Decorative ---- */}
        <Text style={s.heading}>Decorative</Text>
        <Text style={s.info}>
          Decorative separators have role="presentation" and are hidden from assistive technology.
        </Text>

        <View style={s.card}>
          <Text style={s.cardTitle}>Decorative Separator</Text>
          <Separator.Root decorative style={s.decorative} />
          <Text style={s.cardText}>
            This separator is purely visual. It uses role="presentation" instead of
            role="separator", so screen readers skip it.
          </Text>
        </View>
      </ScrollView>
    </>
  );
}

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#fff' },
  container: { padding: 16, gap: 12 },
  heading: { fontSize: 18, fontWeight: '700', marginTop: 12 },
  info: { fontSize: 14, color: '#6b7280', lineHeight: 20 },
  card: {
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 10,
    padding: 16,
    gap: 8,
  },
  cardTitle: { fontSize: 15, fontWeight: '600', color: '#111827' },
  cardText: { fontSize: 14, color: '#6b7280', lineHeight: 20 },
  horizontal: {
    height: 1,
    backgroundColor: '#e5e7eb',
    marginVertical: 4,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 10,
    gap: 16,
  },
  rowText: { fontSize: 15, fontWeight: '600', color: '#111827' },
  vertical: {
    width: 1,
    height: 24,
    backgroundColor: '#e5e7eb',
  },
  decorative: {
    height: 2,
    backgroundColor: '#6366f1',
    borderRadius: 1,
    opacity: 0.3,
  },
});
