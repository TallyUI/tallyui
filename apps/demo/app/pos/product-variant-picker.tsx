import { useState } from 'react';
import { ScrollView, View } from 'react-native';
import { Stack } from 'expo-router';
import { ProductVariantPicker, Text } from '@tallyui/components';

const options = [
  { name: 'Size', values: ['Small', 'Medium', 'Large', 'XL'] },
  { name: 'Color', values: ['Black', 'White', 'Red', 'Navy'] },
];

const singleOption = [
  { name: 'Grind', values: ['Whole Bean', 'Coarse', 'Medium', 'Fine', 'Espresso'] },
];

export default function ProductVariantPickerScreen() {
  const [selected, setSelected] = useState<Record<string, string>>({
    Size: 'Medium',
    Color: 'Black',
  });
  const [grind, setGrind] = useState<Record<string, string>>({});

  return (
    <>
      <Stack.Screen options={{ title: 'ProductVariantPicker' }} />
      <ScrollView className="flex-1 bg-background" contentContainerClassName="p-4 gap-6">
        <View className="gap-3">
          <Text className="text-lg font-bold">Multiple Options</Text>
          <Text className="text-sm text-muted-foreground">
            Selected: {JSON.stringify(selected)}
          </Text>
          <ProductVariantPicker
            options={options}
            selected={selected}
            onSelect={setSelected}
          />
        </View>

        <View className="gap-3">
          <Text className="text-lg font-bold">Single Option</Text>
          <ProductVariantPicker
            options={singleOption}
            selected={grind}
            onSelect={setGrind}
          />
        </View>
      </ScrollView>
    </>
  );
}
