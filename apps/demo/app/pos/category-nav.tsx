import { useState } from 'react';
import { ScrollView, View } from 'react-native';
import { Stack } from 'expo-router';
import { CategoryNav, Text } from '@tallyui/components';

const categories = [
  { id: 'all', name: 'All' },
  { id: 'coffee', name: 'Coffee' },
  { id: 'tea', name: 'Tea' },
  { id: 'equipment', name: 'Equipment' },
  { id: 'accessories', name: 'Accessories' },
  { id: 'snacks', name: 'Snacks' },
];

export default function CategoryNavScreen() {
  const [selectedH, setSelectedH] = useState('all');
  const [selectedV, setSelectedV] = useState('coffee');

  return (
    <>
      <Stack.Screen options={{ title: 'CategoryNav' }} />
      <ScrollView className="flex-1 bg-background" contentContainerClassName="p-4 gap-6">
        <View className="gap-3">
          <Text className="text-lg font-bold">Horizontal (default)</Text>
          <Text className="text-sm text-muted-foreground">Selected: {selectedH}</Text>
          <CategoryNav
            categories={categories}
            selectedId={selectedH}
            onSelect={setSelectedH}
          />
        </View>

        <View className="gap-3">
          <Text className="text-lg font-bold">Vertical</Text>
          <Text className="text-sm text-muted-foreground">Selected: {selectedV}</Text>
          <CategoryNav
            categories={categories}
            selectedId={selectedV}
            onSelect={setSelectedV}
            orientation="vertical"
          />
        </View>
      </ScrollView>
    </>
  );
}
