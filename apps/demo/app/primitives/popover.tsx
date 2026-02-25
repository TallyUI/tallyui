import { View, Text, ScrollView, StyleSheet } from 'react-native';
import { Stack } from 'expo-router';
import { Popover, PortalHost } from '@tallyui/primitives';

export default function PopoverScreen() {
  return (
    <>
      <Stack.Screen options={{ title: 'Popover' }} />
      <ScrollView style={s.screen} contentContainerStyle={s.container}>
        {/* ---- Basic ---- */}
        <Text style={s.heading}>Basic Popover</Text>
        <Popover.Root>
          <Popover.Trigger>
            <Text style={s.btn}>Toggle Popover</Text>
          </Popover.Trigger>

          <Popover.Portal>
            <Popover.Overlay style={s.overlay} />
            <Popover.Content style={s.content} disablePositioningStyle>
              <Text style={s.contentTitle}>Popover Content</Text>
              <Text style={s.contentDesc}>
                This is a basic popover rendered through a portal.
              </Text>
              <Popover.Close>
                <Text style={s.closeBtn}>Dismiss</Text>
              </Popover.Close>
            </Popover.Content>
          </Popover.Portal>
        </Popover.Root>

        {/* ---- With side/align info ---- */}
        <Text style={s.heading}>Positioning Notes</Text>
        <Text style={s.info}>
          The Popover.Content primitive accepts side (top/bottom/left/right) and align
          (start/center/end) props for relative positioning. In this demo we use
          disablePositioningStyle for a simpler centered layout.
        </Text>

        <Popover.Root>
          <Popover.Trigger>
            <Text style={s.btn}>Another Popover</Text>
          </Popover.Trigger>

          <Popover.Portal>
            <Popover.Overlay style={s.overlay} />
            <Popover.Content style={s.content} disablePositioningStyle>
              <Text style={s.contentTitle}>Positioned Popover</Text>
              <Text style={s.contentDesc}>
                side=&quot;bottom&quot; align=&quot;start&quot; are the defaults. Relative positioning
                works with measure() on native and can be disabled for custom layouts.
              </Text>
              <Popover.Close>
                <Text style={s.closeBtn}>Close</Text>
              </Popover.Close>
            </Popover.Content>
          </Popover.Portal>
        </Popover.Root>
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
    gap: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.12,
    shadowRadius: 10,
    elevation: 6,
  },
  contentTitle: { fontSize: 16, fontWeight: '700' },
  contentDesc: { fontSize: 14, color: '#6b7280', lineHeight: 20 },
  closeBtn: {
    backgroundColor: '#e5e7eb',
    color: '#374151',
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 6,
    fontSize: 14,
    fontWeight: '600',
    textAlign: 'center',
    overflow: 'hidden',
    marginTop: 4,
  },
});
