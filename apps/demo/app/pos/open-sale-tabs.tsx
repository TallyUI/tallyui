import { useState } from 'react';
import { ScrollView, View } from 'react-native';
import { Stack } from 'expo-router';
import { OpenSaleTabs, Text } from '@tallyui/components';
import type { OpenSale } from '@tallyui/pos';

export default function OpenSaleTabsScreen() {
  const [sales, setSales] = useState<OpenSale[]>(() => {
    const now = Date.now();
    return [
      { id: '1', itemCount: 2, totalMinor: 1683, paidMinor: 0, balanceDueMinor: 1683,
        parkedAt: new Date(now - 5 * 3_600_000).toISOString(), current: false },
      { id: '2', customerName: 'Alice Martin', itemCount: 1, firstItem: 'Beanie', totalMinor: 1800,
        paidMinor: 0, balanceDueMinor: 1800, parkedAt: new Date(now - 20 * 60_000).toISOString(), current: false },
      { id: '3', firstItem: 'Affirm Water Bottle', itemCount: 1, totalMinor: 1683,
        paidMinor: 0, balanceDueMinor: 1683, current: true },
      { id: '4', customerName: 'Sam Lee', itemCount: 3, totalMinor: 4500, paidMinor: 2000,
        balanceDueMinor: 2500, parkedAt: new Date(now - 2 * 3_600_000).toISOString(), current: false },
    ];
  });
  const [blankSales, setBlankSales] = useState<OpenSale[]>(() => sales.slice(0, 2));

  return (
    <>
      <Stack.Screen options={{ title: 'OpenSaleTabs' }} />
      <ScrollView className="flex-1 bg-background" contentContainerClassName="p-4 gap-6">
        <View className="gap-3">
          <Text className="text-lg font-bold">Open sales</Text>
          <View style={{ width: 480 }} className="border border-border">
            <View style={{ height: 120 }} />
            <OpenSaleTabs sales={sales} currency="USD"
              onSelect={(id) => setSales((previous) => previous.map((sale) => ({ ...sale, current: sale.id === id })))}
              onNew={() => setSales((previous) => previous.map((sale) => ({ ...sale, current: false })))} />
          </View>
        </View>
        <View className="gap-3">
          <Text className="text-lg font-bold">Blank cart</Text>
          <View style={{ width: 480 }} className="border border-border">
            <View style={{ height: 120 }} />
            <OpenSaleTabs sales={blankSales} currency="USD"
              onSelect={(id) => setBlankSales((previous) => previous.map((sale) => ({ ...sale, current: sale.id === id })))}
              onNew={() => setBlankSales((previous) => previous.map((sale) => ({ ...sale, current: false })))} />
          </View>
        </View>
      </ScrollView>
    </>
  );
}
