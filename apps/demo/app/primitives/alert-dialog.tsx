import { useState } from 'react';
import { View, Text, Pressable, ScrollView, StyleSheet } from 'react-native';
import { Stack } from 'expo-router';
import { AlertDialog, PortalHost } from '@tallyui/primitives';

export default function AlertDialogScreen() {
  const [controlled, setControlled] = useState(false);

  return (
    <>
      <Stack.Screen options={{ title: 'Alert Dialog' }} />
      <ScrollView style={s.screen} contentContainerStyle={s.container}>
        {/* ---- Uncontrolled ---- */}
        <Text style={s.heading}>Uncontrolled Alert Dialog</Text>
        <AlertDialog.Root>
          <AlertDialog.Trigger>
            <Text style={s.btn}>Delete Item</Text>
          </AlertDialog.Trigger>

          <AlertDialog.Portal>
            <AlertDialog.Overlay style={s.overlay} />
            <AlertDialog.Content style={s.content}>
              <AlertDialog.Title style={s.title}>Are you sure?</AlertDialog.Title>
              <AlertDialog.Description style={s.desc}>
                This action cannot be undone. The item will be permanently deleted.
              </AlertDialog.Description>
              <View style={s.actions}>
                <AlertDialog.Cancel>
                  <Text style={s.cancelBtn}>Cancel</Text>
                </AlertDialog.Cancel>
                <AlertDialog.Action>
                  <Text style={s.actionBtn}>Delete</Text>
                </AlertDialog.Action>
              </View>
            </AlertDialog.Content>
          </AlertDialog.Portal>
        </AlertDialog.Root>

        {/* ---- Controlled ---- */}
        <Text style={s.heading}>Controlled Alert Dialog</Text>
        <Text style={s.info}>State: {controlled ? 'OPEN' : 'CLOSED'}</Text>

        <Pressable onPress={() => setControlled(true)}>
          <Text style={s.btn}>Open via external state</Text>
        </Pressable>

        <AlertDialog.Root open={controlled} onOpenChange={setControlled}>
          <AlertDialog.Trigger>
            <Text style={s.btn}>Open via Trigger</Text>
          </AlertDialog.Trigger>

          <AlertDialog.Portal>
            <AlertDialog.Overlay style={s.overlay} />
            <AlertDialog.Content style={s.content}>
              <AlertDialog.Title style={s.title}>Confirm Action</AlertDialog.Title>
              <AlertDialog.Description style={s.desc}>
                Open state is managed externally. Current: {controlled ? 'true' : 'false'}
              </AlertDialog.Description>
              <View style={s.actions}>
                <AlertDialog.Cancel>
                  <Text style={s.cancelBtn}>Cancel</Text>
                </AlertDialog.Cancel>
                <AlertDialog.Action>
                  <Text style={s.actionBtn}>Confirm</Text>
                </AlertDialog.Action>
              </View>
            </AlertDialog.Content>
          </AlertDialog.Portal>
        </AlertDialog.Root>
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
  actions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 8,
    marginTop: 8,
  },
  cancelBtn: {
    backgroundColor: '#e5e7eb',
    color: '#374151',
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 8,
    fontSize: 15,
    fontWeight: '600',
    textAlign: 'center',
    overflow: 'hidden',
  },
  actionBtn: {
    backgroundColor: '#ef4444',
    color: '#fff',
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 8,
    fontSize: 15,
    fontWeight: '600',
    textAlign: 'center',
    overflow: 'hidden',
  },
});
