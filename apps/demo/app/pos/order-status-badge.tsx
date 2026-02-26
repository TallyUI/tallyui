import { ScrollView, View } from 'react-native';
import { Stack } from 'expo-router';
import { OrderStatusBadge, Text } from '@tallyui/components';
import type { OrderStatus } from '@tallyui/components';

const statuses: OrderStatus[] = ['pending', 'processing', 'completed', 'refunded', 'cancelled'];

export default function OrderStatusBadgeScreen() {
  return (
    <>
      <Stack.Screen options={{ title: 'OrderStatusBadge' }} />
      <ScrollView className="flex-1 bg-background" contentContainerClassName="p-4 gap-6">
        <View className="gap-3">
          <Text className="text-lg font-bold">All Statuses</Text>
          <View className="gap-2">
            {statuses.map((status) => (
              <View key={status} className="flex-row items-center gap-3">
                <OrderStatusBadge status={status} />
                <Text className="text-sm text-muted-foreground">{status}</Text>
              </View>
            ))}
          </View>
        </View>

        <View className="gap-3">
          <Text className="text-lg font-bold">Inline Usage</Text>
          <View className="flex-row items-center gap-2">
            <Text className="text-sm">Order #1042</Text>
            <OrderStatusBadge status="completed" />
          </View>
        </View>
      </ScrollView>
    </>
  );
}
