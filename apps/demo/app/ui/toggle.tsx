import { useState } from 'react';
import { ScrollView } from 'react-native';
import { Stack } from 'expo-router';
import { Toggle, Text, VStack, Icon } from '@tallyui/components';

export default function ToggleScreen() {
  const [bold, setBold] = useState(false);
  const [italic, setItalic] = useState(false);

  return (
    <>
      <Stack.Screen options={{ title: 'Toggle' }} />
      <ScrollView className="flex-1 bg-background" contentContainerClassName="p-4 gap-6">
        <VStack className="gap-3">
          <Text className="text-lg font-bold">Default Variant</Text>
          <Toggle pressed={bold} onPressedChange={setBold}>
            <Text>Bold: {bold ? 'On' : 'Off'}</Text>
          </Toggle>
          <Toggle>
            <Text>Uncontrolled</Text>
          </Toggle>
        </VStack>

        <VStack className="gap-3">
          <Text className="text-lg font-bold">Outline Variant</Text>
          <Toggle variant="outline" pressed={italic} onPressedChange={setItalic}>
            <Text>Italic: {italic ? 'On' : 'Off'}</Text>
          </Toggle>
          <Toggle variant="outline">
            <Text>Outline</Text>
          </Toggle>
        </VStack>

        <VStack className="gap-3">
          <Text className="text-lg font-bold">Sizes</Text>
          <Toggle size="sm">
            <Text>Small</Text>
          </Toggle>
          <Toggle size="default">
            <Text>Default</Text>
          </Toggle>
          <Toggle size="lg">
            <Text>Large</Text>
          </Toggle>
        </VStack>

        <VStack className="gap-3">
          <Text className="text-lg font-bold">With Icons</Text>
          <Toggle pressed={bold} onPressedChange={setBold}>
            <Icon><Text>B</Text></Icon>
          </Toggle>
          <Toggle variant="outline" pressed={italic} onPressedChange={setItalic}>
            <Icon><Text>I</Text></Icon>
          </Toggle>
          <Toggle variant="outline">
            <Icon><Text>U</Text></Icon>
          </Toggle>
        </VStack>

        <VStack className="gap-3">
          <Text className="text-lg font-bold">Disabled</Text>
          <Toggle disabled>
            <Text>Disabled Off</Text>
          </Toggle>
          <Toggle disabled defaultPressed>
            <Text>Disabled On</Text>
          </Toggle>
        </VStack>
      </ScrollView>
    </>
  );
}
