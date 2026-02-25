import { View, Text, ScrollView, StyleSheet } from 'react-native';
import { Stack } from 'expo-router';
import { Tooltip, PortalHost } from '@tallyui/primitives';

export default function TooltipScreen() {
  return (
    <>
      <Stack.Screen options={{ title: 'Tooltip' }} />
      <ScrollView style={s.screen} contentContainerStyle={s.container}>
        {/* ---- Basic Tooltip ---- */}
        <Text style={s.heading}>Basic Tooltip</Text>
        <Text style={s.info}>
          On web this opens on hover. On native, tap the trigger to toggle.
        </Text>

        <Tooltip.Root>
          <Tooltip.Trigger>
            <Text style={s.btn}>Hover or tap me</Text>
          </Tooltip.Trigger>

          <Tooltip.Portal>
            <Tooltip.Overlay style={s.overlay} />
            <Tooltip.Content style={s.content} disablePositioningStyle>
              <Text style={s.tooltipText}>
                This is a basic tooltip with helpful information.
              </Text>
            </Tooltip.Content>
          </Tooltip.Portal>
        </Tooltip.Root>

        {/* ---- Another Tooltip ---- */}
        <Text style={s.heading}>Info Tooltip</Text>

        <View style={s.row}>
          <Text style={s.rowLabel}>Password requirements</Text>
          <Tooltip.Root>
            <Tooltip.Trigger>
              <View style={s.infoIcon}>
                <Text style={s.infoIconText}>?</Text>
              </View>
            </Tooltip.Trigger>

            <Tooltip.Portal>
              <Tooltip.Overlay style={s.overlay} />
              <Tooltip.Content style={s.content} disablePositioningStyle>
                <Text style={s.tooltipText}>
                  Passwords must be at least 8 characters long and include a mix of letters,
                  numbers, and special characters.
                </Text>
              </Tooltip.Content>
            </Tooltip.Portal>
          </Tooltip.Root>
        </View>
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
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  rowLabel: { fontSize: 15, fontWeight: '600', color: '#111827' },
  infoIcon: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: '#e5e7eb',
    alignItems: 'center',
    justifyContent: 'center',
  },
  infoIconText: { fontSize: 12, fontWeight: '700', color: '#6b7280' },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.15)',
  },
  content: {
    position: 'absolute',
    top: '30%',
    left: 20,
    right: 20,
    backgroundColor: '#111827',
    borderRadius: 8,
    padding: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 6,
    elevation: 6,
  },
  tooltipText: { fontSize: 14, color: '#f3f4f6', lineHeight: 20 },
});
