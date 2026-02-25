import { View, Text, TextInput, ScrollView, StyleSheet } from 'react-native';
import { Stack } from 'expo-router';
import { Label } from '@tallyui/primitives';

export default function LabelScreen() {
  return (
    <>
      <Stack.Screen options={{ title: 'Label' }} />
      <ScrollView style={s.screen} contentContainerStyle={s.container}>
        {/* ---- Basic Label ---- */}
        <Text style={s.heading}>Basic Label</Text>
        <Text style={s.info}>
          The Label primitive sets a nativeID that can be referenced by form controls
          via accessibilityLabelledBy for proper accessibility linkage.
        </Text>

        <View style={s.field}>
          <Label.Root nativeID="email-label" style={s.label}>
            Email address
          </Label.Root>
          <TextInput
            accessibilityLabelledBy="email-label"
            placeholder="you@example.com"
            style={s.input}
            keyboardType="email-address"
            autoCapitalize="none"
          />
        </View>

        {/* ---- Another Label ---- */}
        <View style={s.field}>
          <Label.Root nativeID="name-label" style={s.label}>
            Full name
          </Label.Root>
          <TextInput
            accessibilityLabelledBy="name-label"
            placeholder="Jane Smith"
            style={s.input}
          />
        </View>

        {/* ---- Label with description ---- */}
        <Text style={s.heading}>Label with Description</Text>
        <View style={s.field}>
          <Label.Root nativeID="bio-label" style={s.label}>
            Bio
          </Label.Root>
          <Text style={s.description}>
            Write a short description about yourself.
          </Text>
          <TextInput
            accessibilityLabelledBy="bio-label"
            placeholder="Tell us about yourself..."
            style={[s.input, s.multilineInput]}
            multiline
            numberOfLines={3}
          />
        </View>
      </ScrollView>
    </>
  );
}

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#fff' },
  container: { padding: 16, gap: 12 },
  heading: { fontSize: 18, fontWeight: '700', marginTop: 12 },
  info: { fontSize: 14, color: '#6b7280', lineHeight: 20 },
  field: { gap: 6 },
  label: { fontSize: 15, fontWeight: '600', color: '#111827' },
  description: { fontSize: 13, color: '#9ca3af' },
  input: {
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: 8,
    padding: 12,
    fontSize: 15,
    color: '#111827',
    backgroundColor: '#f9fafb',
  },
  multilineInput: {
    minHeight: 80,
    textAlignVertical: 'top',
  },
});
