import { useState } from 'react';
import { View, Text } from 'react-native';
import { Stack } from 'expo-router';
import { StoreSettingsChoiceScreen } from '@tallyui/components';
import type { StoreSettingsChoice, StoreSettingsChoices } from '@tallyui/core';

// medusa-dev's real shape: one region with 7 countries, one sales channel.
const choices: StoreSettingsChoices = {
  countries: ['dk', 'fr', 'de', 'it', 'es', 'se', 'gb'],
  channels: [{ id: 'pk_default', name: 'Default Publishable API Key' }],
};

export default function StoreSettingsChoiceScreenDemo() {
  const [result, setResult] = useState<StoreSettingsChoice | null>(null);

  return (
    <>
      <Stack.Screen options={{ title: 'StoreSettingsChoiceScreen' }} />
      <View className="flex-1 bg-background">
        <StoreSettingsChoiceScreen choices={choices} onSubmit={setResult} />
        {result && <Text className="p-4 text-sm text-muted-foreground">{JSON.stringify(result)}</Text>}
      </View>
    </>
  );
}
