import { ScrollView, View } from 'react-native';
import { Stack } from 'expo-router';
import { ChangeDisplay, Text } from '@tallyui/components';

export default function ChangeDisplayScreen() {
  return (
    <>
      <Stack.Screen options={{ title: 'ChangeDisplay' }} />
      <ScrollView className="flex-1 bg-background" contentContainerClassName="p-4 gap-6">
        <View className="gap-3">
          <Text className="text-lg font-bold">Change Due</Text>
          <ChangeDisplay change={{ amount: 2653, currency: 'EUR' }} />
        </View>

        <View className="gap-3">
          <Text className="text-lg font-bold">Exact Amount</Text>
          <ChangeDisplay change={{ amount: 0, currency: 'EUR' }} />
        </View>

        <View className="gap-3">
          <Text className="text-lg font-bold">Underpaid (zero change supplied)</Text>
          <ChangeDisplay change={{ amount: 0, currency: 'EUR' }} />
        </View>
      </ScrollView>
    </>
  );
}
