import { useState } from 'react';
import { View, Text, Pressable, ScrollView, StyleSheet } from 'react-native';
import { Stack } from 'expo-router';
import { Toast } from '@tallyui/primitives';

export default function ToastScreen() {
  const [fgOpen, setFgOpen] = useState(false);
  const [bgOpen, setBgOpen] = useState(false);
  const [actionOpen, setActionOpen] = useState(false);

  return (
    <>
      <Stack.Screen options={{ title: 'Toast' }} />
      <ScrollView style={s.screen} contentContainerStyle={s.container}>
        {/* ---- Foreground ---- */}
        <Text style={s.heading}>Foreground Toast</Text>
        <Text style={s.info}>
          Foreground toasts use aria-live="assertive" for immediate announcement.
        </Text>

        <Pressable onPress={() => setFgOpen(true)}>
          <Text style={s.btn}>Show Foreground Toast</Text>
        </Pressable>

        <Toast.Root
          type="foreground"
          open={fgOpen}
          onOpenChange={setFgOpen}
          style={s.toast}
        >
          <Toast.Title style={s.toastTitle}>File saved</Toast.Title>
          <Toast.Description style={s.toastDesc}>
            Your changes have been saved successfully.
          </Toast.Description>
          <Toast.Close>
            <Text style={s.closeBtn}>Dismiss</Text>
          </Toast.Close>
        </Toast.Root>

        {/* ---- Background ---- */}
        <Text style={s.heading}>Background Toast</Text>
        <Text style={s.info}>
          Background toasts use aria-live="polite" and are announced at the next opportunity.
        </Text>

        <Pressable onPress={() => setBgOpen(true)}>
          <Text style={s.btn}>Show Background Toast</Text>
        </Pressable>

        <Toast.Root
          type="background"
          open={bgOpen}
          onOpenChange={setBgOpen}
          style={[s.toast, s.bgToast]}
        >
          <Toast.Title style={s.toastTitle}>Syncing...</Toast.Title>
          <Toast.Description style={s.toastDesc}>
            Your data is being synchronized in the background.
          </Toast.Description>
          <Toast.Close>
            <Text style={s.closeBtn}>Dismiss</Text>
          </Toast.Close>
        </Toast.Root>

        {/* ---- With Action ---- */}
        <Text style={s.heading}>Toast with Action</Text>

        <Pressable onPress={() => setActionOpen(true)}>
          <Text style={s.btn}>Show Action Toast</Text>
        </Pressable>

        <Toast.Root
          type="foreground"
          open={actionOpen}
          onOpenChange={setActionOpen}
          style={s.toast}
        >
          <Toast.Title style={s.toastTitle}>Message deleted</Toast.Title>
          <Toast.Description style={s.toastDesc}>
            The message has been moved to trash.
          </Toast.Description>
          <View style={s.toastActions}>
            <Toast.Action altText="Undo delete" onPress={() => setActionOpen(false)}>
              <Text style={s.actionBtn}>Undo</Text>
            </Toast.Action>
            <Toast.Close>
              <Text style={s.closeBtn}>Close</Text>
            </Toast.Close>
          </View>
        </Toast.Root>
      </ScrollView>
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
  toast: {
    backgroundColor: '#111827',
    borderRadius: 10,
    padding: 16,
    gap: 6,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
    elevation: 6,
  },
  bgToast: {
    backgroundColor: '#374151',
  },
  toastTitle: { fontSize: 15, fontWeight: '700', color: '#fff' },
  toastDesc: { fontSize: 14, color: '#d1d5db', lineHeight: 20 },
  toastActions: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 6,
  },
  actionBtn: {
    backgroundColor: '#6366f1',
    color: '#fff',
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 6,
    fontSize: 13,
    fontWeight: '600',
    textAlign: 'center',
    overflow: 'hidden',
  },
  closeBtn: {
    backgroundColor: 'rgba(255,255,255,0.15)',
    color: '#fff',
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 6,
    fontSize: 13,
    fontWeight: '600',
    textAlign: 'center',
    overflow: 'hidden',
  },
});
