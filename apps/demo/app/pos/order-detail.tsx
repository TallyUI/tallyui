import { ScrollView, View } from 'react-native';
import { Stack } from 'expo-router';
import { OrderDetail } from '@tallyui/components';

export default function OrderDetailScreen() {
  return (
    <>
      <Stack.Screen options={{ title: 'OrderDetail' }} />
      <ScrollView testID="order-detail-page" className="flex-1 bg-background" contentContainerClassName="p-4">
        <View className="w-full max-w-[560px] self-end border-l border-border bg-background" style={{ height: 760 }}>
          <OrderDetail
            orderNumber="Order #35895" status="completed" meta={['Today · 14:30', 'US Store', 'Brenda Walsh']}
            lineItems={[{ name: 'Dash Digital Watch', quantity: 1, total: '$92.00' }, { name: 'Affirm Water Bottle', quantity: 2, total: '$14.00' }]}
            subtotal="$106.00" discount="-$10.60" couponCodes="SAVE10" shipping="$5.00" shippingMethod="Flat rate"
            fees="$2.00" tax="$11.22" taxLines={[{ label: 'US 10%', amount: '$9.20' }, { label: 'US AL 2%', amount: '$2.02' }]} total="$113.62"
          />
        </View>
      </ScrollView>
    </>
  );
}
