import { View, Text } from 'react-native';
import { Stack, useLocalSearchParams } from 'expo-router';
import { CartPanel, Button } from '@tallyui/components';

export default function CartPanelScreen() {
  const { lines } = useLocalSearchParams<{ lines?: string }>();
  const count = lines ? Number(lines) : 40;
  const items = Array.from({ length: count }, (_, i) => ({ name: `Item ${i + 1}` }));

  return (
    <View className="flex-1 bg-background" testID="cart-panel-screen">
      <Stack.Screen options={{ title: 'CartPanel' }} />
      <CartPanel
        testID="cart-panel"
        className="border border-border"
        items={items}
        renderItem={(item, index) => (
          <View testID={`cart-line-${index}`} className="border-b border-border px-3 py-3">
            <Text>{item.name}</Text>
          </View>
        )}
        emptyState={
          <View testID="empty-state" className="flex-1 items-center justify-center">
            <Text>Cart is empty</Text>
          </View>
        }
        afterItems={
          <View testID="after-items" className="px-3 py-3">
            <Text>Discount chips</Text>
          </View>
        }
        footer={
          <View testID="cart-footer">
            <Button testID="pay-button">
              <Text className="text-primary-foreground">Pay</Text>
            </Button>
          </View>
        }
      />
    </View>
  );
}
