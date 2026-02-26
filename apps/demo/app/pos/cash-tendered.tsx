import { useState } from 'react';
import { ScrollView, View } from 'react-native';
import { Stack } from 'expo-router';
import { CashTendered, ChangeDisplay, Text } from '@tallyui/components';

export default function CashTenderedScreen() {
  const [amount, setAmount] = useState(23.47);
  const total = 23.47;

  return (
    <>
      <Stack.Screen options={{ title: 'CashTendered' }} />
      <ScrollView className="flex-1 bg-background" contentContainerClassName="p-4 gap-6">
        <View className="gap-3">
          <Text className="text-lg font-bold">Cash Tendered + Change</Text>
          <Text className="text-sm text-muted-foreground">Order total: ${total.toFixed(2)}</Text>
          <CashTendered
            total={total}
            amount={amount}
            onChangeAmount={setAmount}
          />
          <ChangeDisplay tendered={amount} total={total} />
        </View>

        <View className="gap-3">
          <Text className="text-lg font-bold">Uncontrolled</Text>
          <CashTendered total={15.00} />
        </View>

        <View className="gap-3">
          <Text className="text-lg font-bold">Custom Quick Amounts</Text>
          <CashTendered
            total={7.50}
            quickAmounts={[7.50, 10, 20, 50]}
          />
        </View>
      </ScrollView>
    </>
  );
}
