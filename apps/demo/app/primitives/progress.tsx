import { View, Text, ScrollView, StyleSheet } from 'react-native';
import { Stack } from 'expo-router';
import { Progress } from '@tallyui/primitives';

export default function ProgressScreen() {
  return (
    <>
      <Stack.Screen options={{ title: 'Progress' }} />
      <ScrollView style={s.screen} contentContainerStyle={s.container}>
        {/* ---- Different Values ---- */}
        <Text style={s.heading}>Different Values</Text>

        <Text style={s.label}>0%</Text>
        <Progress.Root value={0} style={s.track}>
          <Progress.Indicator style={[s.indicator, { width: '0%' }]} />
        </Progress.Root>

        <Text style={s.label}>50%</Text>
        <Progress.Root value={50} style={s.track}>
          <Progress.Indicator style={[s.indicator, { width: '50%' }]} />
        </Progress.Root>

        <Text style={s.label}>100%</Text>
        <Progress.Root value={100} style={s.track}>
          <Progress.Indicator style={[s.indicator, { width: '100%' }]} />
        </Progress.Root>

        {/* ---- Indeterminate ---- */}
        <Text style={s.heading}>Indeterminate</Text>
        <Text style={s.info}>
          When value is null or undefined, the progress is indeterminate.
        </Text>
        <Progress.Root value={null} style={s.track}>
          <Progress.Indicator style={[s.indicator, s.indeterminate]} />
        </Progress.Root>

        {/* ---- Custom Max ---- */}
        <Text style={s.heading}>Custom Max (200)</Text>

        <Text style={s.label}>75 of 200</Text>
        <Progress.Root value={75} max={200} style={s.track}>
          <Progress.Indicator style={[s.indicator, { width: '37.5%' }]} />
        </Progress.Root>

        <Text style={s.label}>150 of 200</Text>
        <Progress.Root value={150} max={200} style={s.track}>
          <Progress.Indicator style={[s.indicator, { width: '75%' }]} />
        </Progress.Root>
      </ScrollView>
    </>
  );
}

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#fff' },
  container: { padding: 16, gap: 8 },
  heading: { fontSize: 18, fontWeight: '700', marginTop: 12 },
  info: { fontSize: 14, color: '#6b7280', lineHeight: 20 },
  label: { fontSize: 13, fontWeight: '600', color: '#6b7280', marginTop: 4 },
  track: {
    height: 10,
    backgroundColor: '#e5e7eb',
    borderRadius: 5,
    overflow: 'hidden',
  },
  indicator: {
    height: '100%',
    backgroundColor: '#6366f1',
    borderRadius: 5,
  },
  indeterminate: {
    width: '40%',
    opacity: 0.6,
  },
});
