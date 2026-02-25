import { View, Text, ScrollView, StyleSheet } from 'react-native';
import { Stack } from 'expo-router';
import { Image as PrimitiveImage } from '@tallyui/primitives';

const modes = ['cover', 'contain', 'fill'] as const;

export default function ImageScreen() {
  return (
    <>
      <Stack.Screen options={{ title: 'Image' }} />
      <ScrollView style={s.screen} contentContainerStyle={s.container}>
        <Text style={s.heading}>Content Fit Modes</Text>

        {modes.map((mode) => (
          <View key={mode} style={s.card}>
            <Text style={s.modeLabel}>contentFit=&quot;{mode}&quot;</Text>
            <View style={s.imageWrap}>
              <PrimitiveImage.Root
                source={{ uri: `https://picsum.photos/400/250?random=${mode}` }}
                alt={`Sample image with ${mode} fit`}
                contentFit={mode}
                style={s.image}
              />
            </View>
          </View>
        ))}

        <Text style={s.heading}>Accessibility</Text>
        <View style={s.card}>
          <Text style={s.modeLabel}>With alt text</Text>
          <View style={s.imageWrap}>
            <PrimitiveImage.Root
              source={{ uri: 'https://picsum.photos/200/200?random=alt' }}
              alt="A randomly selected photograph used for testing alt text"
              contentFit="cover"
              style={s.imageSmall}
            />
          </View>
          <Text style={s.info}>
            The image above has alt=&quot;A randomly selected photograph used for testing alt
            text&quot; which maps to accessibilityLabel on native.
          </Text>
        </View>
      </ScrollView>
    </>
  );
}

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#fff' },
  container: { padding: 16, gap: 12 },
  heading: { fontSize: 18, fontWeight: '700', marginTop: 4 },
  card: {
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 10,
    padding: 12,
    gap: 8,
  },
  modeLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: '#6366f1',
    fontFamily: 'monospace',
  },
  imageWrap: {
    backgroundColor: '#f3f4f6',
    borderRadius: 8,
    overflow: 'hidden',
    height: 160,
  },
  image: { width: '100%', height: '100%' },
  imageSmall: { width: 120, height: 120, alignSelf: 'center', margin: 20 },
  info: { fontSize: 13, color: '#6b7280', lineHeight: 18 },
});
