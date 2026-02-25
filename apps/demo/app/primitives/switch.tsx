import { useState } from 'react';
import { View, Text, ScrollView, StyleSheet } from 'react-native';
import { Stack } from 'expo-router';
import { Switch } from '@tallyui/primitives';

export default function SwitchScreen() {
  const [controlled, setControlled] = useState(false);

  return (
    <>
      <Stack.Screen options={{ title: 'Switch' }} />
      <ScrollView style={s.screen} contentContainerStyle={s.container}>
        {/* ---- Uncontrolled ---- */}
        <Text style={s.heading}>Uncontrolled</Text>
        <View style={s.row}>
          <Switch.Root style={s.track}>
            <Switch.Thumb style={s.thumb} />
          </Switch.Root>
          <Text style={s.label}>Wi-Fi</Text>
        </View>

        <View style={s.row}>
          <Switch.Root defaultChecked style={[s.track, s.trackOn]}>
            <Switch.Thumb style={[s.thumb, s.thumbOn]} />
          </Switch.Root>
          <Text style={s.label}>Default on</Text>
        </View>

        {/* ---- Controlled ---- */}
        <Text style={s.heading}>Controlled</Text>
        <Text style={s.info}>State: {controlled ? 'ON' : 'OFF'}</Text>

        <View style={s.row}>
          <Switch.Root
            checked={controlled}
            onCheckedChange={setControlled}
            style={[s.track, controlled && s.trackOn]}
          >
            <Switch.Thumb style={[s.thumb, controlled && s.thumbOn]} />
          </Switch.Root>
          <Text style={s.label}>Notifications</Text>
        </View>

        {/* ---- Disabled ---- */}
        <Text style={s.heading}>Disabled</Text>
        <View style={s.row}>
          <Switch.Root disabled style={[s.track, s.disabledTrack]}>
            <Switch.Thumb style={[s.thumb, s.disabledThumb]} />
          </Switch.Root>
          <Text style={[s.label, s.disabledLabel]}>Disabled off</Text>
        </View>

        <View style={s.row}>
          <Switch.Root disabled defaultChecked style={[s.track, s.disabledTrack, s.disabledTrackOn]}>
            <Switch.Thumb style={[s.thumb, s.thumbOn, s.disabledThumb]} />
          </Switch.Root>
          <Text style={[s.label, s.disabledLabel]}>Disabled on</Text>
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
  row: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  track: {
    width: 52,
    height: 30,
    borderRadius: 15,
    backgroundColor: '#e5e7eb',
    padding: 3,
    justifyContent: 'center',
  },
  trackOn: {
    backgroundColor: '#6366f1',
  },
  disabledTrack: {
    backgroundColor: '#f3f4f6',
  },
  disabledTrackOn: {
    backgroundColor: '#c7d2fe',
  },
  thumb: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: '#fff',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.15,
    shadowRadius: 2,
    elevation: 2,
  },
  thumbOn: {
    alignSelf: 'flex-end',
  },
  disabledThumb: {
    backgroundColor: '#e5e7eb',
    shadowOpacity: 0,
    elevation: 0,
  },
  label: { fontSize: 15, color: '#111827' },
  disabledLabel: { color: '#9ca3af' },
});
