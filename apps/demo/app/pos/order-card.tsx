import { ScrollView, View, Alert } from 'react-native';
import { Stack } from 'expo-router';
import { OrderCard, Text } from '@tallyui/components';

export default function OrderCardScreen() {
  return (
    <>
      <Stack.Screen options={{ title: 'OrderCard' }} />
      <ScrollView className="flex-1 bg-background" contentContainerClassName="p-4 gap-6">
        <View className="gap-3">
          <Text className="text-lg font-bold">Order Cards</Text>
          <OrderCard
            orderNumber="#1042"
            date="Today, 2:30 PM"
            total="$23.47"
            status="completed"
            customerName="Jane Smith"
            onPress={() => Alert.alert('Tapped', 'Order #1042')}
          />
          <OrderCard
            orderNumber="#1041"
            date="Today, 1:15 PM"
            total="$156.00"
            status="processing"
          />
          <OrderCard
            orderNumber="#1040"
            date="Yesterday, 4:45 PM"
            total="$8.99"
            status="refunded"
            customerName="John Doe"
          />
          <OrderCard
            orderNumber="#1039"
            date="Yesterday, 11:00 AM"
            total="$45.50"
            status="pending"
          />
          <OrderCard
            orderNumber="#1038"
            date="Feb 24, 9:30 AM"
            total="$12.00"
            status="cancelled"
            customerName="Bob Wilson"
          />
        </View>
      </ScrollView>
    </>
  );
}
