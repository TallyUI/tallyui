import { useState } from 'react';
import { ScrollView, View } from 'react-native';
import { Stack } from 'expo-router';
import { CashCountInput, Text } from '@tallyui/components';

export default function CashCountInputScreen() {
  const [total, setTotal] = useState(0);

  return (
    <>
      <Stack.Screen options={{ title: 'CashCountInput' }} />
      <ScrollView className="flex-1 bg-background" contentContainerClassName="p-4 gap-6">
        <View className="gap-3">
          <Text className="text-lg font-bold">Full Denomination Count</Text>
          <Text className="text-sm text-muted-foreground">
            Running total: ${total.toFixed(2)}
          </Text>
          <CashCountInput onChangeTotal={setTotal} />
        </View>

        <View className="gap-3">
          <Text className="text-lg font-bold">Custom Denominations</Text>
          <CashCountInput
            denominations={[
              { label: '$20', value: 20 },
              { label: '$10', value: 10 },
              { label: '$5', value: 5 },
              { label: '$1', value: 1 },
            ]}
          />
        </View>
      </ScrollView>
    </>
  );
}
