import { ScrollView, View } from 'react-native';
import { Stack } from 'expo-router';
import { DiscountBadge, Text } from '@tallyui/components';

export default function DiscountBadgeScreen() {
  return (
    <>
      <Stack.Screen options={{ title: 'DiscountBadge' }} />
      <ScrollView className="flex-1 bg-background" contentContainerClassName="p-4 gap-6">
        <View className="gap-3">
          <Text className="text-lg font-bold">Discount Badges</Text>
          <View className="flex-row flex-wrap gap-2">
            <DiscountBadge label="10% OFF" />
            <DiscountBadge label="SALE" />
            <DiscountBadge label="-$5.00" />
            <DiscountBadge label="Buy 2 Get 1" />
          </View>
        </View>

        <View className="gap-3">
          <Text className="text-lg font-bold">In Context</Text>
          <View className="gap-2 rounded-lg border border-border p-3">
            <Text className="font-semibold">Espresso Machine Pro</Text>
            <View className="flex-row items-center gap-2">
              <Text className="text-muted-foreground line-through">$599.99</Text>
              <Text className="font-bold">$539.99</Text>
              <DiscountBadge label="10% OFF" />
            </View>
          </View>
        </View>
      </ScrollView>
    </>
  );
}
