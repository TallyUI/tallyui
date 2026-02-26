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
          <ChangeDisplay tendered={50} total={23.47} />
        </View>

        <View className="gap-3">
          <Text className="text-lg font-bold">Exact Amount</Text>
          <ChangeDisplay tendered={23.47} total={23.47} />
        </View>

        <View className="gap-3">
          <Text className="text-lg font-bold">Underpaid (clamped to 0)</Text>
          <ChangeDisplay tendered={10} total={23.47} />
        </View>
      </ScrollView>
    </>
  );
}
