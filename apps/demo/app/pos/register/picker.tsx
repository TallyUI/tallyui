import { useState } from 'react';
import { View } from 'react-native';
import { Stack } from 'expo-router';
import { RegisterPicker, Text } from '@tallyui/components';

const REGISTERS = [
  { id: 'front', name: 'Front counter' },
  { id: 'back', name: 'Back office' },
];

export default function RegisterPickerScreen() {
  const [picked, setPicked] = useState<string | null>(null);
  return (
    <>
      <Stack.Screen options={{ title: 'RegisterPicker' }} />
      <View className="flex-1 bg-background p-4 gap-3" testID="register-picker-screen">
        <RegisterPicker registers={REGISTERS} onPick={setPicked} />
        {picked && <Text testID="picked-register">Picked: {picked}</Text>}
      </View>
    </>
  );
}
