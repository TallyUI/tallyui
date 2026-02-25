import { View, Text, ScrollView, StyleSheet } from 'react-native';
import { Stack } from 'expo-router';
import { HoverCard, PortalHost } from '@tallyui/primitives';

export default function HoverCardScreen() {
  return (
    <>
      <Stack.Screen options={{ title: 'Hover Card' }} />
      <ScrollView style={s.screen} contentContainerStyle={s.container}>
        {/* ---- Basic Hover Card ---- */}
        <Text style={s.heading}>Basic Hover Card</Text>
        <Text style={s.info}>
          On web this opens on hover. On native, tap the trigger to toggle.
        </Text>

        <HoverCard.Root>
          <HoverCard.Trigger>
            <Text style={s.btn}>@johndoe</Text>
          </HoverCard.Trigger>

          <HoverCard.Portal>
            <HoverCard.Overlay style={s.overlay} />
            <HoverCard.Content style={s.content} disablePositioningStyle>
              <View style={s.avatar}>
                <Text style={s.avatarText}>JD</Text>
              </View>
              <Text style={s.cardTitle}>John Doe</Text>
              <Text style={s.cardDesc}>
                Software engineer working on design systems and component libraries.
              </Text>
              <Text style={s.cardMeta}>Joined December 2021</Text>
            </HoverCard.Content>
          </HoverCard.Portal>
        </HoverCard.Root>

        {/* ---- Another Hover Card ---- */}
        <Text style={s.heading}>Project Card</Text>
        <HoverCard.Root>
          <HoverCard.Trigger>
            <Text style={s.btn}>TallyUI</Text>
          </HoverCard.Trigger>

          <HoverCard.Portal>
            <HoverCard.Overlay style={s.overlay} />
            <HoverCard.Content style={s.content} disablePositioningStyle>
              <Text style={s.cardTitle}>TallyUI Primitives</Text>
              <Text style={s.cardDesc}>
                A headless, cross-platform component library for React Native and web.
                Built with accessibility and composition in mind.
              </Text>
              <Text style={s.cardMeta}>16 primitives and counting</Text>
            </HoverCard.Content>
          </HoverCard.Portal>
        </HoverCard.Root>
      </ScrollView>
      <PortalHost />
    </>
  );
}

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#fff' },
  container: { padding: 16, gap: 12 },
  heading: { fontSize: 18, fontWeight: '700', marginTop: 12 },
  info: { fontSize: 14, color: '#6b7280', lineHeight: 20 },
  btn: {
    backgroundColor: '#6366f1',
    color: '#fff',
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 8,
    fontSize: 15,
    fontWeight: '600',
    textAlign: 'center',
    overflow: 'hidden',
  },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.2)',
  },
  content: {
    position: 'absolute',
    top: '30%',
    left: 20,
    right: 20,
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 20,
    gap: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.12,
    shadowRadius: 10,
    elevation: 6,
  },
  avatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#6366f1',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
  avatarText: { color: '#fff', fontWeight: '700', fontSize: 16 },
  cardTitle: { fontSize: 16, fontWeight: '700', color: '#111827' },
  cardDesc: { fontSize: 14, color: '#6b7280', lineHeight: 20 },
  cardMeta: { fontSize: 12, color: '#9ca3af', marginTop: 4 },
});
