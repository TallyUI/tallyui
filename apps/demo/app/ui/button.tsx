import { ScrollView } from 'react-native';
import { Stack } from 'expo-router';
import { Button, Text, VStack, Icon } from '@tallyui/components';

export default function ButtonScreen() {
  return (
    <>
      <Stack.Screen options={{ title: 'Button' }} />
      <ScrollView className="flex-1 bg-background" contentContainerClassName="p-4 gap-6">
        <VStack className="gap-3">
          <Text className="text-lg font-bold">Variants</Text>
          <Button>
            <Text>Default</Text>
          </Button>
          <Button variant="destructive">
            <Text>Destructive</Text>
          </Button>
          <Button variant="outline">
            <Text>Outline</Text>
          </Button>
          <Button variant="secondary">
            <Text>Secondary</Text>
          </Button>
          <Button variant="ghost">
            <Text>Ghost</Text>
          </Button>
          <Button variant="link">
            <Text>Link</Text>
          </Button>
        </VStack>

        <VStack className="gap-3">
          <Text className="text-lg font-bold">Sizes</Text>
          <Button size="sm">
            <Text>Small</Text>
          </Button>
          <Button size="default">
            <Text>Default</Text>
          </Button>
          <Button size="lg">
            <Text>Large</Text>
          </Button>
          <Button size="icon">
            <Icon>
              <Text>S</Text>
            </Icon>
          </Button>
        </VStack>

        <VStack className="gap-3">
          <Text className="text-lg font-bold">With Icons</Text>
          <Button variant="secondary" size="sm">
            <Icon>
              <Text>+</Text>
            </Icon>
            <Text>Add Item</Text>
          </Button>
          <Button variant="destructive">
            <Icon>
              <Text>X</Text>
            </Icon>
            <Text>Delete</Text>
          </Button>
        </VStack>

        <VStack className="gap-3">
          <Text className="text-lg font-bold">Disabled</Text>
          <Button disabled>
            <Text>Disabled Default</Text>
          </Button>
          <Button variant="destructive" disabled>
            <Text>Disabled Destructive</Text>
          </Button>
          <Button variant="outline" disabled>
            <Text>Disabled Outline</Text>
          </Button>
        </VStack>
      </ScrollView>
    </>
  );
}
