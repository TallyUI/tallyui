import { useState } from 'react';
import { View, Text, Pressable, ScrollView, StyleSheet } from 'react-native';
import { Stack } from 'expo-router';
import { Dialog, PortalHost } from '@tallyui/primitives';

export default function DialogScreen() {
  const [controlled, setControlled] = useState(false);

  return (
    <>
      <Stack.Screen options={{ title: 'Dialog' }} />
      <ScrollView style={s.screen} contentContainerStyle={s.container}>
        {/* ---- Uncontrolled ---- */}
        <Text style={s.heading}>Uncontrolled Dialog</Text>
        <Dialog.Root>
          <Dialog.Trigger>
            <Text style={s.btn}>Open Uncontrolled Dialog</Text>
          </Dialog.Trigger>

          <Dialog.Portal>
            <Dialog.Overlay style={s.overlay} />
            <Dialog.Content style={s.content}>
              <Dialog.Title style={s.title}>Uncontrolled Dialog</Dialog.Title>
              <Dialog.Description style={s.desc}>
                This dialog manages its own open/close state internally.
              </Dialog.Description>
              <Dialog.Close>
                <Text style={s.btn}>Close</Text>
              </Dialog.Close>
            </Dialog.Content>
          </Dialog.Portal>
        </Dialog.Root>

        {/* ---- Controlled ---- */}
        <Text style={s.heading}>Controlled Dialog</Text>
        <Text style={s.info}>State: {controlled ? 'OPEN' : 'CLOSED'}</Text>

        <Pressable style={s.btnWrap} onPress={() => setControlled(true)}>
          <Text style={s.btn}>Open via external state</Text>
        </Pressable>

        <Dialog.Root open={controlled} onOpenChange={setControlled}>
          <Dialog.Trigger>
            <Text style={s.btn}>Open via Trigger</Text>
          </Dialog.Trigger>

          <Dialog.Portal>
            <Dialog.Overlay style={s.overlay} />
            <Dialog.Content style={s.content}>
              <Dialog.Title style={s.title}>Controlled Dialog</Dialog.Title>
              <Dialog.Description style={s.desc}>
                Open state is managed externally. Current: {controlled ? 'true' : 'false'}
              </Dialog.Description>
              <Dialog.Close>
                <Text style={s.btn}>Close</Text>
              </Dialog.Close>
            </Dialog.Content>
          </Dialog.Portal>
        </Dialog.Root>
      </ScrollView>
      <PortalHost />
    </>
  );
}

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#fff' },
  container: { padding: 16, gap: 12 },
  heading: { fontSize: 18, fontWeight: '700', marginTop: 12 },
  info: { fontSize: 14, color: '#6b7280' },
  btnWrap: {},
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
    backgroundColor: 'rgba(0,0,0,0.4)',
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
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 8,
  },
  title: { fontSize: 18, fontWeight: '700' },
  desc: { fontSize: 14, color: '#6b7280', lineHeight: 20 },
});
