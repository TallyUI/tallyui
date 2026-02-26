import { useState } from 'react';
import { ScrollView, View } from 'react-native';
import { Stack } from 'expo-router';
import { CartNoteInput, Text } from '@tallyui/components';

export default function CartNoteInputScreen() {
  const [note, setNote] = useState('');
  const [prefilledNote, setPrefilledNote] = useState('Extra hot, no sugar');

  return (
    <>
      <Stack.Screen options={{ title: 'CartNoteInput' }} />
      <ScrollView className="flex-1 bg-background" contentContainerClassName="p-4 gap-6">
        <View className="gap-3">
          <Text className="text-lg font-bold">Empty (tap to expand)</Text>
          <View className="rounded-lg border border-border">
            <CartNoteInput value={note} onChangeText={setNote} />
          </View>
          {note.length > 0 && (
            <Text className="text-sm text-muted-foreground">Note: {note}</Text>
          )}
        </View>

        <View className="gap-3">
          <Text className="text-lg font-bold">Pre-filled (starts expanded)</Text>
          <View className="rounded-lg border border-border">
            <CartNoteInput value={prefilledNote} onChangeText={setPrefilledNote} />
          </View>
        </View>

        <View className="gap-3">
          <Text className="text-lg font-bold">Custom Placeholder</Text>
          <View className="rounded-lg border border-border">
            <CartNoteInput
              value=""
              onChangeText={() => {}}
              placeholder="Special instructions..."
            />
          </View>
        </View>
      </ScrollView>
    </>
  );
}
