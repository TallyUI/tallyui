import { useState } from 'react';
import { ScrollView, View } from 'react-native';
import { Stack } from 'expo-router';
import { CashTendered, ChangeDisplay, Text } from '@tallyui/components';
import { formatMoney, type Money } from '@tallyui/core';

export default function CashTenderedScreen() {
  const [amount, setAmount] = useState<Money>({ amount: 2347, currency: 'EUR' });
  const total: Money = { amount: 2347, currency: 'EUR' };

  return (
    <>
      <Stack.Screen options={{ title: 'CashTendered' }} />
      <ScrollView className="flex-1 bg-background" contentContainerClassName="p-4 gap-6">
        <View className="gap-3">
          <Text className="text-lg font-bold">Cash Tendered + Change</Text>
          <Text className="text-sm text-muted-foreground">Order total: {formatMoney(total) ?? '—'}</Text>
          <CashTendered
            total={total}
            amount={amount}
            onChangeAmount={setAmount}
          />
          <ChangeDisplay change={{ amount: Math.max(0, amount.amount - total.amount), currency: 'EUR' }} />
        </View>

        <View className="gap-3">
          <Text className="text-lg font-bold">Uncontrolled</Text>
          <CashTendered total={{ amount: 1500, currency: 'EUR' }} />
        </View>

        <View className="gap-3">
          <Text className="text-lg font-bold">Custom Quick Amounts</Text>
          <CashTendered
            total={{ amount: 750, currency: 'EUR' }}
            quickAmounts={[750, 1000, 2000, 5000].map((amount) => ({ amount, currency: 'EUR' }))}
          />
        </View>
      </ScrollView>
    </>
  );
}
