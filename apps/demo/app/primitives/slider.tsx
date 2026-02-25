import { useState } from 'react';
import { View, Text, ScrollView, StyleSheet } from 'react-native';
import { Stack } from 'expo-router';
import { Slider } from '@tallyui/primitives';

export default function SliderScreen() {
  const [defaultVal, setDefaultVal] = useState(50);
  const [customVal, setCustomVal] = useState(5);

  return (
    <>
      <Stack.Screen options={{ title: 'Slider' }} />
      <ScrollView style={s.screen} contentContainerStyle={s.container}>
        {/* ---- Default ---- */}
        <Text style={s.heading}>Default (0-100)</Text>
        <Text style={s.info}>Value: {defaultVal}</Text>

        <Slider.Root
          value={defaultVal}
          onValueChange={setDefaultVal}
          style={s.slider}
        >
          <Slider.Track style={s.track}>
            <Slider.Range style={[s.range, { width: `${defaultVal}%` }]} />
          </Slider.Track>
          <Slider.Thumb style={[s.thumb, { left: `${defaultVal}%` }]} />
        </Slider.Root>

        {/* ---- Custom Min/Max/Step ---- */}
        <Text style={s.heading}>Custom Range (min=0, max=10, step=1)</Text>
        <Text style={s.info}>Value: {customVal}</Text>

        <Slider.Root
          value={customVal}
          onValueChange={setCustomVal}
          min={0}
          max={10}
          step={1}
          style={s.slider}
        >
          <Slider.Track style={s.track}>
            <Slider.Range style={[s.range, { width: `${(customVal / 10) * 100}%` }]} />
          </Slider.Track>
          <Slider.Thumb style={[s.thumb, { left: `${(customVal / 10) * 100}%` }]} />
        </Slider.Root>

        <View style={s.scaleRow}>
          {Array.from({ length: 11 }, (_, i) => (
            <Text key={i} style={s.scaleLabel}>{i}</Text>
          ))}
        </View>

        {/* ---- Disabled ---- */}
        <Text style={s.heading}>Disabled</Text>

        <Slider.Root
          value={30}
          disabled
          style={s.slider}
        >
          <Slider.Track style={[s.track, s.disabledTrack]}>
            <Slider.Range style={[s.range, s.disabledRange, { width: '30%' }]} />
          </Slider.Track>
          <Slider.Thumb style={[s.thumb, s.disabledThumb, { left: '30%' }]} />
        </Slider.Root>
      </ScrollView>
    </>
  );
}

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#fff' },
  container: { padding: 16, gap: 12 },
  heading: { fontSize: 18, fontWeight: '700', marginTop: 12 },
  info: { fontSize: 14, color: '#6b7280' },
  slider: {
    height: 40,
    justifyContent: 'center',
  },
  track: {
    height: 6,
    backgroundColor: '#e5e7eb',
    borderRadius: 3,
  },
  range: {
    height: '100%',
    backgroundColor: '#6366f1',
    borderRadius: 3,
  },
  thumb: {
    position: 'absolute',
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: '#6366f1',
    marginLeft: -12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 4,
    elevation: 3,
  },
  disabledTrack: {
    backgroundColor: '#f3f4f6',
  },
  disabledRange: {
    backgroundColor: '#d1d5db',
  },
  disabledThumb: {
    backgroundColor: '#d1d5db',
  },
  scaleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 2,
  },
  scaleLabel: { fontSize: 11, color: '#9ca3af' },
});
