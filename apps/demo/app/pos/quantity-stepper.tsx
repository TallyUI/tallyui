import { useState } from 'react';
import { ScrollView, View } from 'react-native';
import { Stack } from 'expo-router';
import { QuantityStepper, Text } from '@tallyui/components';

export default function QuantityStepperScreen() {
  const [qty, setQty] = useState(1);

  return (
    <>
      <Stack.Screen options={{ title: 'QuantityStepper' }} />
      <ScrollView className="flex-1 bg-background" contentContainerClassName="p-4 gap-6">
        <View className="gap-3">
          <Text className="text-lg font-bold">Default (uncontrolled)</Text>
          <QuantityStepper />
        </View>

        <View className="gap-3">
          <Text className="text-lg font-bold">Controlled</Text>
          <Text className="text-sm text-muted-foreground">Current: {qty}</Text>
          <QuantityStepper quantity={qty} onChangeQuantity={setQty} />
        </View>

        <View className="gap-3">
          <Text className="text-lg font-bold">Custom Range (min=0, max=10)</Text>
          <QuantityStepper min={0} max={10} defaultQuantity={5} />
        </View>

        <View className="gap-3">
          <Text className="text-lg font-bold">At Minimum (min=1)</Text>
          <QuantityStepper defaultQuantity={1} min={1} />
        </View>
      </ScrollView>
    </>
  );
}
